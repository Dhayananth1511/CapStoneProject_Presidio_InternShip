# Travel Planner AI Agent — Full Implementation Plan (3 Days)

> **You are a 0% knowledge dev. I will tell you EXACTLY what to type, where, and WHY.**
> Every file, every folder, every command — no skipping steps.

---

## Tech Stack Quick Reference

| Layer | What | Why |
|---|---|---|
| Frontend | React (TypeScript) + Vite + Tailwind + TanStack Query + Zustand + Chart.js | Fast SPA, type-safe, modern state management |
| Backend | Node.js + Express (MVC pattern) | Industry-standard REST API server |
| AI | LangChain JS + Groq LLM API | Free LLM inference, agent orchestration framework |
| MCP | Custom MCP Servers (Weather, Maps, Transit, Booking, Calendar) | Standardized tool interface, agents stay portable |
| DB | MongoDB Atlas (M0 free) + Redis (self-hosted in Docker) | Primary storage + in-memory API cache |
| Auth | JWT (access 15m) + bcrypt + httpOnly refresh cookie | Industry-standard security |
| DevOps | Docker + Docker Compose + Terraform + GitHub Actions | Container deploy, IaC, automated CI/CD |
| AWS | EC2 (t2.micro) + S3 + CloudFront + SSM + CloudWatch | Free tier cloud deployment |

---

## Pre-Work Checklist (Do Before Day 1 Starts)

Create these free accounts NOW — you'll need them on Day 3:

