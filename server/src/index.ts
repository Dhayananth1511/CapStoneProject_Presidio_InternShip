import 'dotenv/config'; // Loads .env first before anything else runs
// Force nodemon restart to load updated mongoose schemas (force reload: 3)
import dns from 'dns';

// Resolve querySrv ECONNREFUSED by using public DNS servers in development mode
if (process.env.NODE_ENV !== 'production') {
  dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);
}

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';

import connectDB from './config/db';
import logger from './utils/logger';
import { requestId } from './middleware/requestId';
import { errorHandler } from './middleware/errorHandler';
import authRoutes from './routes/authRoutes';
import tripRoutes from './routes/tripRoutes';
import adminRoutes from './routes/adminRoutes';

const app = express();

// ==========================================
// SECURITY MIDDLEWARES
// ==========================================

// Helmet sets HTTP security headers to protect against exploit injections
app.use(helmet());

// Trust the first proxy (CloudFront) — without this, express-rate-limit sees
// the CloudFront egress IP for every user and incorrectly rate-limits all at once.
app.set('trust proxy', 1);

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
  const mongoose = (await import('mongoose')).default;
  const isHealthy = mongoose.connection.readyState === 1;
  res.status(isHealthy ? 200 : 503).json({
    success: isHealthy,
    status: isHealthy ? 'healthy' : 'disconnected',
  });
});

// ==========================================
// ROUTES
// ==========================================
app.use('/api/auth', authRoutes);
app.use('/api/trips', tripRoutes);
app.use('/api/admin', adminRoutes);

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
    // Connect MongoDB
    await connectDB();

    // Bind Listener port
    app.listen(PORT, () => {
      logger.info(`Server backend bootstrapped on Port ${PORT} in ${process.env.NODE_ENV} mode.`);
    });
  } catch (error: any) {
    logger.error(`Critical Server Startup failure: ${error.message}`);
    process.exit(1);
  }
};

startServer();
