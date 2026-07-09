import winston from 'winston';

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
    })
  ]
});

export default logger;
