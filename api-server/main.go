package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/rs/cors"
	pb "github.com/bifrost/common/proto"
	pbagent "github.com/bifrost/common/proto/agent"
	pbclient "github.com/bifrost/common/proto/client"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/metadata"
)

func getEnv(key, defaultValue string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return defaultValue
}

var (
	gatewayAddr = getEnv("GATEWAY_ADDR", "localhost:8010")
)

type ExecuteQueryRequest struct {
	Query      string `json:"query"`
	DatabaseID int    `json:"database_id"`
}

type ExecuteQueryResponse struct {
	Results  string `json:"results"`
	ExitCode int    `json:"exitCode"`
	Error    string `json:"error,omitempty"`
	Duration string `json:"duration"`
}

// executeQuery sends a query to the gateway and returns results
func executeQuery(query string, databaseID int) (*ExecuteQueryResponse, error) {
	startTime := time.Now()

	// Fetch database credentials from the databases table
	var dbConfig Database
	err := db.QueryRow(`
		SELECT id, database_name, type, agent_id, host, port, username, password, db_name
		FROM databases
		WHERE id = $1
	`, databaseID).Scan(&dbConfig.ID, &dbConfig.DatabaseName, &dbConfig.Type, &dbConfig.AgentID, &dbConfig.Host,
		&dbConfig.Port, &dbConfig.Username, &dbConfig.Password, &dbConfig.DBName)

	if err != nil {
		return nil, fmt.Errorf("database not found or invalid database_id: %v", err)
	}

	// Connect to gateway
	conn, err := grpc.Dial(gatewayAddr, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return nil, fmt.Errorf("failed to connect to gateway: %v", err)
	}
	defer conn.Close()

	client := pb.NewTransportClient(conn)

	// Create client stream with origin and authentication metadata
	// Use the agent_id from the database configuration
	md := metadata.New(map[string]string{
		"origin":          "client",
		"connection-name": "web-client",
		"agent-id":        dbConfig.AgentID,
		"authorization":   "Bearer test-token-123",
	})
	ctx := metadata.NewOutgoingContext(context.Background(), md)

	stream, err := client.Connect(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to create stream: %v", err)
	}

	// Prepare connection parameters using database credentials
	connParams := &pb.AgentConnectionParams{
		ConnectionName: dbConfig.DatabaseName,
		ConnectionType: dbConfig.Type,  // Use dynamic database type (mysql, postgres, mssql, mongodb)
		UserID:         "web-user",
		UserEmail:      "web@example.com",
		ClientOrigin:   pb.ConnectionOriginClientAPI,
		ClientVerb:     pb.ClientVerbExec,
		EnvVars: map[string]any{
			"envvar:HOST": base64Encode(dbConfig.Host),
			"envvar:PORT": base64Encode(dbConfig.Port),
			"envvar:USER": base64Encode(dbConfig.Username),
			"envvar:PASS": base64Encode(dbConfig.Password),
			"envvar:DB":   base64Encode(dbConfig.DBName),
		},
	}

	encodedParams, err := encodeConnectionParams(connParams)
	if err != nil {
		return nil, fmt.Errorf("failed to encode params: %v", err)
	}

	sessionID := []byte(uuid.NewString())

	// Send SessionOpen
	err = stream.Send(&pb.Packet{
		Type:    pbagent.SessionOpen,
		Payload: []byte(query),
		Spec: map[string][]byte{
			pb.SpecAgentConnectionParamsKey: encodedParams,
		},
	})
	if err != nil {
		return nil, fmt.Errorf("failed to send SessionOpen: %v", err)
	}

	var results string
	exitCode := 0

	// Receive responses
	for {
		pkt, err := stream.Recv()
		if err == io.EOF {
			break
		}
		if err != nil {
			return nil, fmt.Errorf("stream error: %v", err)
		}

		switch pkt.Type {
		case pbclient.SessionOpenOK:
			sessionID = pkt.Spec[pb.SpecGatewaySessionID]

			// Send query via MySQLConnectionWrite
			err = stream.Send(&pb.Packet{
				Type:    pbagent.MySQLConnectionWrite,
				Payload: []byte(query),
				Spec: map[string][]byte{
					pb.SpecGatewaySessionID:   sessionID,
					pb.SpecClientConnectionID: []byte("web-conn-1"),
				},
			})
			if err != nil {
				return nil, fmt.Errorf("failed to send query: %v", err)
			}

		case pbclient.MySQLConnectionWrite:
			// Query results
			results = string(pkt.Payload)

		case pbclient.SessionClose:
			// Session closed, get exit code
			exitCodeStr := string(pkt.Spec[pb.SpecClientExitCodeKey])
			fmt.Sscanf(exitCodeStr, "%d", &exitCode)

			duration := time.Since(startTime)
			return &ExecuteQueryResponse{
				Results:  results,
				ExitCode: exitCode,
				Duration: duration.String(),
			}, nil
		}
	}

	duration := time.Since(startTime)
	return &ExecuteQueryResponse{
		Results:  results,
		ExitCode: exitCode,
		Duration: duration.String(),
	}, nil
}