- [ ] [GitHub](https://github.com) — for repo + CI/CD
- [ ] [MongoDB Atlas](https://cloud.mongodb.com) — free M0 cluster
- [ ] [Groq](https://console.groq.com) — free API key (Llama 3)
- [ ] [Google Cloud Console](https://console.cloud.google.com) — Maps + Calendar API keys
- [ ] [AWS Console](https://aws.amazon.com/free) — EC2 + S3 + SSM
- [ ] Install locally: `Node.js 20+`, `Git`, `Docker Desktop`, `VS Code`, `Terraform CLI`

---

## Folder Structure (What We're Building)

```
travel-planner/
├── client/                  # React frontend (Vite + TypeScript + Tailwind)
│   ├── src/
│   │   ├── components/      # Reusable UI pieces
│   │   ├── pages/           # Route-level page components
│   │   ├── hooks/           # TanStack Query hooks
│   │   ├── store/           # Zustand global state
│   │   ├── lib/             # Axios instance, utils
│   │   ├── schemas/         # Zod validation schemas
│   │   └── types/           # TypeScript interfaces
│   └── ...
│
├── server/                  # Express backend (MVC architecture)
│   ├── src/
│   │   ├── config/          # DB connect, Redis connect
│   │   ├── controllers/     # HTTP request handlers
│   │   ├── middleware/       # Auth, rate-limit, error handler
│   │   ├── models/          # Mongoose schemas
│   │   ├── routes/          # Express route definitions
│   │   ├── services/        # Business logic (Planner Service, Analytics)
│   │   ├── agents/          # All 11 AI agents
│   │   ├── mcp-servers/     # 5 MCP tool servers
│   │   └── utils/           # Winston logger, retry helper
│   └── ...
│
├── infrastructure/          # Terraform IaC
│   ├── main.tf
│   ├── variables.tf
│   └── outputs.tf
│
├── .github/workflows/       # GitHub Actions CI/CD
│   ├── ci.yml
│   └── cd.yml
│
├── docker-compose.yml       # Local dev: API + Redis together
├── docker-compose.prod.yml  # Production Docker setup
└── README.md
```

---

## Day 1 — Foundation: Git + Auth + Core Backend + Database

**Goal by end of Day 1:** Users can register, login, and get a JWT. Database is connected. Project runs locally.

---

### Step 1.1 — Initialize Git Repo

```bash
# Go to your project folder
cd "d:\Presidio Capstone Project"

# Initialize git (this tracks all your changes)
git init

# Create your .gitignore FIRST before adding anything
# This stops node_modules and .env secrets from being uploaded to GitHub
```

**Create `.gitignore` in project root:**
```
node_modules/
.env
.env.local
dist/
build/
*.log
.DS_Store
.terraform/
*.tfstate
*.tfstate.backup
```

```bash
# Add everything and make your first commit
git add .
git commit -m "chore: initial project setup"

# On GitHub: create a new repo called "travel-planner-ai"
# Then connect it:
git remote add origin https://github.com/YOUR_USERNAME/travel-planner-ai.git
git branch -M main
git push -u origin main
```

---

### Step 1.2 — Initialize Backend (server/)

```bash
mkdir server
cd server
npm init -y

# Install all backend dependencies at once
npm install express mongoose ioredis jsonwebtoken bcryptjs cors helmet morgan express-rate-limit express-validator uuid dotenv winston cookie-parser

# Install AI/Agent dependencies
npm install langchain @langchain/groq @langchain/core zod

# Dev tools — only needed while coding, not in production
npm install -D typescript @types/node @types/express @types/bcryptjs @types/jsonwebtoken @types/morgan @types/cookie-parser nodemon ts-node
```

**Why these packages?**
- `express` — The web server framework
- `mongoose` — Connects to MongoDB with nice schemas
- `ioredis` — Connects to Redis cache
- `jsonwebtoken` / `bcryptjs` — JWT auth + password hashing
- `helmet` / `cors` / `express-rate-limit` — Security hardening
- `morgan` / `winston` — HTTP logging + structured app logging
- `express-validator` — Validates and sanitizes user input
- `uuid` — Generates unique request IDs for tracing
- `dotenv` — Loads .env file into process.env
- `langchain` / `@langchain/groq` — AI agent orchestration + Groq LLM

---

### Step 1.3 — Create `server/tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

**Update `server/package.json` scripts:**
```json
"scripts": {
  "dev": "nodemon --exec ts-node src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js"
}
```

---

### Step 1.4 — Create `.env` File (server/.env)

> [!CAUTION]
> This file contains secrets — it's in .gitignore, never commit it to GitHub!

```env
# What port the server listens on
PORT=5000
NODE_ENV=development

# MongoDB Atlas connection string — get from Atlas dashboard
MONGO_URI=mongodb+srv://USERNAME:PASSWORD@cluster0.xxxxx.mongodb.net/travel-planner?retryWrites=true&w=majority

# JWT Secrets — make these long random strings (use a password generator!)
JWT_ACCESS_SECRET=your-super-long-random-access-secret-string-here
JWT_REFRESH_SECRET=your-super-long-random-refresh-secret-string-here
JWT_ACCESS_EXPIRES=15m
JWT_REFRESH_EXPIRES=7d

# Redis — local for dev, Docker container in prod
REDIS_URL=redis://localhost:6379

# Groq LLM — free key from console.groq.com
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Google APIs — from Google Cloud Console
GOOGLE_MAPS_API_KEY=AIzaxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GOOGLE_CALENDAR_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CALENDAR_CLIENT_SECRET=xxxx

# Frontend URL — for CORS whitelist
CLIENT_URL=http://localhost:5173
```

---

### Step 1.5 — Database Config (`server/src/config/db.ts`)

```typescript
// This file handles the single MongoDB connection for the entire app.
// We call this once at startup, and Mongoose reuses the connection everywhere.

import mongoose from 'mongoose';

const connectDB = async (): Promise<void> => {
  try {
    // mongoose.connect returns a promise, so we await it
    // The URI comes from .env — never hardcode this!
    const conn = await mongoose.connect(process.env.MONGO_URI as string);
    
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    // If DB connection fails at startup, crash loudly — better to fail fast
    // than to run with no database silently
    console.error('MongoDB connection failed:', error);
    process.exit(1);
  }
};

export default connectDB;
```

---

### Step 1.6 — Redis Config (`server/src/config/redis.ts`)

```typescript
// Redis is our in-memory cache. We store weather, hotel, transport API responses
// here so we don't re-call expensive external APIs for the same trip data.
// TTL (time-to-live) is set per key so cached data auto-expires.

import Redis from 'ioredis';

// Create a Redis client. ioredis handles reconnection automatically
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: 3,
  lazyConnect: true, // Don't crash at startup if Redis is down
});

redis.on('connect', () => console.log('Redis connected'));
redis.on('error', (err) => {
  // If Redis goes down, we log and continue — the app works without cache,
  // just slower. We NEVER throw here because Redis is non-critical.
  console.warn('Redis connection warning:', err.message);
});

export default redis;
```

---

### Step 1.7 — Winston Logger (`server/src/utils/logger.ts`)

```typescript
// Winston is a structured logging library. We log as JSON in production
// so AWS CloudWatch can parse and filter logs by fields like requestId.
// console.log in production is chaos — Winston gives us levels (info/warn/error/debug)
// and consistent formatting.

import winston from 'winston';

const logger = winston.createLogger({
  // In production we want 'info' and above. In dev, 'debug' (everything)
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }), // Include stack traces on errors
    winston.format.json() // Machine-readable JSON format for CloudWatch parsing
  ),
  
  transports: [
    // Always log to console — Docker captures stdout and sends it to CloudWatch
    new winston.transports.Console({
      format: process.env.NODE_ENV !== 'production'
        ? winston.format.combine(
            winston.format.colorize(),
            winston.format.simple() // Human-readable in dev terminal
          )
        : winston.format.json(),
    }),
  ],
});

export default logger;
```

---

### Step 1.8 — MongoDB Models

#### `server/src/models/User.ts`

```typescript
// The User schema defines what a user record looks like in MongoDB.
// We have two roles: 'traveler' (regular user) and 'admin' (sees all data).
// Passwords are NEVER stored as plain text — bcrypt hashes them.

import mongoose, { Document, Schema } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  role: 'traveler' | 'admin';
  refreshToken?: string;
  longTermMemory: string; // AI stores user travel preferences here
  createdAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true },
    email: {
      type: String,
      required: true,
      unique: true, // No two users with same email
      lowercase: true,
      trim: true,
    },
    password: { type: String, required: true, minlength: 8 },
    role: {
      type: String,
      enum: ['traveler', 'admin'],
      default: 'traveler',
    },
    // The refresh token is stored in the DB so we can invalidate it on logout
    refreshToken: { type: String },
    // The AI writes a plain-English summary of user preferences here after each trip
    // "User prefers nature trips under ₹35,000, avoids crowded places"
    longTermMemory: { type: String, default: '' },
  },
  { timestamps: true }
);

// This hook runs BEFORE every save. If the password changed, hash it.
// This means we never manually call bcrypt.hash — the model handles it.
UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  
  // bcrypt salt rounds = 12 means 2^12 hashing iterations — strong enough for 2025
  this.password = await bcrypt.hash(this.password, 12);
  next();
});

// Instance method — called as user.comparePassword(inputPassword)
// Returns true if the plain text matches the hash stored in DB
UserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

export default mongoose.model<IUser>('User', UserSchema);
```

#### `server/src/models/Trip.ts`

```typescript
// Trip is the core data model. Every trip a user creates is stored here.
// Status lifecycle: DRAFT → PLANNED → CONFIRMED
// - DRAFT: user cancelled mid-creation or session expired
// - PLANNED: AI generated the plan, awaiting user payment/approval
// - CONFIRMED: user approved + mocked booking completed

import mongoose, { Document, Schema } from 'mongoose';

export interface ITrip extends Document {
  userId: mongoose.Types.ObjectId;
  sessionId: string;
  status: 'DRAFT' | 'PLANNED' | 'CONFIRMED' | 'CANCELLED';
  input: {
    destination: string;
    origin: string;
    start_date: string;
    end_date: string;
    travelers: number;
    budget_inr: number;
    interests: string[];
  };
  weather: object;
  transport: object;
  accommodation: object;
  activities: object;
  local_transport: object;
  budget: object;
  itinerary: object;
  booking: {
    refs: object;
    confirmed_at: Date | null;
  };
  formattedPlan: string; // The final Markdown plan from the Coordinator Agent
  conversationHistory: Array<{ role: string; content: string }>;
  createdAt: Date;
  updatedAt: Date;
}

const TripSchema = new Schema<ITrip>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: String, required: true, unique: true },
    status: {
      type: String,
      enum: ['DRAFT', 'PLANNED', 'CONFIRMED', 'CANCELLED'],
      default: 'DRAFT',
      index: true, // Indexed because admin filters by status frequently
    },
    input: {
      destination: String,
      origin: String,
      start_date: String,
      end_date: String,
      travelers: Number,
      budget_inr: Number,
      interests: [String],
    },
    weather: { type: Schema.Types.Mixed, default: {} },
    transport: { type: Schema.Types.Mixed, default: {} },
    accommodation: { type: Schema.Types.Mixed, default: {} },
    activities: { type: Schema.Types.Mixed, default: {} },
    local_transport: { type: Schema.Types.Mixed, default: {} },
    budget: { type: Schema.Types.Mixed, default: {} },
    itinerary: { type: Schema.Types.Mixed, default: {} },
    booking: {
      refs: { type: Schema.Types.Mixed, default: {} },
      confirmed_at: { type: Date, default: null },
    },
    formattedPlan: { type: String, default: '' },
    conversationHistory: [
      {
        role: { type: String },
        content: { type: String },
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model<ITrip>('Trip', TripSchema);
```

---

### Step 1.9 — Middleware Stack

#### `server/src/middleware/auth.ts`

```typescript
// This middleware runs on every protected route.
// It reads the Authorization header, verifies the JWT, and attaches
// the user's ID + role to req.user so controllers can use it.
// Without a valid token, the request is rejected with 401.

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

interface JwtPayload {
  userId: string;
  role: string;
}

// Extend Express Request type to include our user info
declare global {
  namespace Express {
    interface Request {
      user?: { userId: string; role: string };
    }
  }
}

export const authenticate = (req: Request, res: Response, next: NextFunction): void => {
  // Tokens come in the Authorization header as "Bearer <token>"
  const authHeader = req.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    res.status(401).json({ message: 'No token provided' });
    return;
  }
  
  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_ACCESS_SECRET!) as JwtPayload;
    req.user = { userId: decoded.userId, role: decoded.role };
    next(); // Continue to the actual route handler
  } catch {
    // Token is expired or tampered with
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

// RBAC — Role-Based Access Control
// Usage: router.get('/admin/trips', authenticate, authorizeAdmin, handler)
export const authorizeAdmin = (req: Request, res: Response, next: NextFunction): void => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ message: 'Admin access required' });
    return;
  }
  next();
};
```

#### `server/src/middleware/requestId.ts`

```typescript
// Every incoming request gets a unique UUID. This ID is passed through
// every logger call, so if something breaks, you can filter CloudWatch logs
// by requestId and see the exact chain of events for that one request.

import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';

export const requestId = (req: Request, res: Response, next: NextFunction): void => {
  // Attach to request object so ALL downstream code can use it
  (req as any).requestId = uuidv4();
  
  // Also send it back in response headers so frontend can log it too
  res.setHeader('X-Request-ID', (req as any).requestId);
  next();
};
```

#### `server/src/middleware/errorHandler.ts`

```typescript
// Global error handler — Express's safety net.
// Any call to next(error) in any route/controller lands here.
// We return a clean JSON response instead of crashing or leaking stack traces.

import { Request, Response, NextFunction } from 'express';
import logger from '../utils/logger';

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  // Log the full error with stack trace for our debugging
  logger.error('Unhandled error', {
    message: err.message,
    stack: err.stack,
    requestId: (req as any).requestId,
    path: req.path,
    method: req.method,
  });
  
  // Send clean message to client — never expose stack traces in production!
  res.status(500).json({
    message:
      process.env.NODE_ENV === 'production'
        ? 'Internal server error'
        : err.message, // In dev, show actual error for faster debugging
  });
};
```

---

### Step 1.10 — Auth Controller & Routes

#### `server/src/controllers/authController.ts`

```typescript
// Auth controller handles register, login, logout, and token refresh.
// It calls User model methods and issues JWT tokens.

import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User';
import logger from '../utils/logger';

// Helper: build both JWT tokens
const signTokens = (userId: string, role: string) => {
  const accessToken = jwt.sign(
    { userId, role },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: '15m' } // Short-lived for security
  );
  
  const refreshToken = jwt.sign(
    { userId, role },
    process.env.JWT_REFRESH_SECRET!,
    { expiresIn: '7d' } // Longer-lived, stored in httpOnly cookie
  );
  
  return { accessToken, refreshToken };
};

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, email, password } = req.body;
    
    // Check if user already exists — can't have duplicate emails
    const existing = await User.findOne({ email });
    if (existing) {
      res.status(409).json({ message: 'Email already registered' });
      return;
    }
    
    // Create user — the model's pre-save hook will hash the password
    const user = await User.create({ name, email, password });
    const { accessToken, refreshToken } = signTokens(user.id, user.role);
    
    // Save refresh token to DB so we can invalidate it on logout
    user.refreshToken = refreshToken;
    await user.save();
    
    // Refresh token in httpOnly cookie — JS can't read it, prevents XSS theft
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
    });
    
    res.status(201).json({
      message: 'Registration successful',
      accessToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    logger.error('Register error', { error });
    res.status(500).json({ message: 'Registration failed' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;
    
    // Find user + include password field (excluded by default for security)
    const user = await User.findOne({ email }).select('+password');
    if (!user || !(await user.comparePassword(password))) {
      // Generic message — never reveal whether email or password was wrong
      res.status(401).json({ message: 'Invalid credentials' });
      return;
    }
    
    const { accessToken, refreshToken } = signTokens(user.id, user.role);
    user.refreshToken = refreshToken;
    await user.save();
    
    res.cookie('refreshToken', refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    
    logger.info('User logged in', { userId: user.id, role: user.role });
    
    res.json({
      accessToken,
      user: { id: user.id, name: user.name, email: user.email, role: user.role },
    });
  } catch (error) {
    logger.error('Login error', { error });
    res.status(500).json({ message: 'Login failed' });
  }
};

export const refresh = async (req: Request, res: Response): Promise<void> => {
  // Refresh token is in the httpOnly cookie — not in Authorization header
  const token = req.cookies?.refreshToken;
  if (!token) {
    res.status(401).json({ message: 'No refresh token' });
    return;
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_REFRESH_SECRET!) as any;
    const user = await User.findById(decoded.userId);
    
    // Make sure the token matches what's in DB — prevents reuse after logout
    if (!user || user.refreshToken !== token) {
      res.status(401).json({ message: 'Invalid refresh token' });
      return;
    }
    
    const { accessToken, refreshToken: newRefreshToken } = signTokens(user.id, user.role);
    user.refreshToken = newRefreshToken;
    await user.save();
    
    res.cookie('refreshToken', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    
    res.json({ accessToken });
  } catch {
    res.status(401).json({ message: 'Expired refresh token, please log in again' });
  }
};

export const logout = async (req: Request, res: Response): Promise<void> => {
  const token = req.cookies?.refreshToken;
  if (token) {
    // Clear the refresh token from DB — this invalidates it permanently
    await User.findOneAndUpdate({ refreshToken: token }, { refreshToken: '' });
  }
  
  res.clearCookie('refreshToken');
  res.json({ message: 'Logged out successfully' });
};
```

#### `server/src/routes/authRoutes.ts`

```typescript
import { Router } from 'express';
import { body } from 'express-validator';
import { register, login, refresh, logout } from '../controllers/authController';
import { authenticate } from '../middleware/auth';

const router = Router();

// Validation rules — express-validator checks inputs before they hit the controller
const registerValidator = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('Valid email required'),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
];

const loginValidator = [
  body('email').isEmail(),
  body('password').notEmpty(),
];

router.post('/register', registerValidator, register);
router.post('/login', loginValidator, login);
router.post('/refresh', refresh);
router.post('/logout', authenticate, logout);

export default router;
```

---

### Step 1.11 — Main Server Entry Point (`server/src/index.ts`)

```typescript
// This is the app entry point. It:
// 1. Loads .env variables
// 2. Connects DB + Redis
// 3. Applies all middleware (security, logging, parsing)
// 4. Mounts all routes
// 5. Starts listening on PORT

import 'dotenv/config'; // Load .env first — before anything else reads process.env
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
// (We'll add more routes as we build them)

const app = express();

// --- Security Middleware ---
// helmet sets safe HTTP response headers (prevents XSS, clickjacking, etc.)
app.use(helmet());

// CORS: only allow requests from our frontend URL
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true, // Allow cookies (needed for refresh token)
}));

// Rate limiting: 100 requests per 15 minutes per IP
// Prevents brute-force attacks on login endpoint
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { message: 'Too many requests, please try again later' },
}));

// --- Utility Middleware ---
app.use(express.json({ limit: '10kb' })); // Parse JSON body — limit size to prevent payload attacks
app.use(cookieParser()); // Parse cookies (for refresh token)
app.use(requestId); // Attach unique requestId to every request

// Morgan: HTTP request logger — logs every request to console
app.use(morgan('combined', {
  stream: { write: (message) => logger.info(message.trim()) },
}));

// --- Health Check Endpoints ---
// Load balancer pings /health to know if server is alive
app.get('/health', (_, res) => res.json({ status: 'ok' }));
app.get('/health/db', async (_, res) => {
  const { connection } = await import('mongoose');
  res.json({ mongo: connection.readyState === 1 ? 'ok' : 'error' });
});
app.get('/health/cache', async (_, res) => {
  try {
    await redis.ping();
    res.json({ redis: 'ok' });
  } catch {
    res.json({ redis: 'error' });
  }
});

// --- Routes ---
app.use('/api/auth', authRoutes);
// Day 2: app.use('/api/trips', tripRoutes);
// Day 2: app.use('/api/admin', adminRoutes);

// --- Global Error Handler (must be LAST middleware) ---
app.use(errorHandler);

// --- Start Server ---
const PORT = process.env.PORT || 5000;

const startServer = async () => {
  await connectDB();
  await redis.connect();
  
  app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
  });
};

startServer();
```

---

### Step 1.12 — Test Backend Works

```bash
# In server/ directory
npm run dev

# Should see:
# MongoDB Connected: cluster0.xxxx.mongodb.net
# Redis connected
# Server running on port 5000 in development mode

# Test with curl:
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"password123"}'

# Should return: { "accessToken": "eyJ..." }
```

---

## Day 2 — AI Agents + MCP Servers + Frontend

**Goal by end of Day 2:** The full AI pipeline works. Frontend is connected and users can chat to generate a trip plan.

---

### Step 2.1 — Retry Utility (`server/src/utils/retry.ts`)

```typescript
// Exponential backoff retry wrapper.
// We wrap ALL MCP/external API calls in this.
// Why? External APIs fail. This gives them 3 chances with increasing wait times
// before we give up and return a cached or graceful fallback.

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface RetryOptions {
  maxRetries?: number;   // Default: 3 attempts total
  baseDelay?: number;    // Default: 2000ms between attempts
  backoffFactor?: number; // Default: 2x (2s → 4s → 8s)
  timeout?: number;       // Default: 8000ms per attempt
}

export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 2000,
    backoffFactor = 2,
    timeout = 8000,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Wrap the function call in a timeout promise
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Request timeout')), timeout)
        ),
      ]);
      return result;
    } catch (error) {
      lastError = error as Error;
      
      if (attempt < maxRetries) {
        // Exponential backoff + jitter (prevents all retries hitting server simultaneously)
        const delay = baseDelay * Math.pow(backoffFactor, attempt - 1);
        const jitter = Math.random() * 1000 - 500; // ±500ms randomness
        await sleep(Math.max(0, delay + jitter));
      }
    }
  }

  throw lastError;
}
```

---

### Step 2.2 — MCP Servers (5 Files)

Each MCP server is a thin wrapper over an external API. Agents call these — never raw APIs directly.

#### `server/src/mcp-servers/weatherMCP.ts`

```typescript
// Weather MCP Server — wraps OpenMeteo (100% free, no API key needed!)
// Agents call getWeatherForecast(), they never know it's OpenMeteo underneath.
// This abstraction means: if we switch from OpenMeteo to another provider,
// ZERO agent code changes.

import { withRetry } from '../utils/retry';

interface WeatherForecast {
  date: string;
  condition: string;
  temp_high_c: number;
  temp_low_c: number;
  rain_mm: number;
}

// Convert OpenMeteo WMO weather codes to human-readable strings
const interpretWeatherCode = (code: number): string => {
  if (code === 0) return 'Clear Sky';
  if (code <= 2) return 'Partly Cloudy';
  if (code <= 45) return 'Foggy';
  if (code <= 55) return 'Drizzle';
  if (code <= 65) return 'Rainy';
  if (code <= 77) return 'Snowy';
  if (code <= 82) return 'Showers';
  return 'Thunderstorm';
};

export async function getWeatherForecast(
  destination: string,
  start_date: string,
  end_date: string
): Promise<{ forecast: WeatherForecast[] }> {
  return withRetry(async () => {
    // Step 1: Geocode the destination name to lat/lng
    // OpenMeteo geocoding is also free!
    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(destination)}&count=1`;
    const geoRes = await fetch(geoUrl);
    const geoData: any = await geoRes.json();

    if (!geoData.results?.length) {
      throw new Error(`Destination '${destination}' not found in geocoding`);
    }

    const { latitude, longitude } = geoData.results[0];

    // Step 2: Fetch weather forecast for those coordinates
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode&start_date=${start_date}&end_date=${end_date}&timezone=auto`;
    
    const weatherRes = await fetch(weatherUrl);
    const weatherData: any = await weatherRes.json();

    // Map the raw API arrays into our clean TripContext format
    const forecast: WeatherForecast[] = weatherData.daily.time.map(
      (date: string, i: number) => ({
        date,
        condition: interpretWeatherCode(weatherData.daily.weathercode[i]),
        temp_high_c: weatherData.daily.temperature_2m_max[i],
        temp_low_c: weatherData.daily.temperature_2m_min[i],
        rain_mm: weatherData.daily.precipitation_sum[i],
      })
    );

    return { forecast };
  });
}
```

#### `server/src/mcp-servers/transitMCP.ts`

```typescript
// Transit MCP Server — returns MOCK bus/train data
// Real transport APIs (RedBus, IRCTC) require heavy business registration.
// For a capstone, realistic mock data is perfectly acceptable and demonstrates
// the same architecture. The Booking Agent handles "mock payment" similarly.

interface TransportOption {
  mode: 'Train' | 'Bus' | 'Flight';
  operator: string;
  duration_hrs: number;
  cost_inr: number;
  departure: string;
  arrival: string;
}

export async function getTransportOptions(
  origin: string,
  destination: string,
  travel_date: string
): Promise<{ options: TransportOption[]; estimated_cost_inr: number }> {
  // Simulate a slight delay like a real API would have
  await new Promise((r) => setTimeout(r, 300));

  // Generate realistic-looking mock data based on destination
  const mockOptions: TransportOption[] = [
    {
      mode: 'Train',
      operator: 'Indian Railways',
      duration_hrs: 8 + Math.floor(Math.random() * 4),
      cost_inr: 800 + Math.floor(Math.random() * 1200),
      departure: '06:00',
      arrival: '14:00',
    },
    {
      mode: 'Bus',
      operator: 'KSRTC / Private Volvo',
      duration_hrs: 10 + Math.floor(Math.random() * 3),
      cost_inr: 500 + Math.floor(Math.random() * 800),
      departure: '21:00',
      arrival: '07:00',
    },
  ];

  const cheapest = Math.min(...mockOptions.map((o) => o.cost_inr));

  return {
    options: mockOptions,
    estimated_cost_inr: cheapest,
  };
}
```

#### `server/src/mcp-servers/mapsMCP.ts`

```typescript
// Maps MCP Server — wraps Google Maps APIs (Geocoding, Places, Distance Matrix)
// Google gives $200 free credit/month which is more than enough for a capstone.
// We wrap all three sub-APIs in one MCP server because they all come from Google.

import { withRetry } from '../utils/retry';

const GOOGLE_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Get nearby attractions and restaurants using Google Places API
export async function getPlacesNearby(
  destination: string,
  interests: string[],
  days: number
): Promise<{ attractions: string[]; restaurants: string[]; timings: string; entry_fees: string }> {
  return withRetry(async () => {
    // First geocode destination to coordinates
    const geoRes = await fetch(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(destination)}&key=${GOOGLE_API_KEY}`
    );
    const geoData: any = await geoRes.json();
    const location = geoData.results[0]?.geometry?.location;

    if (!location) throw new Error('Could not geocode destination');

    // Search for tourist attractions nearby
    const placesRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location.lat},${location.lng}&radius=10000&type=tourist_attraction&key=${GOOGLE_API_KEY}`
    );
    const placesData: any = await placesRes.json();

    const attractions = placesData.results
      ?.slice(0, Math.min(days * 2, 8))
      .map((p: any) => p.name) || [];

    // Search for restaurants
    const restRes = await fetch(
      `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${location.lat},${location.lng}&radius=5000&type=restaurant&key=${GOOGLE_API_KEY}`
    );
    const restData: any = await restRes.json();
    const restaurants = restData.results?.slice(0, 4).map((p: any) => p.name) || [];

    return {
      attractions,
      restaurants,
      timings: '09:00 AM - 06:00 PM (general)',
      entry_fees: `₹${100 + Math.floor(Math.random() * 300)} per person (estimated)`,
    };
  });
}

// Calculate distance/travel time between hotel and attraction for local transport estimates
export async function getDistanceMatrix(
  origin: string,
  destination: string
): Promise<{ distance_km: number; duration_min: number; cab_estimate_inr: number }> {
  return withRetry(async () => {
    const res = await fetch(
      `https://maps.googleapis.com/maps/api/distancematrix/json?origins=${encodeURIComponent(origin)}&destinations=${encodeURIComponent(destination)}&key=${GOOGLE_API_KEY}`
    );
    const data: any = await res.json();
    const element = data.rows[0]?.elements[0];

    const distance_km = (element?.distance?.value || 10000) / 1000;
    const duration_min = (element?.duration?.value || 1200) / 60;
    // ₹12/km estimate for city cab
    const cab_estimate_inr = Math.round(distance_km * 12 * 2); // x2 for round trip

    return { distance_km, duration_min, cab_estimate_inr };
  });
}
```

#### `server/src/mcp-servers/bookingMCP.ts`

```typescript
// Booking MCP Server — MOCK hotel booking + MOCK payment
// We simulate hotel booking because real hotel APIs (Booking.com, Expedia) 
// require paid access. This demonstrates the architecture pattern identically.
// The Booking Agent calls this to "confirm" a booking in the CONFIRMED stage.

