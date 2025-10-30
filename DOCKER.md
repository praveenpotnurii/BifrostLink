# Docker Setup for Bifrost Gateway & Agent

This guide explains how to run the Bifrost gateway server and agent using Docker.

## Prerequisites

- Docker installed (version 20.10+)
- Docker Compose installed (version 2.0+)

## Quick Start

### Using Docker Compose (Recommended)

Run both gateway and agent together:

```bash
cd /Users/praveenpotnuri/Desktop/poc
docker-compose up --build
```

To run in detached mode:
```bash
docker-compose up -d --build
```

View logs:
```bash
docker-compose logs -f
```

Stop services:
```bash
docker-compose down
```

### Using Docker Directly

#### Build Images

**Gateway:**
```bash
docker build -t bifrost-gateway -f gateway/Dockerfile .
```

**Agent:**
```bash
docker build -t bifrost-agent -f Dockerfile .
```

#### Run Containers

**1. Start Gateway:**
```bash
docker run -d \
  --name bifrost-gateway \
  -p 8010:8010 \
  bifrost-gateway
```

**2. Start Agent:**
```bash
docker run -d \
  --name bifrost-agent \
  --link bifrost-gateway:gateway \
  -e BIFROST_KEY="grpc://agent1:test-token-123@bifrost-gateway:8010" \
  bifrost-agent
```

#### View Logs

```bash
# Gateway logs
docker logs -f bifrost-gateway

# Agent logs
docker logs -f bifrost-agent
```

#### Stop Containers

```bash
docker stop bifrost-agent bifrost-gateway
docker rm bifrost-agent bifrost-gateway
```

## Architecture

```
┌─────────────────────┐         ┌─────────────────────┐
│   bifrost-agent        │         │   bifrost-gateway      │
│   (Container)       │◄───────►│   (Container)       │
│                     │  gRPC   │                     │
│   Port: -           │  :8010  │   Port: 8010        │
└─────────────────────┘         └─────────────────────┘
          │                              │
          └──────── bifrost-network ────────┘
                  (Docker Bridge)
```

## Configuration

### Environment Variables

**Agent Container:**
- `BIFROST_KEY`: Connection DSN (format: `grpc://name:token@host:port`)

**Gateway Container:**
- No environment variables required (uses defaults)
- Listens on port `8010`
- Accepts token: `test-token-123`

### Networking

Docker Compose creates a bridge network `bifrost-network`:
- Gateway is accessible at `gateway:8010` from within the network
- Gateway port `8010` is exposed to host at `localhost:8010`

## Dockerfile Details

### Gateway Dockerfile

- **Base Image**: `golang:1.23.8-alpine` (builder), `alpine:latest` (runtime)
- **Build Type**: Multi-stage build for smaller image size
- **Binary Size**: ~14MB (optimized with `-ldflags="-w -s"`)
- **Dependencies**: Common module (shared with agent)

### Agent Dockerfile

- **Base Image**: `golang:1.23.8-alpine` (builder), `alpine:latest` (runtime)
- **Build Type**: Multi-stage build
- **Binary Size**: ~28MB (optimized)
- **Dependencies**: Common module, libhoop module, secretsmanager, etc.

## Healthcheck

The gateway includes a healthcheck that:
- Checks port `8010` availability
- Runs every 10 seconds
- Timeout after 5 seconds
- Requires 3 consecutive failures before unhealthy

The agent waits for the gateway to be healthy before starting.

## Troubleshooting

### Agent can't connect to gateway

**Check network connectivity:**
```bash
docker-compose exec agent ping gateway
```

**Check gateway is running:**
```bash
docker-compose ps
```

**View detailed logs:**
```bash
docker-compose logs gateway agent
```

### Build failures

**Clean build cache:**
```bash
docker-compose build --no-cache
```

**Check Go module issues:**
```bash
# Ensure go.mod files are present
ls -la go.mod common/go.mod libhoop/go.mod gateway/go.mod
```

### Port conflicts

If port 8010 is already in use:

**Find process:**
```bash
lsof -i :8010
```

**Change port in docker-compose.yml:**
```yaml
ports:
  - "8011:8010"  # Map host 8011 to container 8010
```

## Production Considerations

For production deployments:

1. **Enable TLS**: Modify gateway to use `grpcs://` instead of `grpc://`
2. **Use secrets management**: Store tokens in Docker secrets or environment files
3. **Add resource limits**:
   ```yaml
   deploy:
     resources:
       limits:
         cpus: '0.5'
         memory: 512M
   ```
4. **Use specific image tags**: Don't rely on `latest`
5. **Implement proper logging**: Use log drivers for centralized logging
6. **Add monitoring**: Integrate with Prometheus/Grafana

## Example Output

**Successful connection:**

```
gateway_1  | 2025/10/29 14:38:25 Starting Bifrost Gateway Server...
gateway_1  | 2025/10/29 14:38:25 Gateway listening on :8010 (insecure mode)
gateway_1  | 2025/10/29 14:38:25 Auth: Token validated successfully
gateway_1  | 2025/10/29 14:38:25 Agent connected: id=agent-default
gateway_1  | 2025/10/29 14:38:25 Sent GatewayConnectOK to agent

agent_1    | {"level":"info","msg":"connecting to gateway:8010, tls=false"}
agent_1    | {"level":"info","msg":"connected with success to gateway:8010"}
```

## Cleanup

Remove all containers, images, and volumes:

```bash
docker-compose down -v
docker rmi bifrost-gateway bifrost-agent
```

## Additional Commands

**Rebuild specific service:**
```bash
docker-compose up -d --build gateway
```

**Scale agent instances:**
```bash
docker-compose up -d --scale agent=3
```

**Shell into container:**
```bash
docker-compose exec gateway sh
docker-compose exec agent sh
```