// HTTP Handlers
func handleExecuteQuery(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req ExecuteQueryRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("Invalid request: %v", err), http.StatusBadRequest)
		return
	}

	if req.Query == "" {
		http.Error(w, "Query cannot be empty", http.StatusBadRequest)
		return
	}

	if req.DatabaseID == 0 {
		http.Error(w, "Database ID is required", http.StatusBadRequest)
		return
	}

	log.Printf("Executing query on database_id=%d: %s", req.DatabaseID, req.Query)

	resp, err := executeQuery(req.Query, req.DatabaseID)
	if err != nil {
		resp = &ExecuteQueryResponse{
			Error:    err.Error(),
			ExitCode: 1,
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

func handleHealth(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"status": "ok",
	})
}

func main() {
	// Initialize database connection
	if err := InitDB(); err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer CloseDB()

	mux := http.NewServeMux()

	// Query execution endpoints
	mux.HandleFunc("/api/execute-query", handleExecuteQuery)

	// User management endpoints
	mux.HandleFunc("/api/users", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handleGetUsers(w, r)
		case http.MethodPost:
			handleCreateUser(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/users/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handleGetUser(w, r)
		case http.MethodPut:
			handleUpdateUser(w, r)
		case http.MethodDelete:
			handleDeleteUser(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Agent management endpoints
	mux.HandleFunc("/api/agents", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handleGetAgents(w, r)
		case http.MethodPost:
			handleCreateAgent(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/agents/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handleGetAgent(w, r)
		case http.MethodPut:
			handleUpdateAgent(w, r)
		case http.MethodDelete:
			handleDeleteAgent(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Database management endpoints
	mux.HandleFunc("/api/databases", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handleGetDatabases(w, r)
		case http.MethodPost:
			handleCreateDatabase(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})
	mux.HandleFunc("/api/databases/", func(w http.ResponseWriter, r *http.Request) {
		switch r.Method {
		case http.MethodGet:
			handleGetDatabase(w, r)
		case http.MethodPut:
			handleUpdateDatabase(w, r)
		case http.MethodDelete:
			handleDeleteDatabase(w, r)
		default:
			http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		}
	})

	// Health check
	mux.HandleFunc("/health", handleHealth)

	// Enable CORS for React frontend
	handler := cors.New(cors.Options{
		AllowedOrigins:   []string{"http://localhost:5173", "http://localhost:3000"},
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Content-Type"},
		AllowCredentials: true,
	}).Handler(mux)

	log.Println("🚀 REST API Server starting on :8080")
	log.Println("   Query Execution:")
	log.Println("   - POST   /api/execute-query")
	log.Println("   User Management:")
	log.Println("   - GET    /api/users")
	log.Println("   - POST   /api/users")
	log.Println("   - GET    /api/users/:id")
	log.Println("   - PUT    /api/users/:id")
	log.Println("   - DELETE /api/users/:id")
	log.Println("   Agent Management:")
	log.Println("   - GET    /api/agents")
	log.Println("   - POST   /api/agents")
	log.Println("   - GET    /api/agents/:id")
	log.Println("   - PUT    /api/agents/:id")
	log.Println("   - DELETE /api/agents/:id")
	log.Println("   Database Management:")
	log.Println("   - GET    /api/databases")
	log.Println("   - POST   /api/databases")
	log.Println("   - GET    /api/databases/:id")
	log.Println("   - PUT    /api/databases/:id")
	log.Println("   - DELETE /api/databases/:id")
	log.Println("   Health:")
	log.Println("   - GET    /health")
	log.Fatal(http.ListenAndServe(":8080", handler))
}
