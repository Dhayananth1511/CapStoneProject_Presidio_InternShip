import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import User from '../models/User';
import logger from '../utils/logger';

// Helper: Signs Access & Refresh tokens
const generateTokens = (userId: string, role: string) => {
  const accessToken = jwt.sign(
    { userId, role },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' }
  );

  const refreshToken = jwt.sign(
    { userId, role },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d' }
  );

  return { accessToken, refreshToken };
};

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

    const emailNormalization = email.toLowerCase().trim();

    // Check if user already exists
    const existingUser = await User.findOne({ email: emailNormalization });
    if (existingUser) {
      res.status(409).json({ success: false, message: 'Email already registered' });
      return;
    }

    // Create user. Mongoose will automatically trigger password hashing hook
    const user = await User.create({
      name,
      email: emailNormalization,
      password,
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

    const { email, password } = req.body;
    const emailNormalization = email.toLowerCase().trim();

    // Must explicitly request '+password' because our schema default-excludes it
    const user = await User.findOne({ email: emailNormalization }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      // Return generic message (don't say if email or password was wrong to prevent brute-forcing)
      res.status(401).json({ success: false, message: 'Invalid email or password' });
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

    res.json({ success: true, accessToken });
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
