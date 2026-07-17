import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import { google } from 'googleapis';
import crypto from 'crypto';
import User from '../models/User';
import logger from '../utils/logger';

// ======================================================
// Google OAuth2 Helper — creates a FRESH client per request.
// NEVER reuse a single singleton — setCredentials() mutates state
// globally, causing credentials to bleed across concurrent users.
// ======================================================
const GOOGLE_REDIRECT_URI = process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback';

const createOAuth2Client = () =>
  new google.auth.OAuth2(
    process.env.GOOGLE_CALENDAR_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );

import { generateTokens } from '../utils/authHelpers';


/**
 * Register Controller: Adds new user to DB.
 */
export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    // Validate request inputs first
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      res.status(400).json({ success: false, errors: errors.array() });
      return;
    }

    const { name, email, password } = req.body;

    // Validate name is non-empty string
    if (!name || typeof name !== 'string' || name.trim().length < 2) {
      res.status(400).json({ success: false, message: 'Name must be at least 2 characters.' });
      return;
    }

    const emailNormalization = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await User.findOne({ email: emailNormalization });
    if (existingUser) {
      res.status(409).json({ success: false, message: 'Email already registered' });
      return;
    }

    // SECURITY: Role is NEVER accepted from the request body.
    // All self-registered users are always 'traveler'. Admin accounts must be
    // seeded directly in the database by a system administrator.
    const user = await User.create({
      name: name.trim(),
      email: emailNormalization,
      password,
      role: 'traveler',
    });

    const { accessToken, refreshToken } = generateTokens(user.id, user.role);

    // Save refresh token to user profile
    user.refreshToken = refreshToken;
    await user.save();

    // Set refresh token in httpOnly cookie
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production', // true on production HTTPS
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
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
    res.status(500).json({ success: false, message: 'Registration failed. Try again.' });
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
    const emailNormalization = email.toLowerCase().trim();

    // Must explicitly request '+password' because our schema default-excludes it
    const user = await User.findOne({ email: emailNormalization }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      // Return generic message (don't say if email or password was wrong to prevent brute-forcing)
      res.status(401).json({ success: false, message: 'Invalid email or password' });
      return;
    }

    if (role && user.role !== role) {
      const targetRoleName = role === 'admin' ? 'Admin' : 'Traveler';
      const actualRoleName = user.role === 'admin' ? 'Admin' : 'Traveler';
      res.status(401).json({
        success: false,
        message: `This account does not have access for ${targetRoleName} login. Please use the ${actualRoleName} login.`
      });
      return;
    }

    const { accessToken, refreshToken } = generateTokens(user.id, user.role);

    user.refreshToken = refreshToken;
    await user.save();

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
    res.status(500).json({ success: false, message: 'Login failed. Try again.' });
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
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as any;
    const user = await User.findById(decoded.userId);

    // Guard: Refresh token validation against database value (protects logouts/revoked sessions)
    if (!user || user.refreshToken !== token) {
      res.status(401).json({ success: false, message: 'Active session not found. Please log in again.' });
      return;
    }

    const { accessToken, refreshToken: newRefreshToken } = generateTokens(user.id, user.role);

    user.refreshToken = newRefreshToken;
    await user.save();

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
    res.status(401).json({ success: false, message: 'Session expired. Please log in.' });
  }
};

/**
 * Logout Controller: Revokes refresh token in database and cleans client cookies.
 */
export const logout = async (req: Request, res: Response): Promise<void> => {
  try {
    const token = req.cookies?.refreshToken;

    if (token) {
      // Invalidate the session token in the database
      await User.findOneAndUpdate({ refreshToken: token }, { $unset: { refreshToken: 1 } });
    }

    res.clearCookie('refreshToken');
    res.json({ success: true, message: 'Logged out successfully' });
  } catch (error: any) {
    logger.error(`Logout error: ${error.message}`);
    res.status(500).json({ success: false, message: 'Logout failed.' });
  }
};

