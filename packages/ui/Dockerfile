FROM node:22-slim

# Install yt-dlp, ffmpeg, Docker CLI, sqlite3, and dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    curl \
    ffmpeg \
    docker.io \
    sqlite3 \
    && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
    && chmod a+rx /usr/local/bin/yt-dlp \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy app source
COPY . .

# Build the app
RUN npm run build

# Create data directory and make runtime directories writable for non-root users
RUN mkdir -p /app/data && chmod -R 777 /app/.nuxt /app/.output /app/node_modules/.cache /app/data 2>/dev/null || true

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
