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

# Create directories for models and pre-download them
RUN mkdir -p models

# Pre-download genre classification model (MusiCNN/Discogs400)
RUN MODEL_BASE="https://raw.githubusercontent.com/MTG/essentia.js/master/examples/demos/discogs-autotagging/views/src/audio/model-tfjs" && \
    mkdir -p models/tfjs-genre && \
    curl -L -o models/tfjs-genre/model.json "$MODEL_BASE/model.json" && \
    for i in 1 2 3 4 5 6 7 8 9 10 11; do \
      curl -L -o "models/tfjs-genre/group1-shard${i}of11.bin" "$MODEL_BASE/group1-shard${i}of11.bin"; \
    done

# Pre-download genre labels
RUN curl -L -o models/labels.js \
    "https://raw.githubusercontent.com/MTG/essentia.js/master/examples/demos/discogs-autotagging/views/src/audio/labels.js" && \
    node -e "const c=require('fs').readFileSync('models/labels.js','utf-8'); \
             const m=c.match(/\\[([^\\]]+)\\]/); \
             if(m){const l=m[1].split(',').map(s=>s.trim().replace(/['\"]*/g,'')).filter(s=>s); \
             require('fs').writeFileSync('models/genre-labels.json',JSON.stringify(l));}"

# Set entrypoint
ENTRYPOINT ["node", "dist/index.js"]
CMD ["--help"]