/**
 * Google Sign-In Init (PUBLIC) — Generates a Google OAuth2 URL for user authentication.
 * Scopes: openid + email + profile (NOT calendar — that's a separate flow).
 * State carries JSON so the callback knows this is a sign-in attempt.
 */
export const googleAuthLogin = (req: Request, res: Response): void => {
  if (!process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CALENDAR_CLIENT_ID.includes('REPLACE_WITH')) {
    res.status(503).json({
      success: false,
      message: 'Google Sign-In is not configured on this server. Ask the admin to add GOOGLE_CALENDAR_CLIENT_ID to .env.',
    });
    return;
  }

  const mode = req.query.mode === 'register' ? 'register' : 'login';
  const state = Buffer.from(JSON.stringify({ type: mode })).toString('base64');
  // Create a fresh client per request — never use a singleton here
  const client = createOAuth2Client();
  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    // 'consent' forces Google to always show the full account picker,
    // preventing cached sessions from silently signing in the wrong account.
    prompt: 'consent',
    state,
  });

  logger.info('Google Sign-In URL generated');
  res.json({ success: true, authUrl });
};

/**
 * Google Calendar OAuth Init (PROTECTED) — Links an authenticated user's Google Calendar.
 * Requires the user to already be logged in (authenticate middleware).
 */
export const googleOAuthInit = (req: Request, res: Response): void => {
  if (!process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CALENDAR_CLIENT_ID.includes('REPLACE_WITH')) {
    res.status(503).json({ success: false, message: 'Google Calendar integration is not configured. Add GOOGLE_CALENDAR_CLIENT_ID to .env.' });
    return;
  }

  const { tripId } = req.query;
  const state = Buffer.from(JSON.stringify({
    type: 'calendar',
    userId: req.user?.userId,
    tripId: tripId || undefined
  })).toString('base64');
  // Create a fresh client per request
  const client = createOAuth2Client();
  const authUrl = client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    prompt: 'consent',
    state,
  });

  logger.info('Google Calendar OAuth redirect initiated', { userId: req.user?.userId, tripId });
  res.json({ success: true, authUrl });
};

/**
 * Google OAuth Unified Callback (PUBLIC) — Handles redirect from Google.
 * Reads the `state` param to determine the flow:
 *   • type="login"    → Find or create user, issue JWT, redirect to /auth/callback on client
 *   • type="calendar" → Store tokens on the user record, redirect to /dashboard
 */
