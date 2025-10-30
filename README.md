# Bifrost Agent POC - Complete System

A proof-of-concept implementation of Bifrost Agent system with Gateway, Agent, MySQL database, REST API, and React frontend.

## 🏗️ Architecture

```
┌─────────────────┐
│  React Frontend │  (Port 3000)
│   (Nginx)       │
└────────┬────────┘
         │
         ↓ HTTP
┌─────────────────┐
│   REST API      │  (Port 8080)
│   (Go)          │
└────────┬────────┘
         │
         ↓ gRPC
┌─────────────────┐
│    Gateway      │  (Port 8010)
│    (Go)         │
└────────┬────────┘
         │
         ↓ gRPC
┌─────────────────┐
│  Bifrost Agent     │
│  (Go)           │
└────────┬────────┘
         │
         ↓ MySQL Protocol
┌─────────────────┐
│   MySQL 8.0     │  (Port 3306)
│   (Docker)      │
└─────────────────┘
```

## 📋 Makefile Commands

This project includes a comprehensive Makefile for easy management.

### Quick Start with Makefile

```bash
# Complete setup (build, start, verify) - RECOMMENDED
make install

# Show all available commands
make help

# View service URLs
make urls
```

### Most Common Commands

| Command | Description |
|---------|-------------|
| `make build-nocache` | Build all containers without cache |
| `make up` | Start all containers |
| `make down` | Stop and remove containers |
| `make restart` | Restart all containers |
| `make logs-gateway` | View gateway logs |
| `make logs-agent` | View agent logs |
| `make status` | Show container status |
| `make verify` | Verify all services are healthy |
| `make demo` | Run verification demo |
| `make clean` | Stop containers and remove volumes |

### Development Commands

| Command | Description |
|---------|-------------|
| `make dev-gateway` | Rebuild and restart gateway only |
| `make dev-agent` | Rebuild and restart agent only |
| `make dev-api` | Rebuild and restart API server only |
| `make go-tidy` | Run go mod tidy on all modules |
| `make go-build` | Build Go binaries locally |

### Debugging Commands

| Command | Description |
|---------|-------------|
| `make exec-gateway` | Open shell in gateway container |
| `make exec-agent` | Open shell in agent container |
| `make mysql-cli` | Open MySQL CLI |
| `make check-connection` | Check agent-gateway connection |

Run `make help` to see all 50+ available commands!

## 🚀 Quick Start

### Prerequisites
- Docker and Docker Compose installed
- Ports 3000, 8080, 8010, and 3306 available
- (Optional) Make utility for simplified commands

### Option 1: Using Makefile (Recommended)

```bash
# Complete setup - builds, starts, and verifies everything
make install

# Check service URLs
make urls
```

### Option 2: Using Docker Compose Directly

```bash
# Build and start all containers
docker-compose build --no-cache
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f
```

### Access the Application

- **Web UI**: http://localhost:3000
- **REST API**: http://localhost:8080
- **Gateway**: localhost:8010 (gRPC)
- **MySQL**: localhost:3306

## 📦 Components

### 1. Gateway Server
- **Port**: 8010
- **Technology**: Go + gRPC
- **Purpose**: Broker between clients and agents
- **Features**:
  - Session management
  - Packet routing
  - Authentication (Bearer token)
  - Agent connection registry

### 2. Bifrost Agent
- **Technology**: Go
- **Purpose**: Execute MySQL queries on behalf of clients
- **Features**:
  - MySQL protocol handling
  - Connection parameter management
  - Query execution via mysql CLI
  - Result streaming

### 3. REST API Server
- **Port**: 8080
- **Technology**: Go + HTTP
- **Purpose**: REST wrapper around gRPC gateway
- **Endpoints**:
  - `POST /api/execute-query` - Execute SQL query
  - `GET /api/agent-status` - Check agent connection status
  - `GET /health` - Health check

### 4. React Frontend
- **Port**: 3000
- **Technology**: React 18 + Vite
- **Features**:
  - SQL query editor
  - Real-time agent status indicator
  - Results table display
  - Error handling
  - Keyboard shortcuts (Ctrl/Cmd + Enter)

### 5. MySQL Database
- **Port**: 3306
- **Version**: MySQL 8.0
- **Database**: testdb
- **Credentials**:
  - Root: `root` / `rootpassword`
  - User: `bifrostuser` / `bifrostpass`

## 🗄️ Sample Data

The database contains two tables:

