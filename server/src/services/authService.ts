import jwt from 'jsonwebtoken';
import { google } from 'googleapis';
import crypto from 'crypto';
import User from '../models/User';
import logger from '../utils/logger';
import { generateTokens } from '../utils/authHelpers';

const GOOGLE_REDIRECT_URI = process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'http://localhost:5000/api/auth/google/callback';

const createOAuth2Client = () =>
  new google.auth.OAuth2(
    process.env.GOOGLE_CALENDAR_CLIENT_ID,
    process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
    GOOGLE_REDIRECT_URI
  );

export const registerUser = async (name: string, email: string, password: any) => {
  const emailNormalization = email.toLowerCase().trim();

  // Check if user already exists
  const existingUser = await User.findOne({ email: emailNormalization });
  if (existingUser) {
    const err = new Error('Email already registered');
    (err as any).statusCode = 409;
    throw err;
  }

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

  return { user, accessToken, refreshToken };
};

export const authenticateUser = async (email: string, password: any, role?: string) => {
  const emailNormalization = email.toLowerCase().trim();

  // Must explicitly request '+password' because our schema default-excludes it
  const user = await User.findOne({ email: emailNormalization }).select('+password');

  if (!user || !(await user.comparePassword(password))) {
    const err = new Error('Invalid email or password');
    (err as any).statusCode = 401;
    throw err;
  }

  if (role && user.role !== role) {
    const targetRoleName = role === 'admin' ? 'Admin' : 'Traveler';
    const actualRoleName = user.role === 'admin' ? 'Admin' : 'Traveler';
    const err = new Error(`This account does not have access for ${targetRoleName} login. Please use the ${actualRoleName} login.`);
    (err as any).statusCode = 401;
    throw err;
  }

  const { accessToken, refreshToken } = generateTokens(user.id, user.role);

  user.refreshToken = refreshToken;
  await user.save();

  return { user, accessToken, refreshToken };
};

export const refreshUserSession = async (token: string) => {
  const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as any;
  const user = await User.findById(decoded.userId);

  if (!user || user.refreshToken !== token) {
    const err = new Error('Active session not found. Please log in again.');
    (err as any).statusCode = 401;
    throw err;
  }

  const { accessToken, refreshToken: newRefreshToken } = generateTokens(user.id, user.role);

  user.refreshToken = newRefreshToken;
  await user.save();

  return { user, accessToken, newRefreshToken };
};

export const invalidateUserSession = async (token: string) => {
  if (token) {
    await User.findOneAndUpdate({ refreshToken: token }, { $unset: { refreshToken: 1 } });
  }
};

export const generateGoogleAuthLoginUrl = (mode: string) => {
  if (!process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CALENDAR_CLIENT_ID.includes('REPLACE_WITH')) {
    const err = new Error('Google Sign-In is not configured on this server. Ask the admin to add GOOGLE_CALENDAR_CLIENT_ID to .env.');
    (err as any).statusCode = 503;
    throw err;
  }

  const state = Buffer.from(JSON.stringify({ type: mode })).toString('base64');
  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: [
      'openid',
      'https://www.googleapis.com/auth/userinfo.email',
      'https://www.googleapis.com/auth/userinfo.profile',
    ],
    prompt: 'consent',
    state,
  });
};

export const generateGoogleCalendarInitUrl = (userId: string, tripId?: string) => {
  if (!process.env.GOOGLE_CALENDAR_CLIENT_ID || process.env.GOOGLE_CALENDAR_CLIENT_ID.includes('REPLACE_WITH')) {
    const err = new Error('Google Calendar integration is not configured. Add GOOGLE_CALENDAR_CLIENT_ID to .env.');
    (err as any).statusCode = 503;
    throw err;
  }

  const state = Buffer.from(JSON.stringify({
    type: 'calendar',
    userId,
    tripId: tripId || undefined
  })).toString('base64');

  const client = createOAuth2Client();
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar.events'],
    prompt: 'consent',
    state,
  });
};

export const handleGoogleOAuthCallback = async (code: string, rawState: string) => {
  let statePayload: { type: 'login' | 'register' | 'calendar'; userId?: string; tripId?: string } = { type: 'login' };
  try {
    statePayload = JSON.parse(Buffer.from(rawState, 'base64').toString());
  } catch {
    logger.warn('Google OAuth callback received invalid state param');
  }

  const { type, userId, tripId } = statePayload;

  const oauth2Client = createOAuth2Client();
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  if (type === 'login' || type === 'register') {
    const oauth2Service = google.oauth2({ version: 'v2', auth: oauth2Client });
    const { data: profile } = await oauth2Service.userinfo.get();

    if (!profile.email || !profile.id) {
      const err = new Error('Google Sign-In returned incomplete profile');
      (err as any).statusCode = 400;
      throw err;
    }

    let user = await User.findOne({
      $or: [{ googleId: profile.id }, { email: profile.email.toLowerCase() }],
    });

    if (user && user.role === 'admin') {
      const err = new Error('Admins must login manually using manual login.');
      (err as any).statusCode = 400;
      throw err;
    }

    if (user && type === 'register') {
      const err = new Error('An account with this Google email already exists. Please login instead.');
      (err as any).statusCode = 400;
      throw err;
    }

    if (!user) {
      if (type === 'login') {
        const err = new Error('No account found with this Google email. Please register first.');
        (err as any).statusCode = 400;
        throw err;
      }

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
    } else {
      if (!user.googleId) user.googleId = profile.id;
      user.googleAccessToken = tokens.access_token || '';
      if (tokens.refresh_token) user.googleRefreshToken = tokens.refresh_token;
    }

    const { accessToken, refreshToken } = generateTokens(user.id, user.role);
    user.refreshToken = refreshToken;
    await user.save();

    return { type, user, accessToken, refreshToken, tripId };
  }

  // Calendar Link flow
  if (!userId) {
    const err = new Error('User context missing for calendar link');
    (err as any).statusCode = 400;
    throw err;
  }

  const updateData: any = {
    googleCalendarAccessToken: tokens.access_token || '',
  };
  if (tokens.refresh_token) {
    updateData.googleCalendarRefreshToken = tokens.refresh_token;
  }

  await User.findByIdAndUpdate(userId, updateData);

  return { type, userId, tripId };
};
