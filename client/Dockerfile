# -------------------------------------------------------------
# Stage 1: Build the Vite + React client
# -------------------------------------------------------------
FROM node:lts-alpine AS builder

WORKDIR /app

# Update Alpine packages to patch CVEs
RUN apk update && apk upgrade --no-cache

# Copy dependency manifests
COPY package*.json ./
RUN npm ci

# Copy client source code
COPY . .

# Build production assets into /app/dist
RUN npm run build

# -------------------------------------------------------------
# Stage 2: Serve production assets with high-performance Nginx
# -------------------------------------------------------------
FROM nginx:alpine-slim AS runner

# Patch OS-level CVEs by updating base Alpine packages
RUN apk update && apk upgrade --no-cache

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy built static files from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration with SPA fallback & API proxying
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

HEALTHCHECK --interval=15s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/healthz || exit 1

CMD ["nginx", "-g", "daemon off;"]

