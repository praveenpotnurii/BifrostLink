package controller

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"strings"
	"time"

	_ "github.com/go-sql-driver/mysql" // MySQL driver

	"github.com/bifrost/common/log"
	pb "github.com/bifrost/common/proto"
	pbclient "github.com/bifrost/common/proto/client"
)

// MySQL connection pool manager
type mysqlConnection struct {
	db           *sql.DB
	streamClient io.Writer
	sessionID    string
}

func (a *Agent) processMySQLProtocol(pkt *pb.Packet) {
	sessionID := string(pkt.Spec[pb.SpecGatewaySessionID])
	streamClient := pb.NewStreamWriter(a.client, pbclient.MySQLConnectionWrite, pkt.Spec)
	connParams := a.connectionParams(sessionID)
	if connParams == nil {
		log.Errorf("session=%s - connection params not found", sessionID)
		a.sendClientSessionClose(sessionID, "connection params not found, contact the administrator")
		return
	}

	clientConnectionID := string(pkt.Spec[pb.SpecClientConnectionID])
	if clientConnectionID == "" && pkt.Payload != nil {
		log.Errorf("connection id not found in memory")
		a.sendClientSessionClose(sessionID, "connection id not found, contact the administrator")
		return
	}

	clientConnectionIDKey := fmt.Sprintf("%s:%s", sessionID, string(clientConnectionID))

	// Check if connection already exists (for connection reuse)
	clientObj := a.connStore.Get(clientConnectionIDKey)
	if mysqlConn, ok := clientObj.(*mysqlConnection); ok {
		// Reuse existing connection for subsequent queries
		query := string(pkt.Payload)
		if err := a.executeMySQLQuery(mysqlConn, query); err != nil {
			log.Errorf("session=%s - query execution failed: %v", sessionID, err)
			a.sendClientSessionCloseWithExitCode(sessionID, fmt.Sprintf("query failed: %v", err), "1")
		} else {
			a.sendClientSessionCloseWithExitCode(sessionID, "", "0")
		}
		return
	}

	// Parse connection parameters
	connenv, err := parseConnectionEnvVars(connParams.EnvVars, pb.ConnectionTypeMySQL)
	if err != nil {
		log.Error("mysql credentials not found in memory, err=%v", err)
		a.sendClientSessionClose(sessionID, "credentials are empty, contact the administrator")
		return
	}

	log.Infof("session=%v - starting mysql connection at %v:%v", sessionID, connenv.host, connenv.port)

	// Build MySQL DSN (Data Source Name)
	// Format: username:password@tcp(host:port)/dbname?parseTime=true&loc=Local
	dsn := fmt.Sprintf("%s:%s@tcp(%s:%s)/%s?parseTime=true&loc=Local&timeout=5s",
		connenv.user, connenv.pass, connenv.host, connenv.port, connenv.dbname)

	// Open database connection with connection pooling
	db, err := sql.Open("mysql", dsn)
	if err != nil {
		errMsg := fmt.Sprintf("failed to open mysql connection: %v", err)
		log.Errorf(errMsg)
		a.sendClientSessionClose(sessionID, errMsg)
		return
	}

	// Configure connection pool
	db.SetMaxOpenConns(25)                 // Maximum number of open connections
	db.SetMaxIdleConns(5)                  // Maximum number of idle connections
	db.SetConnMaxLifetime(5 * time.Minute) // Connection lifetime

	// Test the connection
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		errMsg := fmt.Sprintf("failed to connect to mysql: %v", err)
		log.Errorf(errMsg)
		db.Close()
		a.sendClientSessionClose(sessionID, errMsg)
		return
	}

	log.Infof("session=%v - successfully connected to mysql database", sessionID)

	// Create MySQL connection wrapper
	mysqlConn := &mysqlConnection{
		db:           db,
		streamClient: streamClient,
		sessionID:    sessionID,
	}

	// Execute the query
	query := string(pkt.Payload)
	log.Infof("session=%v - executing query: %s", sessionID, query)

	if err := a.executeMySQLQuery(mysqlConn, query); err != nil {
		log.Errorf("session=%s - query execution failed: %v", sessionID, err)
		db.Close()
		a.sendClientSessionCloseWithExitCode(sessionID, fmt.Sprintf("query failed: %v", err), "1")
		return
	}

	// Store connection for reuse
	a.connStore.Set(clientConnectionIDKey, mysqlConn)

	// Send success response
	a.sendClientSessionCloseWithExitCode(sessionID, "", "0")
}

// executeMySQLQuery executes a SQL query and streams results back to client
func (a *Agent) executeMySQLQuery(mysqlConn *mysqlConnection, query string) error {
	if query == "" {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Execute query
	rows, err := mysqlConn.db.QueryContext(ctx, query)
	if err != nil {
		return fmt.Errorf("query execution error: %w", err)
	}
	defer rows.Close()

	// Get column count
	columns, err := rows.Columns()
	if err != nil {
		return fmt.Errorf("failed to get columns: %w", err)
	}

	// NOTE: Don't send header row - CLI tools (mysql -e) don't send headers by default
	// The frontend parser expects raw data rows only

	// Prepare value holders for scanning
	values := make([]interface{}, len(columns))
	valuePtrs := make([]interface{}, len(columns))
	for i := range values {
		valuePtrs[i] = &values[i]
	}

	// Accumulate all rows in a buffer before writing (to avoid streaming issues)
	var outputBuffer strings.Builder
	rowCount := 0

	for rows.Next() {
		if err := rows.Scan(valuePtrs...); err != nil {
			return fmt.Errorf("failed to scan row: %w", err)
		}

		// Build row data (tab-separated values)
		rowData := make([]string, len(columns))
		for i, val := range values {
			if val == nil {
				rowData[i] = "NULL"
			} else {
				switch v := val.(type) {
				case []byte:
					rowData[i] = string(v)
				case time.Time:
					rowData[i] = v.Format("2006-01-02 15:04:05")
				default:
					rowData[i] = fmt.Sprintf("%v", v)
				}
			}
		}

		rowLine := strings.Join(rowData, "\t") + "\n"
		outputBuffer.WriteString(rowLine)
		rowCount++
	}

	// Write all accumulated rows at once
	if outputBuffer.Len() > 0 {
		if _, err := mysqlConn.streamClient.Write([]byte(outputBuffer.String())); err != nil {
			return fmt.Errorf("failed to write results: %w", err)
		}
	}

	if err := rows.Err(); err != nil {
		return fmt.Errorf("row iteration error: %w", err)
	}

	log.Infof("session=%v - query returned %d rows", mysqlConn.sessionID, rowCount)
	return nil
}