interface HotelOption {
  name: string;
  price_per_night_inr: number;
  rating: number;
  amenities: string[];
  total_cost_inr: number;
}

export async function searchHotels(
  destination: string,
  check_in: string,
  check_out: string,
  travelers: number
): Promise<{ hotels: HotelOption[]; recommended: string; price_per_night: number }> {
  await new Promise((r) => setTimeout(r, 400)); // Simulate API latency
  
  const nights =
    (new Date(check_out).getTime() - new Date(check_in).getTime()) /
    (1000 * 60 * 60 * 24);

  const basePrice = 1500 + Math.floor(Math.random() * 2000);

  const hotels: HotelOption[] = [
    {
      name: `${destination} Grand Hotel`,
      price_per_night_inr: basePrice,
      rating: 4.2,
      amenities: ['WiFi', 'Breakfast', 'AC', 'Parking'],
      total_cost_inr: basePrice * nights,
    },
    {
      name: `Budget Inn ${destination}`,
      price_per_night_inr: Math.round(basePrice * 0.6),
      rating: 3.8,
      amenities: ['WiFi', 'Parking'],
      total_cost_inr: Math.round(basePrice * 0.6) * nights,
    },
    {
      name: `${destination} Heritage Stay`,
      price_per_night_inr: Math.round(basePrice * 1.5),
      rating: 4.6,
      amenities: ['WiFi', 'Breakfast', 'AC', 'Pool', 'Spa'],
      total_cost_inr: Math.round(basePrice * 1.5) * nights,
    },
  ];

  return {
    hotels,
    recommended: hotels[0].name,
    price_per_night: hotels[0].price_per_night_inr,
  };
}

export async function mockBooking(
  hotel: string,
  travelers: number
): Promise<{ booking_ref: string; status: string; confirmation_message: string }> {
  await new Promise((r) => setTimeout(r, 600)); // Simulate payment processing
  
  return {
    booking_ref: `BK${Date.now().toString(36).toUpperCase()}`,
    status: 'CONFIRMED',
    confirmation_message: `Booking confirmed at ${hotel} for ${travelers} traveler(s).`,
  };
}
```

#### `server/src/mcp-servers/calendarMCP.ts`

```typescript
// Calendar MCP Server — creates Google Calendar events after booking
// Uses Google Calendar API with OAuth2. If the user hasn't connected their
// Google account, we gracefully skip calendar sync (non-blocking).

export async function createCalendarEvent(
  tripName: string,
  start_date: string,
  end_date: string,
  userEmail: string
): Promise<{ success: boolean; eventId?: string; message: string }> {
  // For capstone: return a mock success
  // In production: use googleapis SDK with OAuth2 tokens
  await new Promise((r) => setTimeout(r, 200));
  
  return {
    success: true,
    eventId: `evt_${Date.now()}`,
    message: `Calendar event "${tripName}" created from ${start_date} to ${end_date}. Invite sent to ${userEmail}`,
  };
}
```

---

### Step 2.3 — The 11 AI Agents

All agents live in `server/src/agents/`. Each is a function that receives a `TripContext` slice, calls an LLM or MCP, and returns updated data.

#### `server/src/agents/plannerAgent.ts`

```typescript
// Planner Agent — the "brain" that reads the raw user message and extracts
// structured trip parameters. It uses the Groq LLM to parse natural language
// like "I want to go to Manali for 5 days with ₹25,000 next month" into
// a clean TripContext object with destination, dates, budget, etc.

import { ChatGroq } from '@langchain/groq';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama3-8b-8192', // Fast, free, good for structured extraction
  temperature: 0.1, // Low temperature = deterministic, consistent outputs
});

