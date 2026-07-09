import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

/**
 * Attaches a unique identification code to each incoming HTTP request.
 * Useful for debugging and log correlation.
 */
export const requestId = (req: Request, res: Response, next: NextFunction): void => {
  const reqId = uuidv4();
  
  // Assign to custom request property
  (req as any).requestId = reqId;

  // Send back in response header so client apps can log it if they encounter errors
  res.setHeader('X-Request-Correlation-ID', reqId);
  next();
};
