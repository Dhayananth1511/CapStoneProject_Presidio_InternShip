import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

/**
 * Express Global Error Post-Processor.
 * Catches all bubble-up errors and sends clean responses.
 */
export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const reqId = (req as any).requestId || 'N/A';

  // Log error using Winston structures
  logger.error({
    message: err.message || 'An unhandled server crash occurred',
    stack: err.stack,
    requestId: reqId,
    path: req.path,
    method: req.method,
  });

  const statusCode = err.status || 500;
  
  // Guard clause: in production do NOT expose backend stack traces to public eyes
  const standardMessage = process.env.NODE_ENV === 'production' 
    ? 'An unexpected error occurred on our end. Please try again later.'
    : err.message;

  res.status(statusCode).json({
    success: false,
    message: standardMessage,
    requestId: reqId,
  });
};
