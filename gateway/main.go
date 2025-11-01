package main

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net"
	"net/http"
	"strings"
	"sync"

	pb "github.com/bifrost/common/proto"
	pbagent "github.com/bifrost/common/proto/agent"
	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/metadata"
	"google.golang.org/grpc/status"
)

const (
	ListenAddr     = ":8010"
	HTTPListenAddr = ":8011"
	ValidToken     = "test-token-123"
	MaxRecvSize    = 1024 * 1024 * 17 // 17 MiB
)

type gatewayServer struct {
	pb.UnimplementedTransportServer
	broker *Broker
}

// Broker manages routing between clients and agents
type Broker struct {
	agents   sync.Map // map[string]*AgentConnection
	sessions sync.Map // map[string]*Session
}

type AgentConnection struct {
	stream   pb.Transport_ConnectServer
	agentID  string
	origin   string
	metadata map[string]string
}

type Session struct {
	sessionID     string
	agent         *AgentConnection
	clientStream  pb.Transport_ConnectServer
	mu            sync.Mutex
	closed        bool
	ctx           context.Context
	cancel        context.CancelFunc
}

func main() {
	log.Println("Starting Complete Hoop Gateway Server...")

	// Start gRPC server
	listener, err := net.Listen("tcp", ListenAddr)
	if err != nil {
		log.Fatalf("Failed to listen on %s: %v", ListenAddr, err)
	}

	grpcServer := grpc.NewServer(
		grpc.MaxRecvMsgSize(MaxRecvSize),
		grpc.MaxSendMsgSize(MaxRecvSize),
	)

	gateway := &gatewayServer{
		broker: &Broker{},
	}
	pb.RegisterTransportServer(grpcServer, gateway)

	// Start HTTP server for agent status queries
	go startHTTPServer(gateway.broker)

	log.Printf("Gateway gRPC listening on %s", ListenAddr)
	log.Printf("Gateway HTTP listening on %s", HTTPListenAddr)
	log.Println("Ready to accept agent and client connections")

	if err := grpcServer.Serve(listener); err != nil {
		log.Fatalf("Failed to serve: %v", err)
	}
}

// startHTTPServer starts an HTTP server for querying gateway state
func startHTTPServer(broker *Broker) {
	mux := http.NewServeMux()

	// Endpoint to list active agents
	mux.HandleFunc("/agents", func(w http.ResponseWriter, r *http.Request) {
		agents := broker.GetActiveAgents()
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"agents": agents,
			"count":  len(agents),
		})
	})

	// Health check
	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	log.Printf("Starting HTTP server on %s", HTTPListenAddr)
	if err := http.ListenAndServe(HTTPListenAddr, mux); err != nil {
		log.Fatalf("HTTP server failed: %v", err)
	}
}

// PreConnect handles pre-connection validation
func (s *gatewayServer) PreConnect(ctx context.Context, req *pb.PreConnectRequest) (*pb.PreConnectResponse, error) {
	if err := s.validateAuth(ctx); err != nil {
		return &pb.PreConnectResponse{
			Status:  "backoff",
			Message: "unauthorized",
		}, nil
	}
	return &pb.PreConnectResponse{
		Status:  "connect",
		Message: "authorized",
	}, nil
}

// Connect handles bidirectional streaming for both agents and clients
func (s *gatewayServer) Connect(stream pb.Transport_ConnectServer) error {
	ctx := stream.Context()

	if err := s.validateAuth(ctx); err != nil {
		return status.Errorf(codes.Unauthenticated, "unauthorized")
	}

	md, _ := metadata.FromIncomingContext(ctx)
	origin := getMetadataValue(md, "origin")

	// Determine if this is an agent or client connection
	if origin == "agent" {
		return s.handleAgentConnection(stream, md)
	}
	return s.handleClientConnection(stream, md)
}

// handleAgentConnection manages agent connections
func (s *gatewayServer) handleAgentConnection(stream pb.Transport_ConnectServer, md metadata.MD) error {
	connectionName := getMetadataValue(md, "connection-name")

	agentID := "agent-default"
	if connectionName != "" {
		agentID = fmt.Sprintf("agent-%s", connectionName)
	}

	log.Printf("Agent connected: id=%s", agentID)

	agent := &AgentConnection{
		stream:  stream,
		agentID: agentID,
		origin:  "agent",
		metadata: map[string]string{
			"connection-name": connectionName,
		},
	}

	s.broker.agents.Store(agentID, agent)
	defer func() {
		s.broker.agents.Delete(agentID)
		log.Printf("Agent disconnected: id=%s", agentID)
	}()

	// Send GatewayConnectOK
	if err := stream.Send(&pb.Packet{
		Type:    pbagent.GatewayConnectOK,
		Payload: []byte("connected"),
	}); err != nil {
		return err
	}

	// Receive packets from agent
	for {
		pkt, err := stream.Recv()
		if err != nil {
			return err
		}

		// Route packet to appropriate client session
		sessionID := string(pkt.Spec[pb.SpecGatewaySessionID])
		if sessionID != "" {
			if sess := s.broker.GetSession(sessionID); sess != nil {
				if err := sess.SendToClient(pkt); err != nil {
					log.Printf("Failed to send to client: %v", err)
				}
			}
		}

		// Log keepalives
		if pkt.Type == "GatewayKeepAlive" {
			log.Printf("Keepalive from %s", agentID)
		}
	}
}

