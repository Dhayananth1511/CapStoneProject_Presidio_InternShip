import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists
const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Define the log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }), // Include stack trace on errors
  winston.format.json() // Output logs as JSON objects
);

// Create the logger instance
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: { service: 'travel-planner-service' },
  transports: [
    // We log to the console. In Docker containers, stdout/stderr is automatically
    // captured and sent to AWS CloudWatch or standard log collectors.
    new winston.transports.Console({
      format: process.env.NODE_ENV !== 'production'
        ? winston.format.combine(
            winston.format.colorize(), // Colorize levels in local console
            winston.format.simple() // Plain text for dev convenience
          )
        : logFormat
    }),
    // Log to a local file for admin retrieval dashboards
    new winston.transports.File({
      filename: path.join(logsDir, 'app.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true,
      format: logFormat
    })
  ]
});

export default logger;
