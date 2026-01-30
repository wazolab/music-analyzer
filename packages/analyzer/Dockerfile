# Genre classifier using Essentia's Discogs-Effnet models
FROM python:3.11-bookworm

# Install ffmpeg for audio decoding
RUN apt-get update && apt-get install -y \
    ffmpeg \
    && rm -rf /var/lib/apt/lists/*

# Install essentia with TensorFlow support
RUN pip3 install essentia-tensorflow

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

# Copy source files
COPY src/analyzers/ ./analyzers/
COPY src/utils.py ./
COPY src/classify.py ./

ENTRYPOINT ["python3", "classify.py"]
CMD ["--help"]
