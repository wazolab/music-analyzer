FROM node:22-slim

# Install yt-dlp, Docker CLI, and dependencies
RUN apt-get update && apt-get install -y \
    python3 \
    curl \
    docker.io \
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

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
