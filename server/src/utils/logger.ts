import winston from 'winston';
import path from 'path';
import fs from 'fs';

// Ensure logs directory exists and add local file transport if possible
const logsDir = path.join(process.cwd(), 'logs');
let fileLogAvailable = false;
try {
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }
  fileLogAvailable = true;
} catch (err) {
  console.error('Failed to create logs directory, proceeding with console logging only:', err);
}

// Define the log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const transports: winston.transport[] = [
  // We log to the console. In Docker containers, stdout/stderr is automatically
  // captured and sent to AWS CloudWatch or standard log collectors.
  new winston.transports.Console({
    format: process.env.NODE_ENV !== 'production'
      ? winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      : logFormat
  })
];

if (fileLogAvailable) {
  transports.push(
    // Log to a local file for admin retrieval dashboards
    new winston.transports.File({
      filename: path.join(logsDir, 'app.log'),
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true,
      format: logFormat
    })
  );
}

// Create the logger instance
const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: logFormat,
  defaultMeta: { service: 'travel-planner-service' },
  transports
});

export default logger;
