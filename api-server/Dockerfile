# Build stage
FROM golang:1.23.8-alpine AS builder

# Install build dependencies
RUN apk add --no-cache git ca-certificates

WORKDIR /build

# Copy go.mod files
COPY common/go.mod common/go.sum ./common/
COPY api-server/go.mod ./api-server/

# Download dependencies
WORKDIR /build/api-server
RUN go mod download

# Go back to root and copy source
WORKDIR /build
COPY api-server/ ./api-server/
COPY common/ ./common/

# Build the API server binary
WORKDIR /build/api-server
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-w -s" -o api-server .

# Runtime stage
FROM alpine:latest

# Install runtime dependencies including wget for healthcheck
RUN apk --no-cache add ca-certificates wget

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /build/api-server/api-server .

# Expose API port
EXPOSE 8080

# Run the API server
CMD ["./api-server"]