export interface TripContext {
  sessionId: string;
  userId: string;
  status: 'DRAFT' | 'PLANNED' | 'CONFIRMED';
  input: {
    destination?: string;
    origin?: string;
    start_date?: string;
    end_date?: string;
    travelers?: number;
    budget_inr?: number;
    interests?: string[];
  };
  weather?: any;
  transport?: any;
  accommodation?: any;
  activities?: any;
  local_transport?: any;
  budget?: any;
  itinerary?: any;
  booking?: any;
  formattedPlan?: string;
  conversationHistory: Array<{ role: string; content: string }>;
}

export async function runPlannerAgent(
  userMessage: string,
  context: TripContext,
  longTermMemory: string
): Promise<TripContext> {
  const systemPrompt = `You are a travel planning assistant. Extract trip parameters from the user's message.
Return ONLY valid JSON with this exact structure (leave fields empty string or 0 if missing):
{
  "destination": "string or empty",
  "origin": "string or empty",  
  "start_date": "YYYY-MM-DD or empty",
  "end_date": "YYYY-MM-DD or empty",
  "travelers": number or 0,
  "budget_inr": number or 0,
  "interests": ["array", "of", "strings"]
}

User's travel history context: ${longTermMemory || 'No history yet.'}
Current extracted params: ${JSON.stringify(context.input)}`;

  const response = await llm.invoke([
    new SystemMessage(systemPrompt),
    new HumanMessage(userMessage),
  ]);

  try {
    // Extract JSON from LLM response
    const jsonMatch = response.content.toString().match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    
    const extracted = JSON.parse(jsonMatch[0]);
    
    // Merge with existing context — don't overwrite non-empty fields unless new value provided
    return {
      ...context,
      input: {
        ...context.input,
        ...Object.fromEntries(
          Object.entries(extracted).filter(([_, v]) => v !== '' && v !== 0 && (Array.isArray(v) ? v.length > 0 : true))
        ),
      },
    };
  } catch {
    // If LLM returns malformed JSON, return context unchanged and let Missing Info Agent handle it
    return context;
  }
}
```

#### `server/src/agents/missingInfoAgent.ts`

```typescript
// Missing Info Agent — checks the TripContext for critical empty fields.
// If destination, dates, or budget are missing, it generates a natural
// clarifying question to ask the user. This is what creates the conversational
// multi-turn chat experience.

import { ChatGroq } from '@langchain/groq';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { TripContext } from './plannerAgent';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama3-8b-8192',
  temperature: 0.3,
});

export interface MissingInfoResult {
  complete: boolean;
  missingFields: string[];
  clarifyingQuestion?: string;
}

export async function runMissingInfoAgent(context: TripContext): Promise<MissingInfoResult> {
  const { input } = context;
  const missingFields: string[] = [];

  // Check which critical fields are empty
  if (!input.destination) missingFields.push('destination');
  if (!input.start_date || !input.end_date) missingFields.push('travel dates');
  if (!input.budget_inr || input.budget_inr === 0) missingFields.push('budget');
  if (!input.travelers || input.travelers === 0) missingFields.push('number of travelers');

  if (missingFields.length === 0) {
    return { complete: true, missingFields: [] };
  }

  // Use LLM to generate a natural-sounding question (not robotic "MISSING FIELDS: ...")
  const response = await llm.invoke([
    new SystemMessage(
      `You are a friendly travel planning assistant. Generate ONE natural conversational question 
       to ask the user for the missing trip information. Be warm and helpful.`
    ),
    new HumanMessage(
      `Missing information: ${missingFields.join(', ')}. 
       Already know: ${JSON.stringify(input)}. 
       Generate a friendly question.`
    ),
  ]);

  return {
    complete: false,
    missingFields,
    clarifyingQuestion: response.content.toString(),
  };
}
```

#### `server/src/agents/destinationRecAgent.ts`

```typescript
// Destination Recommendation Agent — when the user has no specific destination
// in mind, this agent suggests top 3 places based on budget, interests, and
// past travel history stored in long-term memory.

import { ChatGroq } from '@langchain/groq';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { TripContext } from './plannerAgent';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama3-8b-8192',
  temperature: 0.7, // Higher temperature = more creative recommendations
});

export async function runDestinationRecAgent(
  context: TripContext,
  longTermMemory: string
): Promise<{ recommendedDestinations: string[]; reasoning: string; selectedDestination: string }> {
  const response = await llm.invoke([
    new SystemMessage(
      `You are a travel expert. Recommend exactly 3 Indian travel destinations.
       Return ONLY valid JSON:
       { "destinations": ["dest1", "dest2", "dest3"], "reasoning": "brief explanation", "top_pick": "dest1" }
       Consider budget, interests, and season.`
    ),
    new HumanMessage(
      `Budget: ₹${context.input.budget_inr}, Interests: ${context.input.interests?.join(', ')}, 
       Travel period: ${context.input.start_date} to ${context.input.end_date}, 
       Travelers: ${context.input.travelers}.
       Past preferences: ${longTermMemory || 'First-time user'}`
    ),
  ]);

  try {
    const jsonMatch = response.content.toString().match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON');
    const data = JSON.parse(jsonMatch[0]);
    
    return {
      recommendedDestinations: data.destinations || [],
      reasoning: data.reasoning || '',
      selectedDestination: data.top_pick || data.destinations?.[0] || 'Manali',
    };
  } catch {
    return {
      recommendedDestinations: ['Goa', 'Manali', 'Jaipur'],
      reasoning: 'Popular destinations based on budget and season',
      selectedDestination: 'Goa',
    };
  }
}
```

#### `server/src/agents/weatherAgent.ts`

```typescript
// Weather Agent — fetches forecast data and checks the Redis cache first.
// Cache key is destination+date range. TTL is 6 hours because weather
// forecasts don't change that rapidly. This saves OpenMeteo API calls.

import redis from '../config/redis';
import { getWeatherForecast } from '../mcp-servers/weatherMCP';
import logger from '../utils/logger';

export async function runWeatherAgent(
  destination: string,
  start_date: string,
  end_date: string
): Promise<{ forecast: any[] }> {
  // Redis key format: weather:Chennai:2025-10-15:2025-10-20
  const cacheKey = `weather:${destination}:${start_date}:${end_date}`;

  try {
    // Check cache first — if it's there, use it (avoids external API call)
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug('Cache HIT — weather', { cacheKey });
      return JSON.parse(cached);
    }
  } catch {
    // Redis is down — continue without cache, directly call MCP
    logger.warn('Redis unavailable, bypassing weather cache');
  }

  // Cache miss — fetch from OpenMeteo via MCP
  logger.debug('Cache MISS — fetching weather from MCP', { cacheKey });
  const weatherData = await getWeatherForecast(destination, start_date, end_date);

  try {
    // Store in Redis with 6-hour TTL (21600 seconds)
    await redis.setex(cacheKey, 21600, JSON.stringify(weatherData));
  } catch {
    logger.warn('Could not write weather to Redis cache');
  }

  return weatherData;
}
```

#### `server/src/agents/transportAgent.ts`

```typescript
import redis from '../config/redis';
import { getTransportOptions } from '../mcp-servers/transitMCP';
import logger from '../utils/logger';

