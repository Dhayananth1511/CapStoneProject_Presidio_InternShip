import jwt from 'jsonwebtoken';

/**
 * Signs both JWT Access and Refresh tokens for a given user session.
 */
export const generateTokens = (userId: string, role: string): { accessToken: string; refreshToken: string } => {
  const accessToken = jwt.sign(
    { userId, role },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m' } as jwt.SignOptions
  );

  const refreshToken = jwt.sign(
    { userId, role },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d' } as jwt.SignOptions
  );

  return { accessToken, refreshToken };
};
