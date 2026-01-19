# ========================================
# Stage 1: Build Frontend
# ========================================
FROM node:20-alpine AS frontend-builder

WORKDIR /build

# Copy frontend package files
COPY frontend/package*.json ./
RUN npm ci

# Copy frontend source and build
COPY frontend/ ./
RUN npm run build

# ========================================
# Stage 2: Production
# ========================================
FROM node:20-alpine

# ----------------------
# Dépendances système
# ----------------------
RUN apk add --no-cache \
    python3 \
    py3-pip \
    mediainfo \
    mktorrent \
    bash \
    git \
    build-base \
    curl \
    jq

# ----------------------
# Python : venv pour PEP 668
# ----------------------
RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir guessit

ENV PATH="/opt/venv/bin:$PATH"

# ----------------------
# Backend Node.js dependencies
# ----------------------
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev

# ----------------------
# Copy backend code
# ----------------------
COPY backend/ ./backend/
COPY scene-maker.js ./
COPY docker-entrypoint.sh ./
RUN chmod +x docker-entrypoint.sh scene-maker.js

# ----------------------
# Copy frontend build from stage 1
# ----------------------
COPY --from=frontend-builder /build/dist ./frontend/dist

# ----------------------
# Environment variables
# ----------------------
ENV WEB_PORT=3000
ENV NODE_ENV=production

# ----------------------
# Data directory (config only, media volumes configured by user)
# ----------------------
RUN mkdir -p /data/config

# ----------------------
# Expose web port
# ----------------------
EXPOSE 3000

# ----------------------
# Lancement
# ----------------------
CMD ["node", "backend/server.js"]
