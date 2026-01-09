# ======================
# Stage 1 — build
# ======================
FROM node:20-alpine AS build

RUN apk add --no-cache \
    python3 \
    py3-pip \
    build-base \
    git

RUN python3 -m venv /opt/venv \
    && /opt/venv/bin/pip install --upgrade pip \
    && /opt/venv/bin/pip install --no-cache-dir guessit

ENV PATH="/opt/venv/bin:$PATH"

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY . .

# ======================
# Stage 2 — runtime
# ======================
FROM node:20-alpine

RUN apk add --no-cache \
    python3 \
    mediainfo \
    mktorrent \
    bash \
    inotify-tools \
    curl \
    jq \
    su-exec

WORKDIR /app

COPY --from=build /opt/venv /opt/venv
COPY --from=build /app /app

ENV PATH="/opt/venv/bin:$PATH"

COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

VOLUME ["/data/films", "/data/torrent", "/data/cache_tmdb"]

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD pgrep inotifywait >/dev/null || exit 1

ENTRYPOINT ["/entrypoint.sh"]
CMD ["sh", "/app/watch.sh"]
