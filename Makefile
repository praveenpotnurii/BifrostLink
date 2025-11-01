.PHONY: help build build-nocache up down restart logs logs-gateway logs-mysql logs-api logs-frontend status clean clean-all ps exec-gateway exec-mysql test-db demo rebuild

# Default target
.DEFAULT_GOAL := help

# Colors for output
CYAN := \033[0;36m
GREEN := \033[0;32m
YELLOW := \033[0;33m
RED := \033[0;31m
NC := \033[0m # No Color

##@ General

help: ## Display this help message
	@echo "$(CYAN)Bifrost POC - Makefile Commands$(NC)"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "Usage:\n  make $(CYAN)<target>$(NC)\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  $(CYAN)%-20s$(NC) %s\n", $$1, $$2 } /^##@/ { printf "\n$(YELLOW)%s$(NC)\n", substr($$0, 5) } ' $(MAKEFILE_LIST)

##@ Docker Build

build: ## Build all Docker containers (with cache)
	@echo "$(GREEN)Building all Docker containers...$(NC)"
	docker-compose build
	@echo "$(GREEN)✓ Build complete$(NC)"

build-nocache: ## Build all Docker containers without cache
	@echo "$(GREEN)Building all Docker containers (no cache)...$(NC)"
	docker-compose build --no-cache
	@echo "$(GREEN)✓ Build complete$(NC)"

build-gateway: ## Build only gateway container (no cache)
	@echo "$(GREEN)Building gateway container...$(NC)"
	docker-compose build --no-cache gateway
	@echo "$(GREEN)✓ Gateway build complete$(NC)"

build-api: ## Build only API server container (no cache)
	@echo "$(GREEN)Building API server container...$(NC)"
	docker-compose build --no-cache api-server
	@echo "$(GREEN)✓ API server build complete$(NC)"

build-frontend: ## Build only frontend container (no cache)
	@echo "$(GREEN)Building frontend container...$(NC)"
	docker-compose build --no-cache frontend
	@echo "$(GREEN)✓ Frontend build complete$(NC)"

rebuild: down build-nocache up ## Complete rebuild: stop, build without cache, start

##@ Docker Lifecycle

up: ## Start all containers
	@echo "$(GREEN)Starting all containers...$(NC)"
	docker-compose up -d
	@echo "$(GREEN)✓ All containers started$(NC)"
	@make status

down: ## Stop and remove all containers
	@echo "$(YELLOW)Stopping all containers...$(NC)"
	docker-compose down
	@echo "$(GREEN)✓ All containers stopped$(NC)"

restart: ## Restart all containers
	@echo "$(YELLOW)Restarting all containers...$(NC)"
	@make down
	@make up

stop: ## Stop all containers (without removing)
	@echo "$(YELLOW)Stopping all containers...$(NC)"
	docker-compose stop
	@echo "$(GREEN)✓ All containers stopped$(NC)"

start: ## Start stopped containers
	@echo "$(GREEN)Starting containers...$(NC)"
	docker-compose start
	@echo "$(GREEN)✓ Containers started$(NC)"

##@ Monitoring

status: ## Show status of all containers
	@echo "$(CYAN)Container Status:$(NC)"
	@docker-compose ps

ps: status ## Alias for status

logs: ## Tail logs from all containers
	docker-compose logs -f

logs-gateway: ## Tail logs from gateway
	docker logs -f bifrost-gateway

logs-mysql: ## Tail logs from MySQL
	docker logs -f bifrost-mysql

logs-api: ## Tail logs from API server
	docker logs -f bifrost-api-server

logs-frontend: ## Tail logs from frontend
	docker logs -f bifrost-frontend

##@ Debugging

exec-gateway: ## Open shell in gateway container
	docker exec -it bifrost-gateway sh

exec-mysql: ## Open shell in MySQL container
	docker exec -it bifrost-mysql bash

exec-api: ## Open shell in API server container
	docker exec -it bifrost-api-server sh

exec-frontend: ## Open shell in frontend container
	docker exec -it bifrost-frontend sh

mysql-cli: ## Open MySQL CLI
	docker exec -it bifrost-mysql mysql -uroot -prootpassword testdb

##@ Testing

test-db: ## Test database connection and show sample data
	@echo "$(CYAN)Testing database connection...$(NC)"
	@docker exec bifrost-mysql mysql -uroot -prootpassword testdb -e "SELECT COUNT(*) as user_count FROM users;" 2>/dev/null || echo "$(RED)✗ Database not ready$(NC)"
	@docker exec bifrost-mysql mysql -uroot -prootpassword testdb -e "SELECT * FROM users LIMIT 3;" 2>/dev/null || echo "$(RED)✗ Database not ready$(NC)"

demo: ## Run demo script to verify setup
	@echo "$(CYAN)Running demo verification...$(NC)"
	./demo-query.sh

verify: ## Verify all services are healthy
	@echo "$(CYAN)Verifying services...$(NC)"
	@echo -n "Gateway:  "
	@docker inspect bifrost-gateway --format='{{.State.Health.Status}}' 2>/dev/null | grep -q "healthy" && echo "$(GREEN)✓ Healthy$(NC)" || echo "$(RED)✗ Not healthy$(NC)"
	@echo -n "MySQL:    "
	@docker inspect bifrost-mysql --format='{{.State.Health.Status}}' 2>/dev/null | grep -q "healthy" && echo "$(GREEN)✓ Healthy$(NC)" || echo "$(RED)✗ Not healthy$(NC)"
	@echo -n "Postgres: "
	@docker inspect bifrost-postgres --format='{{.State.Health.Status}}' 2>/dev/null | grep -q "healthy" && echo "$(GREEN)✓ Healthy$(NC)" || echo "$(RED)✗ Not healthy$(NC)"
	@echo -n "API:      "
	@docker inspect bifrost-api-server --format='{{.State.Health.Status}}' 2>/dev/null | grep -q "healthy" && echo "$(GREEN)✓ Healthy$(NC)" || echo "$(RED)✗ Not healthy$(NC)"
	@echo -n "Frontend: "
	@docker ps --filter "name=bifrost-frontend" --format "{{.Status}}" | grep -q "Up" && echo "$(GREEN)✓ Running$(NC)" || echo "$(RED)✗ Not running$(NC)"

check-connection: ## Check agent connections to gateway
	@echo "$(CYAN)Checking agent connections...$(NC)"
	@docker logs bifrost-gateway 2>&1 | grep "Agent connected" | tail -5 || echo "$(YELLOW)No agent connections found$(NC)"

##@ Cleanup

clean: ## Stop containers and remove volumes
	@echo "$(YELLOW)Cleaning up containers and volumes...$(NC)"
	docker-compose down -v
	@echo "$(GREEN)✓ Cleanup complete$(NC)"

clean-all: ## Remove containers, volumes, and images
	@echo "$(RED)WARNING: This will remove all containers, volumes, and images$(NC)"
	@read -p "Are you sure? [y/N] " -n 1 -r; \
	echo; \
	if [[ $$REPLY =~ ^[Yy]$$ ]]; then \
		docker-compose down -v; \
		docker rmi poc-gateway poc-agent poc-api-server poc-frontend 2>/dev/null || true; \
		echo "$(GREEN)✓ Complete cleanup done$(NC)"; \
	else \
		echo "$(YELLOW)Cleanup cancelled$(NC)"; \
	fi

prune: ## Remove all unused Docker resources
	@echo "$(YELLOW)Pruning Docker system...$(NC)"
	docker system prune -f
	@echo "$(GREEN)✓ Prune complete$(NC)"

##@ Development

dev-gateway: ## Build and restart gateway only
	@echo "$(GREEN)Rebuilding gateway...$(NC)"
	@make build-gateway
	docker-compose up -d gateway
	@make logs-gateway

dev-api: ## Build and restart API server only
	@echo "$(GREEN)Rebuilding API server...$(NC)"
	@make build-api
	docker-compose up -d api-server
	@make logs-api

dev-frontend: ## Build and restart frontend only
	@echo "$(GREEN)Rebuilding frontend...$(NC)"
	@make build-frontend
	docker-compose up -d frontend
	@make logs-frontend

##@ Go Commands

go-build: ## Build Go binaries locally
	@echo "$(GREEN)Building gateway-server...$(NC)"
	cd gateway && go build -o gateway-server .
	@echo "$(GREEN)Building api-server...$(NC)"
	cd api-server && go build -o api-server .
	@echo "$(GREEN)✓ All binaries built$(NC)"

go-tidy: ## Run go mod tidy on all modules
	@echo "$(GREEN)Running go mod tidy...$(NC)"
	cd agent && go mod tidy
	cd common && go mod tidy
	cd agent/libbifrost && go mod tidy
	cd gateway && go mod tidy
	cd api-server && go mod tidy
	@echo "$(GREEN)✓ All modules tidied$(NC)"

go-clean: ## Remove Go build artifacts
	@echo "$(YELLOW)Cleaning Go artifacts...$(NC)"
	rm -f gateway/gateway-server
	rm -f api-server/api-server
	@echo "$(GREEN)✓ Go artifacts cleaned$(NC)"

##@ Information

info: ## Show system information
	@echo "$(CYAN)Bifrost POC System Information$(NC)"
	@echo ""
	@echo "$(YELLOW)Docker Version:$(NC)"
	@docker --version
	@echo ""
	@echo "$(YELLOW)Docker Compose Version:$(NC)"
	@docker-compose --version
	@echo ""
	@echo "$(YELLOW)Go Version:$(NC)"
	@go version 2>/dev/null || echo "Go not installed"
	@echo ""
	@echo "$(YELLOW)Container Images:$(NC)"
	@docker images | grep -E "(poc-|bifrost-)" || echo "No images found"
	@echo ""
	@echo "$(YELLOW)Running Containers:$(NC)"
	@docker ps --filter "name=bifrost-" --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

ports: ## Show exposed ports
	@echo "$(CYAN)Exposed Ports:$(NC)"
	@echo "  Gateway:  8010 (gRPC), 8011 (HTTP)"
	@echo "  API:      8080 (HTTP)"
	@echo "  Frontend: 3000 (HTTP)"
	@echo "  MySQL:    3306 (MySQL)"
	@echo "  Postgres: 5432 (PostgreSQL)"

urls: ## Show service URLs
	@echo "$(CYAN)Service URLs:$(NC)"
	@echo "  Frontend:       $(GREEN)http://localhost:3000$(NC)"
	@echo "  API Server:     $(GREEN)http://localhost:8080$(NC)"
	@echo "  Gateway (gRPC): $(GREEN)localhost:8010$(NC)"
	@echo "  Gateway (HTTP): $(GREEN)http://localhost:8011$(NC)"
	@echo "  MySQL:          $(GREEN)localhost:3306$(NC)"
	@echo "  Postgres:       $(GREEN)localhost:5432$(NC)"
	@echo ""
	@echo "$(CYAN)API Endpoints:$(NC)"
	@echo "  Health:         $(GREEN)http://localhost:8080/health$(NC)"
	@echo "  Query:          $(GREEN)http://localhost:8080/api/execute-query$(NC) (POST)"
	@echo "  Users:          $(GREEN)http://localhost:8080/api/users$(NC) (GET/POST)"
	@echo "  Agents:         $(GREEN)http://localhost:8080/api/agents$(NC) (GET/POST)"
	@echo "  Gateway Agents: $(GREEN)http://localhost:8011/agents$(NC) (GET)"

##@ Quick Start

install: build up verify ## Complete setup: build, start, and verify
	@echo ""
	@echo "$(GREEN)✓ Installation complete!$(NC)"
	@echo ""
	@make urls

quick-start: ## Quick start guide
	@echo "$(CYAN)Bifrost POC Quick Start Guide$(NC)"
	@echo ""
	@echo "$(YELLOW)1. Build and start:$(NC)"
	@echo "   make install"
	@echo ""
	@echo "$(YELLOW)2. Verify setup:$(NC)"
	@echo "   make verify"
	@echo ""
	@echo "$(YELLOW)3. Run demo:$(NC)"
	@echo "   make demo"
	@echo ""
	@echo "$(YELLOW)4. View logs:$(NC)"
	@echo "   make logs-gateway"
	@echo "   make logs-api"
	@echo ""
	@echo "$(YELLOW)5. Access services:$(NC)"
	@echo "   Frontend: http://localhost:3000"
	@echo "   API:      http://localhost:8080"
	@echo ""
	@echo "$(YELLOW)6. Stop:$(NC)"
	@echo "   make down"
	@echo ""
	@echo "For more commands: make help"
