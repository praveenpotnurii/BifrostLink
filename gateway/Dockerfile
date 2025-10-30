# Build stage
FROM golang:1.23.8-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git ca-certificates

WORKDIR /build

# Copy go.mod files
COPY gateway/go.mod gateway/go.sum ./gateway/
COPY common/go.mod common/go.sum ./common/

# Download dependencies
WORKDIR /build/gateway
RUN go mod download

# Copy source code
WORKDIR /build
COPY gateway/ ./gateway/
COPY common/ ./common/

# Build the gateway binary
WORKDIR /build/gateway
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o gateway-server .

# Runtime stage
FROM alpine:latest

# Install ca-certificates and netcat for healthcheck
RUN apk --no-cache add ca-certificates netcat-openbsd

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /build/gateway/gateway-server .

# Expose the gateway port
EXPOSE 8010

# Run the gateway server
CMD ["./gateway-server"]
