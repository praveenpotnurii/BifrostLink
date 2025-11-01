package controller

import (
	"fmt"
	"io"

	"github.com/bifrost/common/log"
	pb "github.com/bifrost/common/proto"
	pbclient "github.com/bifrost/common/proto/client"
)

func (a *Agent) processMongoDBProtocol(pkt *pb.Packet) {
	sessionID := string(pkt.Spec[pb.SpecGatewaySessionID])
	streamClient := pb.NewStreamWriter(a.client, pbclient.MongoDBConnectionWrite, pkt.Spec)
	connParams := a.connectionParams(sessionID)
	if connParams == nil {
		log.With("sid", sessionID).Errorf("connection params not found")
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
	clientObj := a.connStore.Get(clientConnectionIDKey)
	if proxyServerWriter, ok := clientObj.(io.WriteCloser); ok {
		if _, err := proxyServerWriter.Write(pkt.Payload); err != nil {
			log.With("sid", sessionID).Errorf("failed sending packet, err=%v", err)
			a.sendClientSessionClose(sessionID, "fail to write packet")
			_ = proxyServerWriter.Close()
		}
		return
	}

	connenv, err := parseConnectionEnvVars(connParams.EnvVars, pb.ConnectionTypeMongoDB)
	if err != nil {
		log.With("sid", sessionID).Error("mongodb credentials not found in memory, err=%v", err)
		a.sendClientSessionClose(sessionID, "credentials are empty, contact the administrator")
		return
	}

	log.With("sid", sessionID, "conn", clientConnectionID, "legacy", connenv.connectionString == "").
		Infof("starting mongodb connection at %v", connenv.Address())

	// POC: Execute MongoDB query directly using mongosh CLI (libbifrost is stub in POC)
	// In production, this would use libbifrost's MongoDB protocol handler
	query := string(pkt.Payload)
	log.Infof("session=%v - executing query: %s", sessionID, query)

	// Build MongoDB connection string
	var connString string
	if connenv.connectionString != "" {
		connString = connenv.connectionString
	} else {
		// Build connection string from individual parameters
		connString = fmt.Sprintf("mongodb://%s:%s@%s:%s/%s?authSource=admin",
			connenv.user, connenv.pass, connenv.host, connenv.port, connenv.dbname)
	}

	// Execute mongosh command (try mongosh first, fallback to mongo)
	// Use --quiet to suppress warnings and --eval to execute the query
	mongoCmd := fmt.Sprintf("mongosh \"%s\" --quiet --eval '%s' 2>&1 || mongo \"%s\" --quiet --eval '%s' 2>&1",
		connString, query, connString, query)

	output, exitCode := a.executeMongoDBCommand(mongoCmd)

	// Send output back to client
	if len(output) > 0 {
		_, _ = streamClient.Write(output)
	}

	// Close the session with exit code
	if exitCode == 0 {
		a.sendClientSessionCloseWithExitCode(sessionID, "", "0")
	} else {
		a.sendClientSessionCloseWithExitCode(sessionID, "query execution failed", fmt.Sprintf("%d", exitCode))
	}
}
