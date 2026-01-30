# Genre classifier using Essentia's Discogs-Effnet models
FROM python:3.11-bookworm

# Install ffmpeg for audio decoding and chromaprint for fingerprinting
RUN apt-get update && apt-get install -y \
    ffmpeg \
    libchromaprint-tools \
    && rm -rf /var/lib/apt/lists/*

# Install essentia with TensorFlow support and mutagen for tag writing
RUN pip3 install essentia-tensorflow mutagen

WORKDIR /app

# Download models
RUN mkdir -p models

# Download embedding model (SavedModel format)
RUN curl -L -o /tmp/discogs-effnet.zip \
    "https://essentia.upf.edu/models/feature-extractors/discogs-effnet/discogs-effnet-bs64-1-savedmodel.zip" && \
    unzip /tmp/discogs-effnet.zip -d models/ && \
    mv models/effnetdiscogs-bs64-1-savedmodel models/discogs-effnet && \
    rm /tmp/discogs-effnet.zip

# Download labels
RUN curl -L -o models/genre_discogs400-discogs-effnet-1.json \
    "https://essentia.upf.edu/models/feature-extractors/discogs-effnet/discogs-effnet-bs64-1.json"

# Download MSD-MusiCNN embedding model for arousal/energy prediction
RUN curl -L -o models/msd-musicnn-1.pb \
    "https://essentia.upf.edu/models/feature-extractors/musicnn/msd-musicnn-1.pb"

# Download emomusic classification head (predicts arousal and valence)
RUN curl -L -o models/emomusic-msd-musicnn-2.pb \
    "https://essentia.upf.edu/models/classification-heads/emomusic/emomusic-msd-musicnn-2.pb"

# Copy source files
COPY src/analyzers/ ./analyzers/
COPY src/utils.py ./
COPY src/converter.py ./
COPY src/classify.py ./

ENTRYPOINT ["python3", "classify.py"]
CMD ["--help"]
