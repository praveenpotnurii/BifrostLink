package main

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Agent represents an agent in the system
type Agent struct {
	ID          int       `json:"id"`
	AgentID     string    `json:"agent_id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	Status      string    `json:"status,omitempty"`      // Runtime status (connected/disconnected)
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

type CreateAgentRequest struct {
	AgentID     string `json:"agent_id"`
	Name        string `json:"name"`
	Description string `json:"description"`
}

type UpdateAgentRequest struct {
	AgentID     string `json:"agent_id,omitempty"`
	Name        string `json:"name,omitempty"`
	Description string `json:"description,omitempty"`
}

// handleGetAgents returns all agents with their status
func handleGetAgents(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	rows, err := db.Query("SELECT id, agent_id, name, description, created_at, updated_at FROM agents ORDER BY created_at DESC")
	if err != nil {
		log.Printf("Error querying agents: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{Error: "Failed to fetch agents"})
		return
	}
	defer rows.Close()

	agents := []Agent{}
	for rows.Next() {
		var agent Agent
		err := rows.Scan(&agent.ID, &agent.AgentID, &agent.Name, &agent.Description, &agent.CreatedAt, &agent.UpdatedAt)
		if err != nil {
			log.Printf("Error scanning agent: %v", err)
			continue
		}
		agents = append(agents, agent)
	}

	// Get active agents from gateway
	activeAgents := getActiveAgentsFromGateway()
	activeMap := make(map[string]bool)
	for _, agentID := range activeAgents {
		activeMap[agentID] = true
	}

	// Update status for each agent
	for i := range agents {
		if activeMap[agents[i].AgentID] {
			agents[i].Status = "connected"
		} else {
			agents[i].Status = "disconnected"
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(agents)
}

// handleGetAgent returns a single agent by ID
func handleGetAgent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract ID from path
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 4 {
		http.Error(w, "Invalid agent ID", http.StatusBadRequest)
		return
	}

	idStr := pathParts[3]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid agent ID", http.StatusBadRequest)
		return
	}

	var agent Agent
	err = db.QueryRow("SELECT id, agent_id, name, description, created_at, updated_at FROM agents WHERE id = $1", id).
		Scan(&agent.ID, &agent.AgentID, &agent.Name, &agent.Description, &agent.CreatedAt, &agent.UpdatedAt)

	if err == sql.ErrNoRows {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(ErrorResponse{Error: "Agent not found"})
		return
	}

	if err != nil {
		log.Printf("Error querying agent: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{Error: "Failed to fetch agent"})
		return
	}

	// Check if agent is active
	activeAgents := getActiveAgentsFromGateway()
	agent.Status = "disconnected"
	for _, activeID := range activeAgents {
		if activeID == agent.AgentID {
			agent.Status = "connected"
			break
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(agent)
}

// handleCreateAgent creates a new agent
func handleCreateAgent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req CreateAgentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Error: "Invalid request body"})
		return
	}

	// Validate required fields
	if req.AgentID == "" || req.Name == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Error: "Agent ID and name are required"})
		return
	}

	var agent Agent
	err := db.QueryRow(
		"INSERT INTO agents (agent_id, name, description) VALUES ($1, $2, $3) RETURNING id, agent_id, name, description, created_at, updated_at",
		req.AgentID, req.Name, req.Description,
	).Scan(&agent.ID, &agent.AgentID, &agent.Name, &agent.Description, &agent.CreatedAt, &agent.UpdatedAt)

	if err != nil {
		log.Printf("Error creating agent: %v", err)

		// Check for unique constraint violations
		errorMsg := "Failed to create agent"
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique constraint") {
			errorMsg = "Agent ID already exists"
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Error: errorMsg})
		return
	}

	agent.Status = "disconnected"
	log.Printf("Created agent: %s (ID: %d)", agent.AgentID, agent.ID)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(agent)
}

// handleUpdateAgent updates an existing agent
func handleUpdateAgent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract ID from path
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 4 {
		http.Error(w, "Invalid agent ID", http.StatusBadRequest)
		return
	}

	idStr := pathParts[3]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid agent ID", http.StatusBadRequest)
		return
	}

	var req UpdateAgentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Error: "Invalid request body"})
		return
	}

	// Build dynamic update query
	updates := []string{}
	args := []interface{}{}
	argCount := 1

	if req.AgentID != "" {
		updates = append(updates, fmt.Sprintf("agent_id = $%d", argCount))
		args = append(args, req.AgentID)
		argCount++
	}
	if req.Name != "" {
		updates = append(updates, fmt.Sprintf("name = $%d", argCount))
		args = append(args, req.Name)
		argCount++
	}
	if req.Description != "" {
		updates = append(updates, fmt.Sprintf("description = $%d", argCount))
		args = append(args, req.Description)
		argCount++
	}

	if len(updates) == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Error: "No fields to update"})
		return
	}

	args = append(args, id)
	query := fmt.Sprintf("UPDATE agents SET %s WHERE id = $%d RETURNING id, agent_id, name, description, created_at, updated_at",
		strings.Join(updates, ", "), argCount)

	var agent Agent
	err = db.QueryRow(query, args...).
		Scan(&agent.ID, &agent.AgentID, &agent.Name, &agent.Description, &agent.CreatedAt, &agent.UpdatedAt)

	if err == sql.ErrNoRows {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(ErrorResponse{Error: "Agent not found"})
		return
	}

	if err != nil {
		log.Printf("Error updating agent: %v", err)

		errorMsg := "Failed to update agent"
		if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "unique constraint") {
			errorMsg = "Agent ID already exists"
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(ErrorResponse{Error: errorMsg})
		return
	}

	log.Printf("Updated agent ID: %d", agent.ID)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(agent)
}

// handleDeleteAgent deletes an agent
func handleDeleteAgent(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract ID from path
	pathParts := strings.Split(r.URL.Path, "/")
	if len(pathParts) < 4 {
		http.Error(w, "Invalid agent ID", http.StatusBadRequest)
		return
	}

	idStr := pathParts[3]
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid agent ID", http.StatusBadRequest)
		return
	}

	result, err := db.Exec("DELETE FROM agents WHERE id = $1", id)
	if err != nil {
		log.Printf("Error deleting agent: %v", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(ErrorResponse{Error: "Failed to delete agent"})
		return
	}

	rowsAffected, _ := result.RowsAffected()
	if rowsAffected == 0 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(ErrorResponse{Error: "Agent not found"})
		return
	}

	log.Printf("Deleted agent ID: %d", id)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Agent deleted successfully",
	})
}

// getActiveAgentsFromGateway queries the gateway for active agents
func getActiveAgentsFromGateway() []string {
	gatewayHTTPAddr := getEnv("GATEWAY_HTTP_ADDR", "localhost:8011")

	resp, err := http.Get(fmt.Sprintf("http://%s/agents", gatewayHTTPAddr))
	if err != nil {
		log.Printf("Failed to query gateway for active agents: %v", err)
		return []string{}
	}
	defer resp.Body.Close()

	var result struct {
		Agents []string `json:"agents"`
		Count  int      `json:"count"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		log.Printf("Failed to parse gateway response: %v", err)
		return []string{}
	}

	return result.Agents
}