export async function runTransportAgent(origin: string, destination: string, travel_date: string) {
  const cacheKey = `transport:${origin}:${destination}:${travel_date}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug('Cache HIT — transport', { cacheKey });
      return JSON.parse(cached);
    }
  } catch { logger.warn('Redis unavailable for transport cache'); }

  const data = await getTransportOptions(origin, destination, travel_date);

  try {
    // 12-hour cache — transport schedules are stable within a day
    await redis.setex(cacheKey, 43200, JSON.stringify(data));
  } catch { logger.warn('Could not write transport to cache'); }

  return data;
}
```

#### `server/src/agents/accommodationAgent.ts`

```typescript
import redis from '../config/redis';
import { searchHotels } from '../mcp-servers/bookingMCP';
import logger from '../utils/logger';

export async function runAccommodationAgent(
  destination: string,
  check_in: string,
  check_out: string,
  travelers: number
) {
  const cacheKey = `hotels:${destination}:${check_in}:${check_out}:${travelers}`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug('Cache HIT — hotels', { cacheKey });
      return JSON.parse(cached);
    }
  } catch { logger.warn('Redis unavailable for hotel cache'); }

  const data = await searchHotels(destination, check_in, check_out, travelers);

  try {
    await redis.setex(cacheKey, 3600, JSON.stringify(data)); // 1-hour TTL for hotel prices
  } catch { logger.warn('Could not write hotels to cache'); }

  return data;
}
```

#### `server/src/agents/activityAgent.ts`

```typescript
import redis from '../config/redis';
import { getPlacesNearby } from '../mcp-servers/mapsMCP';
import logger from '../utils/logger';

export async function runActivityAgent(destination: string, interests: string[], days: number) {
  const cacheKey = `activities:${destination}:${interests.join('-')}:${days}d`;

  try {
    const cached = await redis.get(cacheKey);
    if (cached) {
      logger.debug('Cache HIT — activities', { cacheKey });
      return JSON.parse(cached);
    }
  } catch { logger.warn('Redis unavailable for activities cache'); }

  const data = await getPlacesNearby(destination, interests, days);

  try {
    await redis.setex(cacheKey, 86400, JSON.stringify(data)); // 24-hour TTL for places (stable)
  } catch { logger.warn('Could not write activities to cache'); }

  return data;
}
```

#### `server/src/agents/budgetAgent.ts`

```typescript
// Budget Agent — the number cruncher. Takes all cost estimates from the parallel
// agents and builds a breakdown. Adds 10% emergency fund. Checks if total is
// within the user's stated budget. If over by >20%, returns alternatives.

import { TripContext } from './plannerAgent';

export interface BudgetBreakdown {
  transport: number;
  accommodation: number;
  food: number;
  activities: number;
  local_transport: number;
  emergency_fund: number;
  total_cost_inr: number;
  remaining_budget_inr: number;
  is_feasible: boolean;
  alternatives?: string[];
}

export async function runBudgetAgent(context: TripContext): Promise<BudgetBreakdown> {
  const { input, transport, accommodation, activities, local_transport } = context;
  const budget = input.budget_inr || 30000;

  // Extract cost numbers from each agent's output
  const transportCost = transport?.estimated_cost_inr || 1500;
  const hotelCost = accommodation?.hotels?.[0]?.total_cost_inr || 8000;
  // Food: ₹500/person/day is a reasonable Indian travel estimate
  const days = input.start_date && input.end_date
    ? (new Date(input.end_date).getTime() - new Date(input.start_date).getTime()) / (1000 * 60 * 60 * 24)
    : 5;
  const foodCost = 500 * (input.travelers || 1) * days;
  const activityCost = activities?.total_entry_fees_inr || 1500;
  const localTransportCost = local_transport?.cab_estimates_inr || 2000;

  const subtotal = transportCost + hotelCost + foodCost + activityCost + localTransportCost;
  // Emergency fund = 10% of subtotal — for unexpected expenses
  const emergencyFund = Math.round(subtotal * 0.1);
  const totalCost = subtotal + emergencyFund;

  const isFeasible = totalCost <= budget;
  const breakdown: BudgetBreakdown = {
    transport: transportCost,
    accommodation: hotelCost,
    food: foodCost,
    activities: activityCost,
    local_transport: localTransportCost,
    emergency_fund: emergencyFund,
    total_cost_inr: totalCost,
    remaining_budget_inr: budget - totalCost,
    is_feasible: isFeasible,
  };

  // If way over budget, suggest alternatives
  if (!isFeasible) {
    breakdown.alternatives = [
      `Reduce hotel to budget option (saves ₹${Math.round(hotelCost * 0.4)})`,
      `Shorten trip by 1-2 days (saves ₹${Math.round((foodCost + localTransportCost) / days * 2)})`,
      `Increase budget to ₹${totalCost + 2000} for a comfortable trip`,
    ];
  }

  return breakdown;
}
```

#### `server/src/agents/itineraryAgent.ts`

```typescript
// Itinerary Agent — builds the day-by-day schedule. It's the most complex agent
// because it must weave together weather advisories, activity timings, meal breaks,
// check-in/out times, and daily spending caps into a coherent schedule.

import { ChatGroq } from '@langchain/groq';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { TripContext } from './plannerAgent';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama3-70b-8192', // Bigger model for complex scheduling task
  temperature: 0.4,
});

export async function runItineraryAgent(context: TripContext): Promise<{ days: any[]; notes: string }> {
  const { input, weather, transport, accommodation, activities, budget } = context;

  const response = await llm.invoke([
    new SystemMessage(
      `You are a travel itinerary planner. Create a detailed day-by-day itinerary.
       Return ONLY valid JSON:
       {
         "days": [
           {
             "day": 1,
             "date": "YYYY-MM-DD",
             "title": "Day title",
             "schedule": [
               { "time": "HH:MM", "activity": "description", "location": "place", "cost_inr": 0, "duration_min": 60 }
             ],
             "daily_total_inr": 0,
             "weather_note": "weather consideration"
           }
         ],
         "notes": "general trip tips"
       }`
    ),
    new HumanMessage(
      `Trip: ${input.destination} | Dates: ${input.start_date} to ${input.end_date}
       Travelers: ${input.travelers} | Budget left per day: ₹${Math.round((budget?.remaining_budget_inr || 5000) / 5)}
       Attractions: ${activities?.attractions?.join(', ')}
       Restaurants: ${activities?.restaurants?.join(', ')}
       Hotel: ${accommodation?.recommended || 'Hotel'}
       Weather: ${JSON.stringify(weather?.forecast?.slice(0, 3))}
       Transport arrival: ${transport?.options?.[0]?.arrival || '14:00'}`
    ),
  ]);

  try {
    const jsonMatch = response.content.toString().match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in itinerary response');
    return JSON.parse(jsonMatch[0]);
  } catch {
    return {
      days: [{ day: 1, title: 'Day 1 - Arrival', schedule: [], daily_total_inr: 0, weather_note: '' }],
      notes: 'Itinerary generation encountered an issue. Please try again.',
    };
  }
}
```

#### `server/src/agents/coordinatorAgent.ts`

```typescript
// Coordinator Agent — the orchestrator and final synthesizer.
// Stage 1: dispatches parallel agents using Promise.allSettled()
// Stage 2: collects results and builds the final markdown plan
// It's the "manager" that other agents report their outputs to.

import { ChatGroq } from '@langchain/groq';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { TripContext } from './plannerAgent';
import { runWeatherAgent } from './weatherAgent';
import { runTransportAgent } from './transportAgent';
import { runAccommodationAgent } from './accommodationAgent';
import { runActivityAgent } from './activityAgent';
import logger from '../utils/logger';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama3-70b-8192',
  temperature: 0.5,
});

export async function runParallelAgents(context: TripContext): Promise<TripContext> {
  const { input } = context;
  const days =
    (new Date(input.end_date!).getTime() - new Date(input.start_date!).getTime()) /
    (1000 * 60 * 60 * 24);

  logger.info('Starting parallel agent execution', {
    destination: input.destination,
    agents: ['weather', 'transport', 'accommodation', 'activity'],
  });

  // Promise.allSettled means all 4 run simultaneously but we wait for ALL to finish
  // Even if one fails, the others continue — resilient parallel execution
  const [weatherResult, transportResult, accomResult, activityResult] = await Promise.allSettled([
    runWeatherAgent(input.destination!, input.start_date!, input.end_date!),
    runTransportAgent(input.origin || 'Chennai', input.destination!, input.start_date!),
    runAccommodationAgent(input.destination!, input.start_date!, input.end_date!, input.travelers || 1),
    runActivityAgent(input.destination!, input.interests || [], days),
  ]);

  // Extract results, log any failures (don't crash — partial data is still useful)
  return {
    ...context,
    weather: weatherResult.status === 'fulfilled' ? weatherResult.value : { forecast: [] },
    transport: transportResult.status === 'fulfilled' ? transportResult.value : { options: [], estimated_cost_inr: 1500 },
    accommodation: accomResult.status === 'fulfilled' ? accomResult.value : { hotels: [], recommended: 'TBD', price_per_night: 2000 },
    activities: activityResult.status === 'fulfilled' ? activityResult.value : { attractions: [], restaurants: [], timings: '', entry_fees: '₹0' },
  };
}

export async function synthesizeTripPlan(context: TripContext): Promise<string> {
  // Takes the complete TripContext and asks the LLM to write a beautiful markdown summary
  const response = await llm.invoke([
    new SystemMessage(
      `You are a travel content writer. Create a beautiful, structured markdown travel plan.
       Include: trip overview, weather summary, transport details, hotel, day-by-day schedule, 
       budget breakdown table, and packing tips. Use emojis and formatting.`
    ),
    new HumanMessage(JSON.stringify(context, null, 2)),
  ]);

  return response.content.toString();
}
```

#### `server/src/agents/bookingAgent.ts`

```typescript
// Booking Agent (Mocked) — simulates completing reservations after HITL approval.
// In a real system, this would call OYO Rooms API, MakeMyTrip API, etc.
// Booking is the final irreversible step, only triggered after user approval.

import { mockBooking } from '../mcp-servers/bookingMCP';
import { createCalendarEvent } from '../mcp-servers/calendarMCP';
import { TripContext } from './plannerAgent';

export async function runBookingAgent(
  context: TripContext,
  userEmail: string
): Promise<{ bookingRefs: any; confirmed: boolean }> {
  // Mock hotel booking
  const hotelBooking = await mockBooking(
    context.accommodation?.recommended || 'Selected Hotel',
    context.input.travelers || 1
  );

  // Create Google Calendar events for the trip dates
  const calendarResult = await createCalendarEvent(
    `Trip to ${context.input.destination}`,
    context.input.start_date!,
    context.input.end_date!,
    userEmail
  );

  return {
    bookingRefs: {
      hotel: hotelBooking.booking_ref,
      calendar: calendarResult.eventId,
      transport: `TR${Date.now().toString(36).toUpperCase()}`, // Mock transport ref
    },
    confirmed: hotelBooking.status === 'CONFIRMED',
  };
}
```

#### `server/src/agents/replanningAgent.ts`

```typescript
// Replanning Agent — handles HITL rejection ("I want cheaper hotel" / "change dates")
// Key insight: we PRESERVE everything that was expensive to compute (weather, transport,
// activities) and ONLY re-run what the user wants changed. This saves API calls and time.

import { ChatGroq } from '@langchain/groq';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { TripContext } from './plannerAgent';

const llm = new ChatGroq({
  apiKey: process.env.GROQ_API_KEY,
  model: 'llama3-8b-8192',
  temperature: 0.2,
});

export async function runReplanningAgent(
  context: TripContext,
  rejectionReason: string
): Promise<{ updatedContext: TripContext; whatChanged: string[] }> {
  const response = await llm.invoke([
    new SystemMessage(
      `A user rejected a travel plan. Identify ONLY what needs to change.
       Return ONLY valid JSON: { "changes": ["accommodation", "budget", "itinerary"], "instruction": "brief explanation" }
       Valid change types: destination, dates, budget, accommodation, itinerary`
    ),
    new HumanMessage(
      `Rejection reason: "${rejectionReason}"
       Current plan: destination=${context.input.destination}, budget=₹${context.input.budget_inr}, hotel=${context.accommodation?.recommended}`
    ),
  ]);

  try {
    const jsonMatch = response.content.toString().match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON');
    const parsed = JSON.parse(jsonMatch[0]);
    const changes: string[] = parsed.changes || ['itinerary'];

    // Build updated context: clear ONLY the agent outputs that need to be re-run
    const updatedContext = { ...context };
    
    if (changes.includes('accommodation')) updatedContext.accommodation = undefined;
    if (changes.includes('budget')) updatedContext.budget = undefined;
    if (changes.includes('itinerary')) {
      updatedContext.itinerary = undefined;
      updatedContext.formattedPlan = undefined;
    }
    // Weather and transport are preserved — never re-fetched unless dates change
    
    return { updatedContext, whatChanged: changes };
  } catch {
    return { updatedContext: context, whatChanged: [] };
  }
}
```

---

### Step 2.4 — Planner Service (Orchestrates All Agents)

#### `server/src/services/plannerService.ts`

```typescript
// Planner Service is the brain of the backend. It's the single function
// that the Trip Controller calls. It runs all 11 agents in the right sequence:
// Stage 0 (sequential) → Stage 1 (parallel) → Stage 2 (sequential) → HITL

import { v4 as uuidv4 } from 'uuid';
import { TripContext, runPlannerAgent } from '../agents/plannerAgent';
import { runMissingInfoAgent } from '../agents/missingInfoAgent';
import { runDestinationRecAgent } from '../agents/destinationRecAgent';
import { runParallelAgents, synthesizeTripPlan } from '../agents/coordinatorAgent';
import { runBudgetAgent } from '../agents/budgetAgent';
import { runItineraryAgent } from '../agents/itineraryAgent';
import Trip from '../models/Trip';
import User from '../models/User';
import logger from '../utils/logger';

export interface PlannerServiceResult {
  status: 'NEEDS_INFO' | 'PLANNED' | 'ERROR';
  clarifyingQuestion?: string;
  tripId?: string;
  plan?: string;
  context?: TripContext;
  budgetFeasible?: boolean;
  budgetAlternatives?: string[];
}

export async function planTrip(
  userMessage: string,
  userId: string,
  existingTripId?: string,
  requestId?: string
): Promise<PlannerServiceResult> {
  logger.info('Planner Service: Starting trip planning', { userId, requestId });

  // --- Load Memory ---
  const user = await User.findById(userId);
  const longTermMemory = user?.longTermMemory || '';

  // --- Load or create TripContext ---
  let context: TripContext;
  
  if (existingTripId) {
    const existingTrip = await Trip.findById(existingTripId);
    if (existingTrip) {
      context = {
        sessionId: existingTrip.sessionId,
        userId,
        status: existingTrip.status,
        input: existingTrip.input as any,
        conversationHistory: existingTrip.conversationHistory || [],
        weather: existingTrip.weather,
        transport: existingTrip.transport,
        accommodation: existingTrip.accommodation,
        activities: existingTrip.activities,
        local_transport: existingTrip.local_transport,
        budget: existingTrip.budget,
        itinerary: existingTrip.itinerary,
        booking: existingTrip.booking,
      };
    } else {
      context = { sessionId: uuidv4(), userId, status: 'DRAFT', input: {}, conversationHistory: [] };
    }
  } else {
    context = { sessionId: uuidv4(), userId, status: 'DRAFT', input: {}, conversationHistory: [] };
  }

  // Add user message to conversation history
  context.conversationHistory.push({ role: 'user', content: userMessage });

  // --- STAGE 0A: Planner Agent — extract intent ---
  context = await runPlannerAgent(userMessage, context, longTermMemory);

  // --- STAGE 0B: Missing Info Agent — check completeness ---
  const missingInfo = await runMissingInfoAgent(context);
  if (!missingInfo.complete) {
    // Save partial context as DRAFT so user can continue the conversation
    await Trip.findOneAndUpdate(
      { sessionId: context.sessionId },
      { ...context, status: 'DRAFT' },
      { upsert: true, new: true }
    );
    // Return the clarifying question to the frontend
    return {
      status: 'NEEDS_INFO',
      clarifyingQuestion: missingInfo.clarifyingQuestion,
      tripId: context.sessionId,
    };
  }

  // --- STAGE 0C: Destination Rec Agent (if no destination) ---
  if (!context.input.destination) {
    const destRec = await runDestinationRecAgent(context, longTermMemory);
    context.input.destination = destRec.selectedDestination;
  }

  // --- STAGE 1: Parallel Data Retrieval ---
  logger.info('Planner Service: Running parallel agents', { requestId });
  context = await runParallelAgents(context);

  // --- STAGE 2A: Budget Agent ---
  const budgetBreakdown = await runBudgetAgent(context);
  context.budget = budgetBreakdown;

  if (!budgetBreakdown.is_feasible) {
    return {
      status: 'PLANNED',
      budgetFeasible: false,
      budgetAlternatives: budgetBreakdown.alternatives,
      context,
    };
  }

  // --- STAGE 2B: Itinerary Agent ---
  const itinerary = await runItineraryAgent(context);
  context.itinerary = itinerary;

  // --- Coordinator: Synthesize Final Markdown Plan ---
  const formattedPlan = await synthesizeTripPlan(context);
  context.formattedPlan = formattedPlan;
  context.status = 'PLANNED';

  // --- Save to MongoDB (status: PLANNED, awaiting user approval) ---
  await Trip.findOneAndUpdate(
    { sessionId: context.sessionId },
    { ...context, userId },
    { upsert: true, new: true }
  );

  logger.info('Planner Service: Trip planned and saved', { sessionId: context.sessionId, requestId });

  return {
    status: 'PLANNED',
    tripId: context.sessionId,
    plan: formattedPlan,
    context,
    budgetFeasible: true,
  };
}
```

---

### Step 2.5 — Trip Controller & Routes

#### `server/src/controllers/tripController.ts`

```typescript
import { Request, Response } from 'express';
import { planTrip } from '../services/plannerService';
import { runBookingAgent } from '../agents/bookingAgent';
import { runReplanningAgent } from '../agents/replanningAgent';
import Trip from '../models/Trip';
import User from '../models/User';
import logger from '../utils/logger';

// POST /api/trips/plan — User sends a chat message to plan a trip
export const createOrUpdateTrip = async (req: Request, res: Response): Promise<void> => {
  try {
    const { message, tripId } = req.body;
    const userId = req.user!.userId;

    const result = await planTrip(message, userId, tripId, (req as any).requestId);

    res.json(result);
  } catch (error) {
    logger.error('Trip planning failed', { error, userId: req.user?.userId });
    res.status(500).json({ message: 'Trip planning failed. Please try again.' });
  }
};

// POST /api/trips/:tripId/approve — User approves the plan → trigger booking
export const approveTrip = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tripId } = req.params;
    const userId = req.user!.userId;

    const trip = await Trip.findOne({ sessionId: tripId, userId });
    if (!trip) { res.status(404).json({ message: 'Trip not found' }); return; }

    const user = await User.findById(userId);
    const context = trip.toObject() as any;

    const booking = await runBookingAgent(context, user?.email || '');

    // Update trip to CONFIRMED status in MongoDB
    trip.status = 'CONFIRMED';
    trip.booking = { refs: booking.bookingRefs, confirmed_at: new Date() };
    await trip.save();

    res.json({ message: 'Trip confirmed!', bookingRefs: booking.bookingRefs, status: 'CONFIRMED' });
  } catch (error) {
    logger.error('Trip approval failed', { error });
    res.status(500).json({ message: 'Booking failed. Please try again.' });
  }
};

// POST /api/trips/:tripId/reject — User rejects plan, provides modification request
export const rejectTrip = async (req: Request, res: Response): Promise<void> => {
  try {
    const { tripId } = req.params;
    const { reason } = req.body;
    const userId = req.user!.userId;

    const trip = await Trip.findOne({ sessionId: tripId, userId });
    if (!trip) { res.status(404).json({ message: 'Trip not found' }); return; }

    const context = trip.toObject() as any;
    const { updatedContext } = await runReplanningAgent(context, reason);

    // Re-run planning from coordinator stage with updated context
    const result = await planTrip(reason, userId, tripId, (req as any).requestId);

    res.json(result);
  } catch (error) {
    logger.error('Trip rejection/replan failed', { error });
    res.status(500).json({ message: 'Replanning failed. Please try again.' });
  }
};

// GET /api/trips — Get all trips for logged-in user
export const getUserTrips = async (req: Request, res: Response): Promise<void> => {
  try {
    const trips = await Trip.find({ userId: req.user!.userId })
      .select('sessionId status input.destination input.start_date input.end_date input.budget_inr createdAt')
      .sort({ createdAt: -1 })
      .limit(20);

    res.json({ trips });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch trips' });
  }
};

// GET /api/trips/:tripId — Get single trip details
export const getTripById = async (req: Request, res: Response): Promise<void> => {
  try {
    const trip = await Trip.findOne({ sessionId: req.params.tripId, userId: req.user!.userId });
    if (!trip) { res.status(404).json({ message: 'Trip not found' }); return; }
    res.json({ trip });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch trip' });
  }
};

// DELETE /api/trips/:tripId — Cancel a trip
export const cancelTrip = async (req: Request, res: Response): Promise<void> => {
  try {
    await Trip.findOneAndUpdate(
      { sessionId: req.params.tripId, userId: req.user!.userId },
      { status: 'CANCELLED' }
    );
    res.json({ message: 'Trip cancelled' });
  } catch (error) {
    res.status(500).json({ message: 'Failed to cancel trip' });
  }
};
```

#### `server/src/routes/tripRoutes.ts`

```typescript
import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import {
  createOrUpdateTrip, approveTrip, rejectTrip,
  getUserTrips, getTripById, cancelTrip
} from '../controllers/tripController';

const router = Router();

// All trip routes require the user to be authenticated
router.use(authenticate);

router.post('/plan', createOrUpdateTrip);
router.get('/', getUserTrips);
router.get('/:tripId', getTripById);
router.post('/:tripId/approve', approveTrip);
router.post('/:tripId/reject', rejectTrip);
router.delete('/:tripId', cancelTrip);

export default router;
```

#### `server/src/controllers/adminController.ts`

```typescript
import { Request, Response } from 'express';
import Trip from '../models/Trip';
import User from '../models/User';

// GET /api/admin/trips — View ALL trips across all users (admin only)
export const getAllTrips = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, destination, page = 1, limit = 20 } = req.query;
    const query: any = {};
    if (status) query.status = status;
    if (destination) query['input.destination'] = new RegExp(destination as string, 'i');

    const trips = await Trip.find(query)
      .populate('userId', 'name email')
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit));

    const total = await Trip.countDocuments(query);
    res.json({ trips, total, page: Number(page) });
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch trips' });
  }
};

// GET /api/admin/analytics — Dashboard stats for charts
export const getAnalytics = async (_req: Request, res: Response): Promise<void> => {
  try {
    // MongoDB aggregation pipelines — count, group, average in the database layer
    const [statusCounts, topDestinations, avgBudget, totalUsers] = await Promise.all([
      // How many trips are in each status
      Trip.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      
      // Most popular destinations
      Trip.aggregate([
        { $group: { _id: '$input.destination', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      
      // Average trip budget
      Trip.aggregate([{ $group: { _id: null, avg: { $avg: '$input.budget_inr' } } }]),
      
      // Total registered users
      User.countDocuments(),
    ]);

    res.json({
      statusCounts,
      topDestinations,
      avgBudget: avgBudget[0]?.avg || 0,
      totalUsers,
      totalTrips: await Trip.countDocuments(),
    });
  } catch (error) {
    res.status(500).json({ message: 'Analytics failed' });
  }
};
```

#### `server/src/routes/adminRoutes.ts`

```typescript
import { Router } from 'express';
import { authenticate, authorizeAdmin } from '../middleware/auth';
import { getAllTrips, getAnalytics } from '../controllers/adminController';

const router = Router();

// Both middlewares run: first verify JWT, then verify admin role
router.use(authenticate, authorizeAdmin);

router.get('/trips', getAllTrips);
router.get('/analytics', getAnalytics);

export default router;
```

**Add routes to `server/src/index.ts`:**
```typescript
import tripRoutes from './routes/tripRoutes';
import adminRoutes from './routes/adminRoutes';

// Add these two lines in the Routes section:
app.use('/api/trips', tripRoutes);
app.use('/api/admin', adminRoutes);
```

---

### Step 2.6 — Initialize Frontend (client/)

```bash
# From project root:
cd "d:\Presidio Capstone Project"

# Create React app with Vite (TypeScript + React template)
npm create vite@latest client -- --template react-ts
cd client

# Install all frontend dependencies
npm install
npm install axios @tanstack/react-query zustand react-hook-form @hookform/resolvers zod react-router-dom chart.js react-chartjs-2 react-markdown

# Install Tailwind CSS
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

**Configure Tailwind (`client/tailwind.config.js`):**
```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#6366f1', // Indigo
        dark: '#0f0f23',
        card: '#1a1a2e',
      },
    },
  },
  plugins: [],
};
```

**Update `client/src/index.css`:**
```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* Custom global styles */
body {
  background-color: #0f0f23;
  color: #e2e8f0;
  font-family: 'Inter', sans-serif;
}
```

---

### Step 2.7 — Frontend Core Files

#### `client/src/lib/axios.ts`

```typescript
// Our Axios instance — this is a pre-configured HTTP client.
// All API calls go through this, so baseURL and auth headers are set once.
// The interceptor automatically refreshes the JWT token when it expires.

