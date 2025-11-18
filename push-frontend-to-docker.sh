#!/bin/bash

# BifrostLink Frontend - Docker Hub Push Script
# This script builds and pushes the frontend image to Docker Hub

set -e

echo "🔐 Logging into Docker Hub..."
echo "${DOCKER_TOKEN}" | docker login -u praveenpotnurii --password-stdin

echo ""
echo "🏗️  Building bifrostlink-frontend image..."
docker build -f frontend/Dockerfile -t bifrostlink-frontend:latest ./frontend

echo ""
echo "🏷️  Tagging image for Docker Hub..."
docker tag bifrostlink-frontend:latest praveenpotnurii/bifrostlink-frontend:latest

echo ""
echo "⬆️  Pushing to Docker Hub..."
docker push praveenpotnurii/bifrostlink-frontend:latest

echo ""
echo "✅ Successfully pushed praveenpotnurii/bifrostlink-frontend:latest"
echo ""
echo "📋 Frontend can now be started with:"
echo "docker run -d \\"
echo "  --name bifrost-frontend \\"
echo "  -p 3000:80 \\"
echo "  -e VITE_API_BASE_URL=http://localhost:8080 \\"
echo "  praveenpotnurii/bifrostlink-frontend:latest"
echo ""
