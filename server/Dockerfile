# Multi-stage build for efficient caching and smaller production footprints.
# Stage 1: Build TypeScript source code
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# Stage 2: Runtime image containing only production assets
FROM node:20-alpine AS production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
EXPOSE 5000
USER node
CMD ["node", "dist/index.js"]
