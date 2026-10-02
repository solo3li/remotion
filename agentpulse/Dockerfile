# Multi-stage Dockerfile for AgentPulse
# Stage 1: Build Vite Frontend
FROM node:20-slim AS frontend-builder
WORKDIR /build
COPY apps/app ./apps/app
WORKDIR /build/apps/app
RUN npm install
ENV VITE_BASE=/agentpulse/
ENV VITE_API_BASE=/agentpulse/api
RUN npm run build

# Stage 2: Runtime with Python 3.12 & Nginx
FROM python:3.12-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    nginx \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install Python requirements
COPY services/api/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend code
COPY services/api/app ./app

# Copy built frontend into /var/www/agentpulse
RUN mkdir -p /var/www/agentpulse /data
COPY --from=frontend-builder /build/apps/app/dist /var/www/agentpulse

# Copy nginx config & entrypoint script
RUN rm -rf /etc/nginx/sites-enabled/* /etc/nginx/conf.d/*
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

ENV AGENTPULSE_HOME=/data
ENV AGENTPULSE_PORT=8787
ENV AGENTPULSE_PLATFORM=linux
ENV PYTHONUNBUFFERED=1

EXPOSE 80

VOLUME ["/data"]

ENTRYPOINT ["/entrypoint.sh"]