### Users Table
```sql
SELECT * FROM users;
```
Returns 5 sample users with id, name, email, age, and created_at.

### Products Table
```sql
SELECT * FROM products;
```
Returns 5 sample products with id, name, price, stock, and category.

## 🔧 Development

### Project Structure
```
poc/
├── gateway/              # Gateway server
│   ├── main.go
│   ├── Dockerfile
│   └── go.mod
├── api-server/           # REST API wrapper
│   ├── main.go
│   ├── helpers.go
│   ├── Dockerfile
│   └── go.mod
├── frontend/             # React application
│   ├── src/
│   │   ├── App.jsx
│   │   └── App.css
│   ├── Dockerfile
│   ├── nginx.conf
│   └── package.json
├── controller/           # Agent controllers
├── common/               # Shared protocol buffers
├── libbifrost/          # Stub library for protocols
├── mysql-init/          # Database initialization scripts
├── docker-compose.yml
└── Dockerfile           # Agent Dockerfile
```

### Running Locally (Development Mode)

**API Server:**
```bash
cd api-server
go run .
```

**Frontend:**
```bash
cd frontend
npm install
npm run dev
```

**Note**: Gateway, Agent, and MySQL should still run in Docker for local development.

### Environment Variables

**API Server:**
- `GATEWAY_ADDR` - Gateway address (default: localhost:8010)

**Frontend:**
- `VITE_API_BASE_URL` - API server URL (default: http://localhost:8080)

## 📝 API Examples

### Execute Query
```bash
curl -X POST http://localhost:8080/api/execute-query \
  -H "Content-Type: application/json" \
  -d '{"query":"SELECT * FROM users;"}'
```

### Check Agent Status
```bash
curl http://localhost:8080/api/agent-status
```

## 🧪 Testing Queries

Try these sample queries in the web UI:

```sql
-- Get all users
SELECT * FROM users;

-- Count total users
SELECT COUNT(*) as total FROM users;

-- Users older than 30
SELECT name, email FROM users WHERE age > 30;

-- All products
SELECT * FROM products;

-- Expensive products
SELECT * FROM products WHERE price > 100;

-- Products by category
SELECT name, price FROM products WHERE category='Electronics';
```

## 🛑 Stopping Services

```bash
# Stop all containers
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

## 🐛 Troubleshooting

### Services not starting
```bash
# Check logs
docker-compose logs gateway
docker-compose logs agent
docker-compose logs api-server

# Restart specific service
docker-compose restart agent
```

### Port conflicts
```bash
# Check what's using the ports
lsof -i :3000
lsof -i :8080
lsof -i :8010
lsof -i :3306
```

### Agent not connecting
1. Ensure gateway is healthy: `docker-compose ps`
2. Check agent logs: `docker logs bifrost-agent`
3. Verify MySQL is ready: `docker logs bifrost-mysql`

### Frontend not connecting to API
1. Check CORS settings in `api-server/main.go`
2. Verify API server is running: `curl http://localhost:8080/health`
3. Check browser console for errors

## 📊 Monitoring

### View Real-time Logs
```bash
# All services
docker-compose logs -f

# Specific service
docker-compose logs -f agent
docker-compose logs -f api-server
docker-compose logs -f frontend
```

### Container Stats
```bash
docker stats
```

## 🔐 Security Notes

⚠️ **This is a POC/Development Setup**

- Uses hardcoded authentication token (`test-token-123`)
- MySQL root password is in plain text
- No TLS/SSL encryption
- CORS allows all origins in development
- Not production-ready

## 🚀 Production Considerations

For production deployment, consider:

1. **Security**:
   - Use environment variables for secrets
   - Implement proper authentication/authorization
   - Enable TLS for all connections
   - Restrict CORS origins
   - Use secrets management (Vault, AWS Secrets Manager)

2. **Scalability**:
   - Multiple agent instances
   - Load balancing for API server
   - Database replication
   - Connection pooling

3. **Monitoring**:
   - Prometheus metrics
   - Grafana dashboards
   - Log aggregation (ELK stack)
   - Distributed tracing

4. **High Availability**:
   - Gateway clustering
   - Database failover
   - Health checks and auto-restart
   - Backup and disaster recovery

## 📄 License

This is a proof-of-concept project for demonstration purposes.

## 🤝 Contributing

This is a POC project demonstrating the Bifrost agent architecture.

---

**Built with**: Go, React, Docker, MySQL, gRPC, and a lot of ☕