import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  withCredentials: true, // Include cookies (refresh token) in every request
  headers: { 'Content-Type': 'application/json' },
});

// Attach JWT access token to every outgoing request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// If a request returns 401 (expired token), automatically try to refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      try {
        const { data } = await axios.post(
          `${import.meta.env.VITE_API_URL || 'http://localhost:5000/api'}/auth/refresh`,
          {},
          { withCredentials: true }
        );
        localStorage.setItem('accessToken', data.accessToken);
        originalRequest.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(originalRequest); // Retry the original request with new token
      } catch {
        localStorage.removeItem('accessToken');
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  }
);

export default api;
```

#### `client/src/store/authStore.ts`

```typescript
// Zustand global state store for authentication.
// Zustand is simpler than Redux — just functions that update state.
// useAuthStore() gives any component access to current user + auth actions.

import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  name: string;
  email: string;
  role: 'traveler' | 'admin';
}

interface AuthState {
  user: User | null;
  accessToken: string | null;
  setAuth: (user: User, token: string) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      accessToken: null,
      setAuth: (user, accessToken) => {
        localStorage.setItem('accessToken', accessToken);
        set({ user, accessToken });
      },
      logout: () => {
        localStorage.removeItem('accessToken');
        set({ user: null, accessToken: null });
      },
      isAuthenticated: () => !!get().user,
    }),
    { name: 'auth-storage' } // Persists to localStorage so login survives page refresh
  )
);
```

#### `client/src/schemas/authSchemas.ts`

```typescript
// Zod validation schemas — these define the shape and rules for form data.
// React Hook Form uses these to validate BEFORE submitting to the API.
// This gives instant, type-safe client-side feedback without a network round-trip.

