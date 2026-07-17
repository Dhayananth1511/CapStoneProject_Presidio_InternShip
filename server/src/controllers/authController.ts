import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import logger from '../utils/logger';
import * as authService from '../services/authService';

/**
 * Register Controller: Adds new user to DB.
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    const { name, email, password } = req.body;

    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      res.status(400).json({ success: false, message: 'Name must be at least 2 characters.' });
      return;
    }

    const { user, accessToken, refreshToken } = await authService.registerUser(name, email, password);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({
      success: true,
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        hasCalendarLinked: !!user.googleCalendarRefreshToken,
      },
    });
  } catch (error: any) {
    logger.error(`Register operational error: ${error.message}`);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, message: error.message || 'Registration failed.' });
  }
};

/**
 * Login Controller: Verifies credentials, returns access token, sets cookie.
 */
export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    const { email, password, role } = req.body;

    const { user, accessToken, refreshToken } = await authService.authenticateUser(email, password, role);

    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    logger.info(`User login success: ${user.email} (Id: ${user.id})`);

    res.json({
      success: true,
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        hasCalendarLinked: !!user.googleCalendarRefreshToken,
      },
    });
  } catch (error: any) {
    logger.error(`Login operational error: ${error.message}`);
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, message: error.message || 'Login failed.' });
  }
};

/**
 * Refresh Session Controller: Silent cookie-based access token replenishment.
 */
export const refresh = async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies?.refreshToken;

  if (!token) {
    res.status(401).json({ success: false, message: 'Refresh token missing. Please sign in.' });
    return;
  }

  try {
    const { user, accessToken, newRefreshToken } = await authService.refreshUserSession(token);

    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({
      success: true,
      accessToken,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        hasCalendarLinked: !!user.googleCalendarRefreshToken,
      },
    });
  } catch (error: any) {
    logger.warn(`Session refresh failed: ${error.message}`);
    const statusCode = error.statusCode || 401;
    res.status(statusCode).json({ success: false, message: error.message || 'Session expired.' });
  }
};

/**
 * Logout Controller: Revokes refresh token in database and cleans client cookies.
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.cookies?.refreshToken;
    await authService.invalidateUserSession(token);

    res.clearCookie('refreshToken');
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error: any) {
    logger.error(`Logout error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Logout failed.' });
  }
};

/**
 * Google Sign-In Init (PUBLIC)
 */
export const googleAuthLogin = (req: Request, res: Response): void => {
  try {
    const mode = req.query.mode === 'register' ? 'register' : 'login';
    const authUrl = authService.generateGoogleAuthLoginUrl(mode);

    logger.info('Google Sign-In URL generated');
    res.json({ success: true, authUrl });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, message: error.message });
  }
};

/**
 * Google Calendar OAuth Init (PROTECTED)
 */
export const googleOAuthInit = (req: Request, res: Response): void => {
  try {
    const { tripId } = req.query;
    const authUrl = authService.generateGoogleCalendarInitUrl(req.user!.userId, tripId as string);

    logger.info('Google Calendar OAuth redirect initiated', { userId: req.user?.userId, tripId });
    res.json({ success: true, authUrl });
  } catch (error: any) {
    const statusCode = error.statusCode || 500;
    res.status(statusCode).json({ success: false, message: error.message });
  }
};

/**
 * Google OAuth Unified Callback (PUBLIC)
 */
export const googleOAuthCallback = async (req: Request, res: Response): Promise<void> => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const { code, state: rawState, error } = req.query;

  // Pre-decode state to get type and tripId for failed-step redirects
  let type: 'login' | 'register' | 'calendar' = 'login';
  let tripId: string | undefined;
  try {
    if (rawState) {
      const decodedPayload = JSON.parse(Buffer.from(rawState as string, 'base64').toString());
      type = decodedPayload.type;
      tripId = decodedPayload.tripId;
    }
  } catch {
    // fallback defaults
  }

  if (error) {
    logger.warn('Google OAuth denied by user', { error, type });
    if (type === 'login') {
      res.redirect(`${clientUrl}/login?google_auth=denied`);
    } else if (type === 'register') {
      res.redirect(`${clientUrl}/register?google_auth=denied`);
    } else {
      const dest = tripId ? `/dashboard/plan?tripId=${tripId}&google_auth=denied` : '/dashboard?google_auth=denied';
      res.redirect(`${clientUrl}${dest}`);
    }
    return;
  }

  if (!code) {
    const dest = type === 'register' ? 'register' : 'login';
    res.redirect(`${clientUrl}/${dest}?google_auth=error`);
    return;
  }

  try {
    const result = await authService.handleGoogleOAuthCallback(code as string, rawState as string);

    if (result.type === 'login' || result.type === 'register') {
      const { user, accessToken, refreshToken } = result;

      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', // cross-origin redirect compatible
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      const params = new URLSearchParams({
        accessToken,
        userId: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
        hasCalendarLinked: String(!!user.googleCalendarRefreshToken),
      });
      res.redirect(`${clientUrl}/auth/callback?${params.toString()}`);
      return;
    }

    // Calendar linked redirect
    const dest = result.tripId
      ? `/dashboard/plan?tripId=${result.tripId}&google_auth=success`
      : '/dashboard?google_auth=success';
    res.redirect(`${clientUrl}${dest}`);
  } catch (err: any) {
    logger.error('Google OAuth callback failed', { error: err.message, type });
    if (type === 'login') {
      res.redirect(`${clientUrl}/login?google_auth=error&message=${encodeURIComponent(err.message || '')}`);
    } else if (type === 'register') {
      res.redirect(`${clientUrl}/register?google_auth=error&message=${encodeURIComponent(err.message || '')}`);
    } else {
      const dest = tripId ? `/dashboard/plan?tripId=${tripId}&google_auth=error` : '/dashboard?google_auth=error';
      res.redirect(`${clientUrl}${dest}`);
    }
  }
};
