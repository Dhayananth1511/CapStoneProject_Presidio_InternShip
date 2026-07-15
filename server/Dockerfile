# ============================================================
# server/Dockerfile — Multi-Stage Build
# Stage 1 (builder): Install all deps + compile TypeScript → JS
# Stage 2 (production): Only production deps + compiled dist/
# Result: Lean, secure image with no TypeScript compiler or devtools
# ============================================================

# ── Stage 1: Build ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files FIRST so Docker caches this layer
# (Dependencies only reinstall when package.json changes — faster builds)
COPY package*.json ./

# Install ALL deps (including devDependencies for TypeScript compiler)
RUN npm ci

# Copy source code
COPY . .

# Compile TypeScript → JavaScript (output goes to /app/dist/)
RUN npm run build

# ── Stage 2: Production Runtime ─────────────────────────────
FROM node:20-alpine AS production

# Set working directory
WORKDIR /app

# Copy only package files
COPY package*.json ./

# Install ONLY production dependencies (no TypeScript, no nodemon, etc.)
# This keeps the final image small
RUN npm ci --only=production

# Copy compiled JavaScript from the builder stage
COPY --from=builder /app/dist ./dist

# Create logs directory and set ownership to node user
RUN mkdir -p /app/logs && chown -R node:node /app/logs

# Expose the port the API runs on
EXPOSE 5000

# Run as non-root user for security (node user exists in node:alpine)
USER node

# Start the compiled server
CMD ["node", "dist/index.js"]
