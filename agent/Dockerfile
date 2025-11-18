# Build stage
FROM golang:1.23.8-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git ca-certificates

WORKDIR /build

# Copy go.mod files with proper structure
COPY agent/go.mod agent/go.sum ./agent/
COPY common/go.mod common/go.sum ./common/
COPY agent/libbifrost/go.mod agent/libbifrost/go.sum ./agent/libbifrost/

# Download dependencies
WORKDIR /build/agent
RUN go mod download

# Copy source code
WORKDIR /build
COPY agent/ ./agent/
COPY common/ ./common/

# Build the agent binary for target architecture
WORKDIR /build/agent
ARG TARGETARCH
RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH:-amd64} go build -ldflags="-w -s" -o bifrost-agent .

# Runtime stage - Using Debian slim for minimal footprint
FROM debian:bookworm-slim

ARG TARGETARCH
# Install only essential runtime dependencies
# No CLI tools needed - using native wire protocols for MySQL, PostgreSQL, and MongoDB
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    bash \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /build/agent/bifrost-agent .

# Agent requires BIFROST_KEY environment variable
# This will be provided at runtime via docker-compose or docker run

# Run the agent
CMD ["./bifrost-agent"]
