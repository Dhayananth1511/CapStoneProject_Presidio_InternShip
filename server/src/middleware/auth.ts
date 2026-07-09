import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import logger from '../utils/logger';

interface JwtPayload {
  userId: string;
  role: 'traveler' | 'admin';
}

// Extend official Express Request type to include user auth payload
declare global {
  namespace Express {
    interface Request {
      user?: {
        userId: string;
        role: 'traveler' | 'admin';
      };
    }
  }
}

/**
 * Authentication Guard: Verifies token signature and expiration.
 */
export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;

  // Expecting format: "Bearer <token>"
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ message: 'Access denied. No token provided.' });
    return;
  }

  const token = authHeader.split(' ')[1];

  try {
    const secret = process.env.JWT_ACCESS_SECRET!;
    const decoded = jwt.verify(token, secret) as JwtPayload;

    // Attach user payload to the request object
    req.user = {
      userId: decoded.userId,
      role: decoded.role,
    };

    next(); // Pass control to the next middleware or router controller
  } catch (error: any) {
    logger.warn(`JWT verification failed: ${error.message}`);
    res.status(401).json({ message: 'Auth session expired or invalid. Please re-login.' });
  }
};

/**
 * Authorization Guard: Restricts critical routes to Admin roles only.
 */
export const authorizeAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (!req.user || req.user.role !== 'admin') {
    res.status(403).json({ message: 'Forbidden. Admin privileges required.' });
    return;
  }
  next();
};