import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const registerSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Please enter a valid email address'),
  password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Must contain at least one number'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export type LoginFormData = z.infer<typeof loginSchema>;
export type RegisterFormData = z.infer<typeof registerSchema>;
```

#### `client/src/pages/LoginPage.tsx`

```typescript
// Login page using React Hook Form + Zod validation.
// useForm manages form state (values, errors, submission state).
// zodResolver connects our Zod schema to React Hook Form.

import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, Link } from 'react-router-dom';
import { loginSchema, LoginFormData } from '../schemas/authSchemas';
import { useAuthStore } from '../store/authStore';
import api from '../lib/axios';

export default function LoginPage() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);

  const { register, handleSubmit, formState: { errors, isSubmitting }, setError } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormData) => {
    try {
      const res = await api.post('/auth/login', data);
      setAuth(res.data.user, res.data.accessToken);
      navigate(res.data.user.role === 'admin' ? '/admin' : '/dashboard');
    } catch (err: any) {
      setError('root', { message: err.response?.data?.message || 'Login failed' });
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-dark">
      <div className="w-full max-w-md p-8 rounded-2xl bg-card shadow-2xl border border-indigo-500/20">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-white mb-2">✈️ Travel Planner AI</h1>
          <p className="text-slate-400">Sign in to plan your next adventure</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Email</label>
            <input
              {...register('email')}
              type="email"
              className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:border-primary focus:outline-none transition"
              placeholder="you@example.com"
            />
            {errors.email && <p className="text-red-400 text-sm mt-1">{errors.email.message}</p>}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
            <input
              {...register('password')}
              type="password"
              className="w-full px-4 py-3 rounded-lg bg-slate-800 border border-slate-700 text-white focus:border-primary focus:outline-none transition"
              placeholder="••••••••"
            />
            {errors.password && <p className="text-red-400 text-sm mt-1">{errors.password.message}</p>}
          </div>

          {errors.root && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {errors.root.message}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full py-3 px-4 bg-primary hover:bg-indigo-500 disabled:opacity-50 text-white font-semibold rounded-lg transition"
          >
            {isSubmitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        <p className="text-center text-slate-400 mt-6">
          No account?{' '}
          <Link to="/register" className="text-primary hover:underline">Create one</Link>
        </p>
      </div>
    </div>
  );
}
```

#### `client/src/pages/ChatPage.tsx` (Trip Planning Chat)

```typescript
// The main user-facing feature. A chat interface where users describe their trip.
// Uses TanStack Query for the API mutation (not useState — TanStack handles
// loading/error states automatically). The conversation is multi-turn:
// user can respond to clarifying questions.

import { useState, useRef, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import ReactMarkdown from 'react-markdown';
import api from '../lib/axios';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  type?: 'plan' | 'question' | 'confirm' | 'text';
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    { role: 'assistant', content: "Hi! I'm your AI Travel Planner 🗺️. Tell me where you want to go, your budget, and travel dates, and I'll plan the perfect trip!", type: 'text' }
  ]);
  const [input, setInput] = useState('');
  const [currentTripId, setCurrentTripId] = useState<string | undefined>();
  const [waitingForApproval, setWaitingForApproval] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to latest message
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const planMutation = useMutation({
    mutationFn: (message: string) =>
      api.post('/trips/plan', { message, tripId: currentTripId }).then((r) => r.data),
    onSuccess: (data) => {
      if (data.status === 'NEEDS_INFO') {
        setCurrentTripId(data.tripId);
        setMessages((m) => [...m, { role: 'assistant', content: data.clarifyingQuestion, type: 'question' }]);
      } else if (data.status === 'PLANNED') {
        setCurrentTripId(data.tripId);
        setWaitingForApproval(true);
        setMessages((m) => [
          ...m,
          { role: 'assistant', content: data.plan, type: 'plan' },
          { role: 'assistant', content: '**Would you like to confirm this trip?** Click Approve to book, or tell me what you\'d like to change.', type: 'confirm' },
        ]);
      }
    },
  });

  const approveMutation = useMutation({
    mutationFn: () => api.post(`/trips/${currentTripId}/approve`).then((r) => r.data),
    onSuccess: (data) => {
      setWaitingForApproval(false);
      setMessages((m) => [
        ...m,
        { role: 'assistant', content: `✅ **Trip Confirmed!** Your booking reference is: \`${data.bookingRefs?.hotel}\`. Check your email for calendar invites!`, type: 'text' },
      ]);
    },
  });

  const handleSend = () => {
    if (!input.trim()) return;
    setMessages((m) => [...m, { role: 'user', content: input }]);
    
    // If user types something while waiting for approval = they want to modify
    if (waitingForApproval) {
      setWaitingForApproval(false);
      api.post(`/trips/${currentTripId}/reject`, { reason: input });
    }
    
    planMutation.mutate(input);
    setInput('');
  };

  return (
    <div className="flex flex-col h-screen bg-dark">
      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-700 bg-card">
        <h1 className="text-xl font-bold text-white">✈️ AI Trip Planner</h1>
        <p className="text-slate-400 text-sm">Powered by Groq + LangChain AI Agents</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-3xl px-4 py-3 rounded-2xl text-sm ${
              msg.role === 'user'
                ? 'bg-primary text-white rounded-br-sm'
                : 'bg-card border border-slate-700 text-slate-200 rounded-bl-sm'
            }`}>
              {msg.type === 'plan' ? (
                // Render the AI markdown plan with full formatting
                <ReactMarkdown className="prose prose-invert max-w-none prose-sm">
                  {msg.content}
                </ReactMarkdown>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        
        {/* Loading indicator while agents are running */}
        {planMutation.isPending && (
          <div className="flex justify-start">
            <div className="bg-card border border-slate-700 px-4 py-3 rounded-2xl">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" />
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                <div className="w-2 h-2 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
              </div>
              <p className="text-slate-400 text-xs mt-1">AI agents working...</p>
            </div>
          </div>
        )}

        {/* HITL Approve/Modify buttons */}
        {waitingForApproval && (
          <div className="flex gap-3 justify-center">
            <button
              onClick={() => approveMutation.mutate()}
              disabled={approveMutation.isPending}
              className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white rounded-lg font-semibold transition"
            >
              ✅ Approve & Book
            </button>
            <button
              onClick={() => setInput('I want to modify the plan: ')}
              className="px-6 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-semibold transition"
            >
              ✏️ Modify Plan
            </button>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      {/* Input box */}
      <div className="px-4 py-4 border-t border-slate-700 bg-card">
        <div className="flex gap-3">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Describe your dream trip... (e.g., Ooty for 5 days, ₹30,000 budget)"
            className="flex-1 px-4 py-3 rounded-xl bg-slate-800 border border-slate-700 text-white focus:border-primary focus:outline-none"
          />
          <button
            onClick={handleSend}
            disabled={planMutation.isPending || !input.trim()}
            className="px-6 py-3 bg-primary hover:bg-indigo-500 disabled:opacity-50 text-white rounded-xl font-semibold transition"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## Day 3 — Admin Dashboard + Docker + AWS + CI/CD

**Goal by end of Day 3:** Everything is deployed on AWS, accessible via HTTPS.

---

### Step 3.1 — Admin Dashboard Page (`client/src/pages/AdminPage.tsx`)

```typescript
// Admin dashboard uses Chart.js via react-chartjs-2 to visualize:
// - Trip status distribution (doughnut chart)
// - Top destinations (bar chart)
// - All trips table with filter

import { useQuery } from '@tanstack/react-query';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js';
import { Doughnut, Bar } from 'react-chartjs-2';
import api from '../lib/axios';

ChartJS.register(ArcElement, Tooltip, Legend, BarElement, CategoryScale, LinearScale);

export default function AdminPage() {
  // TanStack Query: auto-fetches, caches, and re-fetches on window focus
  const { data: analytics } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: () => api.get('/admin/analytics').then((r) => r.data),
  });

  const statusChartData = {
    labels: analytics?.statusCounts?.map((s: any) => s._id) || [],
    datasets: [{
      data: analytics?.statusCounts?.map((s: any) => s.count) || [],
      backgroundColor: ['#6366f1', '#22c55e', '#f59e0b', '#ef4444'],
    }],
  };

  const destChartData = {
    labels: analytics?.topDestinations?.slice(0, 8).map((d: any) => d._id) || [],
    datasets: [{
      label: 'Trip Count',
      data: analytics?.topDestinations?.slice(0, 8).map((d: any) => d.count) || [],
      backgroundColor: '#6366f1',
    }],
  };

  return (
    <div className="min-h-screen bg-dark p-6">
      <h1 className="text-3xl font-bold text-white mb-8">🛡️ Admin Dashboard</h1>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {[
          { label: 'Total Users', value: analytics?.totalUsers || 0, color: 'indigo' },
          { label: 'Total Trips', value: analytics?.totalTrips || 0, color: 'green' },
          { label: 'Avg Budget', value: `₹${Math.round(analytics?.avgBudget || 0).toLocaleString()}`, color: 'yellow' },
        ].map((stat) => (
          <div key={stat.label} className="bg-card border border-slate-700 rounded-xl p-6">
            <p className="text-slate-400 text-sm">{stat.label}</p>
            <p className="text-3xl font-bold text-white mt-2">{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
        <div className="bg-card border border-slate-700 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-4">Trip Status Distribution</h2>
          <Doughnut data={statusChartData} />
        </div>
        <div className="bg-card border border-slate-700 rounded-xl p-6">
          <h2 className="text-white font-semibold mb-4">Top Destinations</h2>
          <Bar data={destChartData} options={{ plugins: { legend: { display: false } } }} />
        </div>
      </div>
    </div>
  );
}
```

---

### Step 3.2 — App Router (`client/src/App.tsx`)

```typescript
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAuthStore } from './store/authStore';
import LoginPage from './pages/LoginPage';
import ChatPage from './pages/ChatPage';
import AdminPage from './pages/AdminPage';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 2, staleTime: 5 * 60 * 1000 }, // Cache responses for 5 min
  },
});

// Route guard: redirect to login if not authenticated
const PrivateRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
};

const AdminRoute = ({ children }: { children: React.ReactNode }) => {
  const user = useAuthStore((s) => s.user);
  return user?.role === 'admin' ? <>{children}</> : <Navigate to="/dashboard" replace />;
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<LoginPage />} /> {/* Reuse with prop */}
          <Route path="/dashboard" element={<PrivateRoute><ChatPage /></PrivateRoute>} />
          <Route path="/admin" element={<PrivateRoute><AdminRoute><AdminPage /></AdminRoute></PrivateRoute>} />
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}
```

---

### Step 3.3 — Docker Setup

#### `server/Dockerfile`

```dockerfile
# Multi-stage build: Stage 1 builds TypeScript, Stage 2 runs compiled JS
# Why multi-stage? The final image doesn't include TypeScript compiler or dev tools
# — it's lean, fast, and secure.

# Stage 1: Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production=false
COPY . .
RUN npm run build