export const googleOAuthCallback = async (req: Request, res: Response): Promise<void> => {
  const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
  const { code, state: rawState, error } = req.query;

  // Decode the state JSON blob
  let statePayload: { type: 'login' | 'register' | 'calendar'; userId?: string; tripId?: string } = { type: 'login' };
  try {
    statePayload = JSON.parse(Buffer.from(rawState as string, 'base64').toString());
  } catch {
    logger.warn('Google OAuth callback received invalid state param');
  }

  const { type, userId, tripId } = statePayload;

  // Handle user denial
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
    // Create a fresh per-request OAuth2 client.
    // This is CRITICAL — using a singleton here would mutate credentials
    // globally and cause subsequent users to inherit previous users' sessions.
    const oauth2Client = createOAuth2Client();
    const { tokens } = await oauth2Client.getToken(code as string);
    oauth2Client.setCredentials(tokens);

    // ============================================================
    // FLOW A: Google Sign-In — authenticate user
    // ============================================================
    if (type === 'login' || type === 'register') {
      // Fetch verified profile from Google
      const oauth2Service = google.oauth2({ version: 'v2', auth: oauth2Client });
      const { data: profile } = await oauth2Service.userinfo.get();

      if (!profile.email || !profile.id) {
        logger.error('Google Sign-In returned incomplete profile', { profile });
        const dest = type === 'register' ? 'register' : 'login';
        res.redirect(`${clientUrl}/${dest}?google_auth=error`);
        return;
      }

      // Find existing user by Google ID or email (link account if user registered manually before)
      let user = await User.findOne({
        $or: [{ googleId: profile.id }, { email: profile.email.toLowerCase() }],
      });

      if (user && user.role === 'admin') {
        logger.warn('Admin attempted to log in via Google OAuth', { email: user.email });
        const dest = type === 'register' ? 'register' : 'login';
        res.redirect(`${clientUrl}/${dest}?google_auth=error&message=Admins+must+login+manually+using+manual+login.`);
        return;
      }

      if (user && type === 'register') {
        logger.info('Google Registration blocked: Account already exists', { email: profile.email });
        res.redirect(`${clientUrl}/register?google_auth=error&message=An+account+with+this+Google+email+already+exists.+Please+login+instead.`);
        return;
      }

      if (!user) {
        if (type === 'login') {
          logger.info('Google Sign-In blocked: Account not found in database', { email: profile.email });
          res.redirect(`${clientUrl}/login?google_auth=error&message=No+account+found+with+this+Google+email.+Please+register+first.`);
          return;
        }

        // First-time Google Sign-In: create a new user account
        // Use a cryptographically random password hash — the user can never know this password
        const randomPassword = crypto.randomBytes(32).toString('hex');
        user = await User.create({
          name: profile.name || profile.email.split('@')[0],
          email: profile.email.toLowerCase(),
          password: randomPassword,
          role: 'traveler',
          googleId: profile.id,
          googleAccessToken: tokens.access_token || '',
          googleRefreshToken: tokens.refresh_token || '',
        });
        logger.info('New user created via Google Sign-In', { email: profile.email });
      } else {
        // Existing user: link Google ID if not already linked
        if (!user.googleId) user.googleId = profile.id;
        user.googleAccessToken = tokens.access_token || '';
        if (tokens.refresh_token) user.googleRefreshToken = tokens.refresh_token;
      }

      // Issue JWT session tokens
      const { accessToken, refreshToken } = generateTokens(user.id, user.role);
      user.refreshToken = refreshToken;
      await user.save();

      logger.info('Google Sign-In successful', { userId: user.id, email: user.email });

      // Set the refreshToken as an httpOnly cookie BEFORE redirecting.
      // This is critical: App.tsx runs restoreSession() on every mount, which
      // calls /auth/refresh. Without this cookie the refresh returns 401,
      // triggering logout() and bouncing the user back to /login immediately
      // after a successful Google sign-in.
      res.cookie('refreshToken', refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax', // 'lax' (not 'strict') is required for cross-origin redirects
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      });

      // Redirect to a client-side callback page that will store the token
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

    // ============================================================
    // FLOW B: Google Calendar Link — store tokens on existing user
    // ============================================================
    if (!userId) {
      const dest = tripId ? `/dashboard/plan?tripId=${tripId}&google_auth=error` : '/dashboard?google_auth=error';
      res.redirect(`${clientUrl}${dest}`);
      return;
    }

    const updateData: any = {
      googleCalendarAccessToken: tokens.access_token || '',
    };
    if (tokens.refresh_token) {
      updateData.googleCalendarRefreshToken = tokens.refresh_token;
    }

    await User.findByIdAndUpdate(userId, updateData);

    logger.info('Google Calendar tokens stored successfully', { userId });
    const dest = tripId ? `/dashboard/plan?tripId=${tripId}&google_auth=success` : '/dashboard?google_auth=success';
    res.redirect(`${clientUrl}${dest}`);

  } catch (err: any) {
    logger.error('Google OAuth callback failed', { error: err.message, type });
    if (type === 'login') {
      res.redirect(`${clientUrl}/login?google_auth=error`);
    } else {
      const dest = tripId ? `/dashboard/plan?tripId=${tripId}&google_auth=error` : '/dashboard?google_auth=error';
      res.redirect(`${clientUrl}${dest}`);
    }
  }
};
