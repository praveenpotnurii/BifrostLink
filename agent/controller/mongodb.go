package controller

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/bifrost/common/log"
	pb "github.com/bifrost/common/proto"
	pbclient "github.com/bifrost/common/proto/client"
)

// MongoDB connection pool manager
type mongoConnection struct {
	client       *mongo.Client
	database     string
	streamClient io.Writer
	sessionID    string
}

func (a *Agent) processMongoDBProtocol(pkt *pb.Packet) {
	sessionID := string(pkt.Spec[pb.SpecGatewaySessionID])
	streamClient := pb.NewStreamWriter(a.client, pbclient.MongoDBConnectionWrite, pkt.Spec)
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
	if mongoConn, ok := clientObj.(*mongoConnection); ok {
		// Reuse existing connection for subsequent queries
		query := string(pkt.Payload)
		if err := a.executeMongoDBQuery(mongoConn, query); err != nil {
			log.Errorf("session=%s - query execution failed: %v", sessionID, err)
			a.sendClientSessionCloseWithExitCode(sessionID, fmt.Sprintf("query failed: %v", err), "1")
		} else {
			a.sendClientSessionCloseWithExitCode(sessionID, "", "0")
		}
		return
	}

	// Parse connection parameters
	connenv, err := parseConnectionEnvVars(connParams.EnvVars, pb.ConnectionTypeMongoDB)
	if err != nil {
		log.Error("mongodb credentials not found in memory, err=%v", err)
		a.sendClientSessionClose(sessionID, "credentials are empty, contact the administrator")
		return
	}

	log.Infof("session=%v - starting mongodb connection at %v:%v", sessionID, connenv.host, connenv.port)

	// Build MongoDB connection string
	var connString string
	if connenv.connectionString != "" {
		connString = connenv.connectionString
	} else {
		connString = fmt.Sprintf("mongodb://%s:%s@%s:%s/%s?authSource=admin",
			connenv.user, connenv.pass, connenv.host, connenv.port, connenv.dbname)
	}

	// Set client options with connection pooling
	clientOptions := options.Client().
		ApplyURI(connString).
		SetMaxPoolSize(25).
		SetMinPoolSize(5).
		SetMaxConnIdleTime(5 * time.Minute).
		SetConnectTimeout(5 * time.Second).
		SetServerSelectionTimeout(5 * time.Second)

	// Connect to MongoDB
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	mongoClient, err := mongo.Connect(ctx, clientOptions)
	if err != nil {
		errMsg := fmt.Sprintf("failed to connect to mongodb: %v", err)
		log.Errorf(errMsg)
		a.sendClientSessionClose(sessionID, errMsg)
		return
	}

	// Test the connection
	if err := mongoClient.Ping(ctx, nil); err != nil {
		errMsg := fmt.Sprintf("failed to ping mongodb: %v", err)
		log.Errorf(errMsg)
		mongoClient.Disconnect(context.Background())
		a.sendClientSessionClose(sessionID, errMsg)
		return
	}

	log.Infof("session=%v - successfully connected to mongodb database", sessionID)

	// Create MongoDB connection wrapper
	mongoConn := &mongoConnection{
		client:       mongoClient,
		database:     connenv.dbname,
		streamClient: streamClient,
		sessionID:    sessionID,
	}

	// Execute the query
	query := string(pkt.Payload)
	log.Infof("session=%v - executing query: %s", sessionID, query)

	if err := a.executeMongoDBQuery(mongoConn, query); err != nil {
		log.Errorf("session=%s - query execution failed: %v", sessionID, err)
		mongoClient.Disconnect(context.Background())
		a.sendClientSessionCloseWithExitCode(sessionID, fmt.Sprintf("query failed: %v", err), "1")
		return
	}

	// Store connection for reuse
	a.connStore.Set(clientConnectionIDKey, mongoConn)

	// Send success response
	a.sendClientSessionCloseWithExitCode(sessionID, "", "0")
}

// executeMongoDBQuery executes a MongoDB query and streams results back to client
func (a *Agent) executeMongoDBQuery(mongoConn *mongoConnection, query string) error {
	if query == "" {
		return nil
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Parse the query to extract collection and operation
	// Expected format: db.collection.operation(args)
	query = strings.TrimSpace(query)

	// Simple parser for MongoDB shell queries
	if !strings.HasPrefix(query, "db.") {
		return fmt.Errorf("query must start with 'db.'")
	}

	// Remove "db." prefix
	query = strings.TrimPrefix(query, "db.")

	// Find collection name (everything before the first dot)
	parts := strings.SplitN(query, ".", 2)
	if len(parts) < 2 {
		return fmt.Errorf("invalid query format: expected db.collection.operation()")
	}

	collectionName := parts[0]
	operationPart := parts[1]

	// Get the collection
	collection := mongoConn.client.Database(mongoConn.database).Collection(collectionName)

	var outputBuffer strings.Builder
	var err error

	// Handle different operations
	if strings.HasPrefix(operationPart, "find(") {
		err = a.executeMongoFind(ctx, collection, operationPart, &outputBuffer)
	} else if strings.HasPrefix(operationPart, "countDocuments(") {
		err = a.executeMongoCount(ctx, collection, operationPart, &outputBuffer)
	} else if strings.HasPrefix(operationPart, "count(") {
		err = a.executeMongoCount(ctx, collection, operationPart, &outputBuffer)
	} else {
		return fmt.Errorf("unsupported operation: %s (supported: find, countDocuments, count)", operationPart)
	}

	if err != nil {
		return err
	}

	// Write accumulated output
	if outputBuffer.Len() > 0 {
		if _, err := mongoConn.streamClient.Write([]byte(outputBuffer.String())); err != nil {
			return fmt.Errorf("failed to write results: %w", err)
		}
	}

	return nil
}

// executeMongoFind executes a find operation
func (a *Agent) executeMongoFind(ctx context.Context, collection *mongo.Collection, operation string, output *strings.Builder) error {
	// For simplicity, treat find() and find({}) as finding all documents
	// In a full implementation, would parse the filter argument
	cursor, err := collection.Find(ctx, bson.D{})
	if err != nil {
		return fmt.Errorf("find query error: %w", err)
	}
	defer cursor.Close(ctx)

	rowCount := 0
	for cursor.Next(ctx) {
		var result bson.M
		if err := cursor.Decode(&result); err != nil {
			return fmt.Errorf("failed to decode document: %w", err)
		}

		// Convert to JSON for output (matching mongosh behavior)
		jsonBytes, err := json.Marshal(result)
		if err != nil {
			return fmt.Errorf("failed to marshal document: %w", err)
		}

		output.WriteString(string(jsonBytes))
		output.WriteString("\n")
		rowCount++
	}

	if err := cursor.Err(); err != nil {
		return fmt.Errorf("cursor iteration error: %w", err)
	}

	log.Infof("session=%v - find query returned %d documents", output, rowCount)
	return nil
}

// executeMongoCount executes a count operation
func (a *Agent) executeMongoCount(ctx context.Context, collection *mongo.Collection, operation string, output *strings.Builder) error {
	count, err := collection.CountDocuments(ctx, bson.D{})
	if err != nil {
		return fmt.Errorf("count query error: %w", err)
	}

	output.WriteString(fmt.Sprintf("%d\n", count))
	log.Infof("session=%v - count query returned %d", output, count)
	return nil
}
