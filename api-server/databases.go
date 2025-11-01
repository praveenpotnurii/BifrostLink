package main

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
)

type Database struct {
	ID           int    `json:"id"`
	DatabaseName string `json:"database_name"`
	AgentID      string `json:"agent_id"`
	Host         string `json:"host"`
	Port         string `json:"port"`
	Username     string `json:"username"`
	Password     string `json:"password"`
	DBName       string `json:"db_name"`
	Description  string `json:"description"`
	CreatedAt    string `json:"created_at"`
	UpdatedAt    string `json:"updated_at"`
}

// GET /api/databases - Get all databases
func handleGetDatabases(w http.ResponseWriter, r *http.Request) {
	rows, err := db.Query(`
		SELECT id, database_name, agent_id, host, port, username, password, db_name, description, created_at, updated_at
		FROM databases
		ORDER BY created_at DESC
	`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	databases := []Database{}
	for rows.Next() {
		var database Database
		err := rows.Scan(&database.ID, &database.DatabaseName, &database.AgentID, &database.Host, &database.Port,
			&database.Username, &database.Password, &database.DBName, &database.Description,
			&database.CreatedAt, &database.UpdatedAt)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
		databases = append(databases, database)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(databases)
}

// GET /api/databases/:id - Get single database
func handleGetDatabase(w http.ResponseWriter, r *http.Request) {
	idStr := strings.TrimPrefix(r.URL.Path, "/api/databases/")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid database ID", http.StatusBadRequest)
		return
	}

	var database Database
	err = db.QueryRow(`
		SELECT id, database_name, agent_id, host, port, username, password, db_name, description, created_at, updated_at
		FROM databases
		WHERE id = $1
	`, id).Scan(&database.ID, &database.DatabaseName, &database.AgentID, &database.Host, &database.Port,
		&database.Username, &database.Password, &database.DBName, &database.Description,
		&database.CreatedAt, &database.UpdatedAt)

	if err != nil {
		http.Error(w, "Database not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(database)
}

// POST /api/databases - Create new database
func handleCreateDatabase(w http.ResponseWriter, r *http.Request) {
	var database Database
	if err := json.NewDecoder(r.Body).Decode(&database); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	// Validate required fields
	if database.DatabaseName == "" || database.AgentID == "" || database.Host == "" ||
		database.Port == "" || database.Username == "" || database.DBName == "" {
		http.Error(w, "Missing required fields", http.StatusBadRequest)
		return
	}

	err := db.QueryRow(`
		INSERT INTO databases (database_name, agent_id, host, port, username, password, db_name, description)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, created_at, updated_at
	`, database.DatabaseName, database.AgentID, database.Host, database.Port,
		database.Username, database.Password, database.DBName, database.Description).
		Scan(&database.ID, &database.CreatedAt, &database.UpdatedAt)

	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			http.Error(w, "Database name already exists", http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(database)
}

// PUT /api/databases/:id - Update database
func handleUpdateDatabase(w http.ResponseWriter, r *http.Request) {
	idStr := strings.TrimPrefix(r.URL.Path, "/api/databases/")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid database ID", http.StatusBadRequest)
		return
	}

	var database Database
	if err := json.NewDecoder(r.Body).Decode(&database); err != nil {
		http.Error(w, err.Error(), http.StatusBadRequest)
		return
	}

	_, err = db.Exec(`
		UPDATE databases
		SET database_name = $1, agent_id = $2, host = $3, port = $4, username = $5, password = $6, db_name = $7, description = $8, updated_at = NOW()
		WHERE id = $9
	`, database.DatabaseName, database.AgentID, database.Host, database.Port,
		database.Username, database.Password, database.DBName, database.Description, id)

	if err != nil {
		if strings.Contains(err.Error(), "duplicate key") {
			http.Error(w, "Database name already exists", http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Database updated successfully"})
}

// DELETE /api/databases/:id - Delete database
func handleDeleteDatabase(w http.ResponseWriter, r *http.Request) {
	idStr := strings.TrimPrefix(r.URL.Path, "/api/databases/")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		http.Error(w, "Invalid database ID", http.StatusBadRequest)
		return
	}

	_, err = db.Exec("DELETE FROM databases WHERE id = $1", id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Database deleted successfully"})
}
