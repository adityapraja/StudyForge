# -------------------------------------------------------------
# StudyForge Backend API - Production Dockerfile (Node LTS Alpine)
# -------------------------------------------------------------
FROM node:lts-alpine AS runner

WORKDIR /app

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Apply latest OS security updates
RUN apk update && apk upgrade --no-cache

# Install dependencies first for optimal Docker layer caching
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# Copy application source code, schema, and migrations
COPY src/ ./src/
COPY schema.sql ./
COPY migrations/ ./migrations/

# Run as non-root user for security
USER node

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/healthz || exit 1

CMD ["node", "src/server.js"]

