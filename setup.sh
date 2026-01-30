#!/bin/bash
# Music Analyzer - Quick Setup Script
# Run this after cloning the repository

set -e

echo "=== Music Analyzer Setup ==="
echo

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed. Please install Docker first."
    echo "  Ubuntu: sudo apt install docker.io docker-compose-v2"
    echo "  Or visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check for Docker Compose
if ! docker compose version &> /dev/null; then
    echo "Error: Docker Compose v2 is not installed."
    echo "  Ubuntu: sudo apt install docker-compose-v2"
    exit 1
fi

echo "Docker found: $(docker --version)"
echo

# Create .env if it doesn't exist
if [ ! -f .env ]; then
    echo "Creating .env file from .env.example..."
    cp .env.example .env
    echo "  Edit .env to add your Soulseek credentials (optional)"
else
    echo ".env file already exists"
fi
echo

# Create required directories
echo "Creating required directories..."
mkdir -p downloads incomplete music
echo "  Created: downloads/ incomplete/ music/"
echo

# Build the analyzer image
echo "Building the analyzer Docker image..."
echo "  (This may take a few minutes on first run)"
docker compose build analyzer
echo

# Build the UI image
echo "Building the UI Docker image..."
docker compose build ui
echo

echo "=== Setup Complete! ==="
echo
echo "To start the services:"
echo "  docker compose up -d"
echo
echo "Then access:"
echo "  Web UI:    http://localhost:3000"
echo "  Soulseek:  http://localhost:5030"
echo
echo "To view logs:"
echo "  docker compose logs -f"
echo