# Stage 2: Production runtime — much smaller image
FROM node:20-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production  # Only install production dependencies
COPY --from=builder /app/dist ./dist
EXPOSE 5000
USER node  # Run as non-root for security
CMD ["node", "dist/index.js"]
```

#### `client/Dockerfile`

```dockerfile
# Frontend also uses multi-stage: Vite builds a static bundle, Nginx serves it
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Static hosting with Nginx
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

#### `docker-compose.yml` (Local development)

```yaml
# Local dev: runs API + Redis together with hot-reload via volumes
# docker-compose up -d starts everything with one command

services:
  api:
    build: ./server
    ports:
      - "5000:5000"
    environment:
      - NODE_ENV=development
    env_file:
      - ./server/.env
    volumes:
      - ./server/src:/app/src  # Hot reload in dev
    depends_on:
      - redis
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"
    command: redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru
    restart: unless-stopped
```

---

### Step 3.4 — Terraform Infrastructure

#### `infrastructure/main.tf`

```hcl
# Terraform provisions ALL AWS resources automatically.
# Without Terraform: you'd click through 20 AWS console pages manually.
# With Terraform: one command deploys everything reproducibly.

provider "aws" {
  region = var.aws_region
}

# EC2 instance for our Express API + Redis Docker containers
resource "aws_instance" "travel_planner_api" {
  ami                    = "ami-0c55b159cbfafe1f0" # Amazon Linux 2 in us-east-1
  instance_type          = "t2.micro"              # Free tier eligible!
  key_name               = var.key_pair_name
  vpc_security_group_ids = [aws_security_group.api_sg.id]
  iam_instance_profile   = aws_iam_instance_profile.ec2_profile.name

  # User data runs automatically on first boot — installs Docker + starts containers
  user_data = <<-EOF
    #!/bin/bash
    yum update -y
    amazon-linux-extras install docker -y
    service docker start
    usermod -a -G docker ec2-user
    
    # Install Docker Compose
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
    
    # Pull the latest API image from Docker Hub and start it
    docker pull ${var.docker_image_api}:latest
    cd /home/ec2-user
    cat > docker-compose.yml <<COMPOSE
    services:
      api:
        image: ${var.docker_image_api}:latest
        ports:
          - "5000:5000"
        environment:
          - NODE_ENV=production
          - MONGO_URI=${var.mongo_uri}
          - REDIS_URL=redis://redis:6379
          - GROQ_API_KEY=${var.groq_api_key}
          - JWT_ACCESS_SECRET=${var.jwt_access_secret}
          - JWT_REFRESH_SECRET=${var.jwt_refresh_secret}
          - GOOGLE_MAPS_API_KEY=${var.google_maps_key}
        depends_on:
          - redis
        restart: unless-stopped
      redis:
        image: redis:7-alpine
        restart: unless-stopped
        command: redis-server --maxmemory 128mb --maxmemory-policy allkeys-lru
    COMPOSE
    docker-compose up -d
  EOF

  tags = { Name = "travel-planner-api" }
}

# Security group = AWS firewall rules for our EC2 instance
resource "aws_security_group" "api_sg" {
  name        = "travel-planner-api-sg"
  description = "Allow web traffic to API"

  ingress {
    from_port   = 22
    to_port     = 22
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"] # SSH access — restrict to your IP in production!
  }

  ingress {
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    from_port   = 5000
    to_port     = 5000
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

# S3 bucket to host the built React frontend files
resource "aws_s3_bucket" "frontend" {
  bucket = "${var.project_name}-frontend-${random_id.bucket_suffix.hex}"
  tags = { Name = "travel-planner-frontend" }
}

resource "random_id" "bucket_suffix" { byte_length = 4 }

resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  index_document { suffix = "index.html" }
  error_document { key = "index.html" } # SPA fallback — all routes serve index.html
}

# CloudFront CDN in front of S3 — gives HTTPS + global edge caching
resource "aws_cloudfront_distribution" "frontend" {
  origin {
    domain_name = aws_s3_bucket.frontend.bucket_regional_domain_name
    origin_id   = "S3-${aws_s3_bucket.frontend.bucket}"
  }

  enabled             = true
  default_root_object = "index.html"
  price_class         = "PriceClass_100" # Only North America/Europe edges — cheapest

  default_cache_behavior {
    allowed_methods        = ["GET", "HEAD"]
    cached_methods         = ["GET", "HEAD"]
    target_origin_id       = "S3-${aws_s3_bucket.frontend.bucket}"
    viewer_protocol_policy = "redirect-to-https"

    forwarded_values {
      query_string = false
      cookies { forward = "none" }
    }
  }

  restrictions { geo_restriction { restriction_type = "none" } }
  viewer_certificate { cloudfront_default_certificate = true }
}
```

#### `infrastructure/variables.tf`

```hcl
variable "aws_region"        { default = "us-east-1" }
variable "project_name"      { default = "travel-planner" }
variable "key_pair_name"     { description = "Your EC2 SSH key pair name" }
variable "docker_image_api"  { description = "Docker Hub image e.g. yourusername/travel-planner-api" }
variable "mongo_uri"         { sensitive = true }
variable "groq_api_key"      { sensitive = true }
variable "jwt_access_secret" { sensitive = true }
variable "jwt_refresh_secret"{ sensitive = true }
variable "google_maps_key"   { sensitive = true }
```

#### `infrastructure/outputs.tf`

```hcl
output "api_public_ip"        { value = aws_instance.travel_planner_api.public_ip }
output "cloudfront_domain"    { value = aws_cloudfront_distribution.frontend.domain_name }
output "s3_bucket_name"       { value = aws_s3_bucket.frontend.bucket }
```

---

### Step 3.5 — GitHub Actions CI/CD

#### `.github/workflows/ci.yml`

```yaml
# CI Pipeline: runs on every Pull Request to main
# Catches bugs BEFORE they get merged — linting, testing, security audit, Docker build

name: CI Pipeline

on:
  pull_request:
    branches: [main]

jobs:
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install server dependencies
        run: cd server && npm ci

      - name: TypeScript type check
        run: cd server && npx tsc --noEmit

      - name: Security audit
        run: cd server && npm audit --audit-level=high

      - name: Install client dependencies
        run: cd client && npm ci

      - name: Build frontend
        run: cd client && npm run build

  docker-build:
    runs-on: ubuntu-latest
    needs: lint-and-test
    steps:
      - uses: actions/checkout@v4

      - name: Build API Docker image
        run: docker build ./server -t travel-planner-api:test

      - name: Build Frontend Docker image
        run: docker build ./client -t travel-planner-client:test
```

#### `.github/workflows/cd.yml`

```yaml
# CD Pipeline: runs when code is merged to main
# Builds Docker images, pushes to Docker Hub, SSHs into EC2 and pulls latest image

name: CD Pipeline

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Login to Docker Hub
        uses: docker/login-action@v3
        with:
          username: ${{ secrets.DOCKERHUB_USERNAME }}
          password: ${{ secrets.DOCKERHUB_TOKEN }}

      - name: Build and push API image
        run: |
          docker build ./server -t ${{ secrets.DOCKERHUB_USERNAME }}/travel-planner-api:latest
          docker push ${{ secrets.DOCKERHUB_USERNAME }}/travel-planner-api:latest

      - name: Build React frontend
        run: |
          cd client
          echo "VITE_API_URL=https://${{ secrets.CLOUDFRONT_DOMAIN }}/api" > .env.production
          npm ci
          npm run build

      - name: Deploy frontend to S3
        uses: aws-actions/configure-aws-credentials@v4
        with:
          aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
          aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          aws-region: us-east-1

      - run: aws s3 sync ./client/dist s3://${{ secrets.S3_BUCKET_NAME }} --delete

      - name: Invalidate CloudFront cache
        run: aws cloudfront create-invalidation --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} --paths "/*"

      - name: Deploy API to EC2
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.EC2_HOST }}
          username: ec2-user
          key: ${{ secrets.EC2_SSH_KEY }}
          script: |
            docker pull ${{ secrets.DOCKERHUB_USERNAME }}/travel-planner-api:latest
            docker-compose -f /home/ec2-user/docker-compose.yml up -d api
            echo "Deployment complete!"
```

**GitHub Secrets to Set (in repo Settings → Secrets):**
```
DOCKERHUB_USERNAME
DOCKERHUB_TOKEN
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
EC2_HOST                 (your EC2 public IP)
EC2_SSH_KEY              (contents of your .pem private key file)
S3_BUCKET_NAME
CLOUDFRONT_DISTRIBUTION_ID
CLOUDFRONT_DOMAIN
```

---

### Step 3.6 — Deployment Commands (Run Once)

```bash
# Step 1: Initialize Terraform
cd infrastructure
terraform init

# Step 2: Preview what Terraform will create (no charges yet)
terraform plan -var="key_pair_name=your-key" -var="docker_image_api=yourdockerhub/travel-planner-api" -var="mongo_uri=mongodb+srv://..." -var="groq_api_key=gsk_..." -var="jwt_access_secret=secret1" -var="jwt_refresh_secret=secret2" -var="google_maps_key=AIza..."

# Step 3: Create everything on AWS
terraform apply (same vars as above) -auto-approve

# Step 4: Note the outputs:
# api_public_ip = "54.xxx.xxx.xxx"
# cloudfront_domain = "dxxxxx.cloudfront.net"
# s3_bucket_name = "travel-planner-frontend-xxxx"

# Step 5: Build and push Docker API image (do this before Terraform or after)
cd ../server
docker build -t yourdockerhub/travel-planner-api:latest .
docker push yourdockerhub/travel-planner-api:latest

# Step 6: Build and upload frontend
cd ../client
VITE_API_URL=https://YOUR_EC2_IP:5000/api npm run build
aws s3 sync dist/ s3://YOUR_S3_BUCKET_NAME --delete
```

---

## Final Verification Checklist

- [ ] `GET /health` returns `{ status: "ok" }`
- [ ] `POST /api/auth/register` creates user in MongoDB Atlas
- [ ] `POST /api/auth/login` returns JWT
- [ ] `POST /api/trips/plan` triggers all agents and returns plan
- [ ] `POST /api/trips/:id/approve` sets status to CONFIRMED
- [ ] Admin user can access `/api/admin/analytics`
- [ ] Frontend builds without errors (`npm run build`)
- [ ] Docker containers start with `docker-compose up`
- [ ] GitHub Actions CI passes on PR
- [ ] EC2 instance is reachable at public IP
- [ ] Frontend loads from CloudFront HTTPS URL
- [ ] MongoDB Atlas shows data in Collections tab

---

## Architecture Decision Summary

| Decision | Why |
|---|---|
| MVC pattern on backend | Clear separation: Models (data), Controllers (HTTP), Services (business logic) |
| TripContext shared object | Agents communicate through data, not function calls — easy to test each agent independently |
| Promise.allSettled for parallel agents | Even if one agent fails, others continue — resilient design |
| Redis per-agent caching | Weather/hotel data doesn't change every minute — avoid redundant API calls |
| JWT access (15m) + httpOnly refresh cookie | Access tokens short-lived for security; refresh cookie not accessible to JS (XSS protection) |
| Groq LLM (free) | No credit card needed for capstone; Llama 3 is production-quality |
| OpenMeteo for weather | 100% free, no API key, good accuracy for Indian destinations |
| Mock transit/hotel data | Real booking APIs require business registration; architecture is identical |
| Multi-stage Docker builds | Smaller production images = faster deployment and lower attack surface |
| Terraform for IaC | Reproducible infrastructure; tear down and recreate in minutes |