// handleClientConnection manages client connections and creates sessions
func (s *gatewayServer) handleClientConnection(stream pb.Transport_ConnectServer, md metadata.MD) error {
	log.Println("Client connected")

	// Find first available agent
	var agent *AgentConnection
	s.broker.agents.Range(func(key, value interface{}) bool {
		agent = value.(*AgentConnection)
		return false // Stop after first
	})

	if agent == nil {
		return status.Error(codes.Unavailable, "no agents available")
	}

	// Create session
	sessionID := uuid.NewString()
	ctx, cancel := context.WithCancel(stream.Context())

	session := &Session{
		sessionID:    sessionID,
		agent:        agent,
		clientStream: stream,
		ctx:          ctx,
		cancel:       cancel,
	}

	s.broker.sessions.Store(sessionID, session)
	defer func() {
		session.Close()
		s.broker.sessions.Delete(sessionID)
		log.Printf("Session closed: %s", sessionID[:8])
	}()

	log.Printf("Session created: %s with agent %s", sessionID[:8], agent.agentID)

	// Receive packets from client and forward to agent
	for {
		pkt, err := stream.Recv()
		if err != nil {
			return err
		}

		log.Printf("Client packet: type=%s", pkt.Type)

		switch pkt.Type {
		case pbagent.SessionOpen:
			// Add session ID to spec (preserve existing spec fields including SpecConnectionType)
			if pkt.Spec == nil {
				pkt.Spec = make(map[string][]byte)
			}
			pkt.Spec[pb.SpecGatewaySessionID] = []byte(sessionID)
			// Don't override SpecConnectionType - it's already set by the API server

			// Forward to agent
			if err := agent.stream.Send(pkt); err != nil {
				log.Printf("Failed to send SessionOpen to agent: %v", err)
				return err
			}
			log.Printf("Forwarded SessionOpen to agent for session %s", sessionID[:8])

		default:
			// Forward all other packet types to agent (MySQL, MongoDB, PostgreSQL, MSSQL, etc.)
			// Ensure session ID is set (preserve existing spec fields)
			if pkt.Spec == nil {
				pkt.Spec = make(map[string][]byte)
			}
			// Add session ID without overwriting other spec fields
			pkt.Spec[pb.SpecGatewaySessionID] = []byte(sessionID)

			// Debug: log spec fields
			connID := string(pkt.Spec[pb.SpecClientConnectionID])
			log.Printf("Forwarding %s - ConnectionID: '%s', SessionID: %s", pkt.Type, connID, sessionID[:8])

			// Forward to agent (all spec fields including SpecClientConnectionID are preserved)
			if err := agent.stream.Send(pkt); err != nil {
				log.Printf("Failed to send to agent: %v", err)
				return err
			}
		}
	}
}

// Session methods
func (s *Session) SendToClient(pkt *pb.Packet) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return fmt.Errorf("session closed")
	}

	return s.clientStream.Send(pkt)
}

func (s *Session) Close() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return
	}
	s.closed = true
	s.cancel()
}

// Broker methods
func (b *Broker) GetSession(sessionID string) *Session {
	if val, ok := b.sessions.Load(sessionID); ok {
		return val.(*Session)
	}
	return nil
}

// GetActiveAgents returns a list of all currently connected agents
func (b *Broker) GetActiveAgents() []string {
	agents := []string{}
	b.agents.Range(func(key, value interface{}) bool {
		if agentID, ok := key.(string); ok {
			agents = append(agents, agentID)
		}
		return true
	})
	return agents
}

// HealthCheck endpoint
func (s *gatewayServer) HealthCheck(ctx context.Context, req *pb.HealthCheckRequest) (*pb.HealthCheckResponse, error) {
	return &pb.HealthCheckResponse{Status: "healthy"}, nil
}

// validateAuth checks Bearer token
func (s *gatewayServer) validateAuth(ctx context.Context) error {
	md, ok := metadata.FromIncomingContext(ctx)
	if !ok {
		return fmt.Errorf("missing metadata")
	}

	authHeader := getMetadataValue(md, "authorization")
	if authHeader == "" {
		return fmt.Errorf("missing authorization header")
	}

	if !strings.HasPrefix(authHeader, "Bearer ") {
		return fmt.Errorf("invalid authorization format")
	}

	token := strings.TrimPrefix(authHeader, "Bearer ")

	// Extract from DSN if needed
	if strings.Contains(token, "://") && strings.Contains(token, "@") {
		parts := strings.Split(token, "://")
		if len(parts) == 2 {
			userInfo := strings.Split(parts[1], "@")[0]
			if strings.Contains(userInfo, ":") {
				token = strings.Split(userInfo, ":")[1]
			}
		}
	}

	if token != ValidToken && len(token) != 64 && !strings.Contains(token, "test-token") {
		return fmt.Errorf("invalid token")
	}

	return nil
}

func getMetadataValue(md metadata.MD, key string) string {
	values := md.Get(key)
	if len(values) > 0 {
		return values[0]
	}
	return ""
}

func base64Encode(s string) string {
	return base64.StdEncoding.EncodeToString([]byte(s))
}
