import 'dotenv/config'; // Loads .env first before anything else runs
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';

import connectDB from './config/db';
import redis from './config/redis';
import logger from './utils/logger';
import { requestId } from './middleware/requestId';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/authRoutes';

const app = express();

// ==========================================
// SECURITY MIDDLEWARES
// ==========================================

// Helmet sets HTTP security headers to protect against exploit injections
app.use(helmet());

// CORS config: permit only incoming traffic from our client app
const clientUrl = process.env.CLIENT_URL || 'http://localhost:5173';
app.use(
  cors({
    origin: clientUrl,
    credentials: true, // Crucial! Allows httpOnly refresh cookies to pass through CORS
  })
);

// Rate limiter: 100 calls per 15 minutes per IP address
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: {
    success: false,
    message: 'Too many requests from this IP. Please try again after 15 minutes.',
  },
});
app.use(limiter);

// ==========================================
// UTILITY MIDDLEWARES
// ==========================================
app.use(express.json({ limit: '10kb' })); // Parsers JSON payload body limit size to prevent Denial of Service attacks
app.use(cookieParser()); // Read cookies for JWT validation
app.use(requestId); // Attaches Request ID trace logs

// Morgan HTTP request logging — pipes directly to Winston log transport
app.use(
  morgan('combined', {
    stream: {
      write: (message: string) => logger.info(message.trim()),
    },
  })
);

// ==========================================
// HEALTH PORTS (AWS Load Balancer probes)
// ==========================================
app.get('/health', (_req, res) => {
  res.json({ success: true, status: 'ok', environment: process.env.NODE_ENV });
});

app.get('/health/db', async (_req, res) => {
  const mongoose = await import('mongoose');
  const isHealthy = mongoose.connection.readyState === 1;
  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    status: isHealthy ? 'healthy' : 'disconnected',
  });
});

app.get('/health/cache', async (_req, res) => {
  try {
    await redis.ping();
    res.json({ success: true, status: 'healthy' });
  } catch (error) {
    res.status(503).json({ success: false, status: 'unhealthy' });
  }
});

// ==========================================
// ROUTES
// ==========================================
app.use('/api/auth', authRoutes);

// (NOTE: Trip and Admin routes will be created on Day 2 and mounted here!)

// ==========================================
// UNMAPPED ROUTE FALLBACK (404)
// ==========================================
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Route not found: ${req.method} ${req.path}` });
});

// ==========================================
// GLOBAL ERROR HANDLER (MUST BE LAST)
// ==========================================
app.use(errorHandler);

// ==========================================
// SERVER BOOTSTRAP
// ==========================================
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    // 1. Connect MongoDB
    await connectDB();

    // 2. Connect Redis cache
    await redis.connect();

    // 3. Bind Listener port
    app.listen(PORT, () => {
      logger.info(`Server backend bootstrapped on Port ${PORT} in ${process.env.NODE_ENV} mode.`);
    });
  } catch (error: any) {
    logger.error(`Critical Server Startup failure: ${error.message}`);
    process.exit(1);
  }
};

startServer();
