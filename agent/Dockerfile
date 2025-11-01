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

# Runtime stage - Using Debian slim for glibc compatibility (required by mongosh)
FROM debian:bookworm-slim

ARG TARGETARCH
# Install required runtime tools including mysql-client and mongosh for POC demo
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    bash \
    curl \
    default-mysql-client \
    && rm -rf /var/lib/apt/lists/* && \
    # Download and install mongosh (MongoDB Shell) pre-built binary
    if [ "$TARGETARCH" = "arm64" ]; then \
        MONGOSH_ARCH="arm64"; \
    else \
        MONGOSH_ARCH="x64"; \
    fi && \
    curl -L https://downloads.mongodb.com/compass/mongosh-2.3.1-linux-${MONGOSH_ARCH}.tgz -o mongosh.tgz && \
    tar -xzf mongosh.tgz && \
    mv mongosh-2.3.1-linux-${MONGOSH_ARCH}/bin/mongosh /usr/local/bin/ && \
    mv mongosh-2.3.1-linux-${MONGOSH_ARCH}/bin/mongosh_crypt_v1.so /usr/lib/ 2>/dev/null || true && \
    rm -rf mongosh.tgz mongosh-2.3.1-linux-* && \
    chmod +x /usr/local/bin/mongosh

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /build/agent/bifrost-agent .

# Agent requires BIFROST_KEY environment variable
# This will be provided at runtime via docker-compose or docker run

# Run the agent
CMD ["./bifrost-agent"]
