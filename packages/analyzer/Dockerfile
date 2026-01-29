# Dockerfile for the music analyzer CLI
FROM node:22-bookworm

# Install ffmpeg for audio decoding
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source and build
COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# Create directories for models (downloaded on first run)
RUN mkdir -p models

# Set entrypoint
ENTRYPOINT ["node", "dist/index.js"]
CMD ["--help"]
