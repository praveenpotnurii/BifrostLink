#!/bin/bash

# BifrostLink Gateway - Docker Hub Push Script
# This script builds and pushes the gateway image to Docker Hub

set -e

echo "🔐 Logging into Docker Hub..."
echo "${DOCKER_TOKEN}" | docker login -u praveenpotnurii --password-stdin

echo ""
echo "🏗️  Building bifrostlink-gateway image..."
docker build -f gateway/Dockerfile -t bifrostlink-gateway:latest .

echo ""
echo "🏷️  Tagging image for Docker Hub..."
docker tag bifrostlink-gateway:latest praveenpotnurii/bifrostlink-gateway:latest

echo ""
echo "⬆️  Pushing to Docker Hub..."
docker push praveenpotnurii/bifrostlink-gateway:latest

echo ""
echo "✅ Successfully pushed praveenpotnurii/bifrostlink-gateway:latest"
echo ""
echo "📋 Gateway can now be started with:"
echo "docker run -d \\"
echo "  --name bifrost-gateway \\"
echo "  -p 8010:8010 \\"
echo "  -p 8011:8011 \\"
echo "  praveenpotnurii/bifrostlink-gateway:latest"
echo ""
