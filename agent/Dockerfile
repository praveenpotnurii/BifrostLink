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

# Build the agent binary
WORKDIR /build/agent
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o bifrost-agent .

# Runtime stage
FROM alpine:latest

# Install ca-certificates and any required runtime tools including mysql-client for POC demo
RUN apk --no-cache add ca-certificates bash mysql-client

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /build/agent/bifrost-agent .

# Agent requires BIFROST_KEY environment variable
# This will be provided at runtime via docker-compose or docker run

# Run the agent
CMD ["./bifrost-agent"]
