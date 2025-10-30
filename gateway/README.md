# Bifrost Gateway Server

A simple gateway server implementation that demonstrates connectivity with the Bifrost agent.

## Architecture

This gateway implements the gRPC Transport service defined in `transport.proto`:

- **PreConnect RPC**: Validates agent credentials before establishing connection
- **Connect RPC**: Bidirectional streaming for packet exchange
- **HealthCheck RPC**: Health status endpoint

## How It Works

### Connection Flow

```
1. Agent → PreConnect(req) → Gateway
   Gateway validates token and returns status="connect"

2. Agent → Connect(stream) → Gateway
   Bidirectional stream established

3. Gateway → GatewayConnectOK packet → Agent
   Confirms successful connection

4. Agent → GatewayKeepAlive packets → Gateway
   Maintains connection with periodic keepalives
```

### Authentication

The gateway extracts the Bearer token from gRPC metadata. The agent sends the full DSN as the token:

- **Format**: `grpc://agent-name:secret-key@host:port`
- **Extraction**: Gateway parses the DSN and validates the secret-key portion

## Running the Gateway

### Build

```bash
cd /Users/praveenpotnuri/Desktop/poc/gateway
go build -o gateway-server
```

### Start

```bash
./gateway-server
```

The gateway listens on `:8010` in insecure mode (no TLS).

### Connect an Agent

```bash
cd /Users/praveenpotnuri/Desktop/poc
BIFROST_KEY="grpc://agent1:test-token-123@localhost:8010" ./bifrost-agent
```

## Logs

Successful connection logs:

**Gateway**:
```
2025/10/29 14:38:15 Starting Bifrost Gateway Server...
2025/10/29 14:38:15 Gateway listening on :8010 (insecure mode)
2025/10/29 14:38:25 Auth: Token validated successfully
2025/10/29 14:38:25 Agent connected: id=agent-default, origin=agent
2025/10/29 14:38:25 Sent GatewayConnectOK to agent: id=agent-default
2025/10/29 14:38:25 Received packet from agent: type=GatewayKeepAlive
```

**Agent**:
```json
{"level":"info","msg":"version=unknown, platform=darwin/arm64, type=dsn, mode=, grpc_server=localhost:8010, tls=false"}
{"level":"info","msg":"connecting to localhost:8010, tls=false","backoff":"1s"}
{"level":"info","msg":"connected with success to localhost:8010"}
```

## Packet Types

The gateway currently logs incoming packets from the agent. Supported types include:

- `GatewayKeepAlive` - Connection keepalive
- `SessionOpen` - New session request
- `SessionClose` - Close session
- `PGConnectionWrite` - PostgreSQL data
- `MySQLConnectionWrite` - MySQL data
- `MSSQLConnectionWrite` - MSSQL data
- `MongoDBConnectionWrite` - MongoDB data
- `SSHConnectionWrite` - SSH data
- `TerminalWriteStdin` - Terminal input
- And more...

## Extending the Gateway

To add functionality:

1. **Handle specific packet types** in `handleAgentPacket()`
2. **Add routing logic** to forward packets to clients/services
3. **Implement session management** to track active connections
4. **Add TLS support** for production use
5. **Implement PreConnect validation** for agent registration

## Configuration

- **Listen Address**: `:8010` (hardcoded in `ListenAddr`)
- **Valid Token**: `test-token-123` (hardcoded in `ValidToken`)
- **Max Message Size**: 17 MiB (matches agent configuration)

## Notes

- This is a **minimal implementation** for demonstration purposes
- Uses **insecure mode** (no TLS) - not suitable for production
- Accepts any token containing "test-token" or 64-char hashes
- Does not implement full session/connection management
- Does not forward packets to actual backend services
