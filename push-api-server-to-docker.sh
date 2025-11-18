#!/bin/bash

# BifrostLink API Server - Docker Hub Push Script
# This script builds and pushes the API server image to Docker Hub

set -e

echo "🔐 Logging into Docker Hub..."
echo "${DOCKER_TOKEN}" | docker login -u praveenpotnurii --password-stdin

echo ""
echo "🏗️  Building bifrostlink-api-server image..."
docker build -f api-server/Dockerfile -t bifrostlink-api-server:latest .

echo ""
echo "🏷️  Tagging image for Docker Hub..."
docker tag bifrostlink-api-server:latest praveenpotnurii/bifrostlink-api-server:latest

echo ""
echo "⬆️  Pushing to Docker Hub..."
docker push praveenpotnurii/bifrostlink-api-server:latest

echo ""
echo "✅ Successfully pushed praveenpotnurii/bifrostlink-api-server:latest"
echo ""
echo "📋 API Server can now be started with:"
echo "docker run -d \\"
echo "  --name bifrost-api-server \\"
echo "  -p 8080:8080 \\"
echo "  -e GATEWAY_ADDR=gateway:8010 \\"
echo "  -e GATEWAY_HTTP_ADDR=gateway:8011 \\"
echo "  -e POSTGRES_HOST=postgres \\"
echo "  -e POSTGRES_PORT=5432 \\"
echo "  -e POSTGRES_USER=bifrost_admin \\"
echo "  -e POSTGRES_PASSWORD=bifrost_secure_pass \\"
echo "  -e POSTGRES_DB=bifrost_app \\"
echo "  -e GOOGLE_CLIENT_ID=your-client-id \\"
echo "  -e GOOGLE_CLIENT_SECRET=your-client-secret \\"
echo "  -e JWT_SECRET=your-jwt-secret \\"
echo "  praveenpotnurii/bifrostlink-api-server:latest"
echo ""
