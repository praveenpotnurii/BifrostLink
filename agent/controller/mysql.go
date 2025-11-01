package controller

import (
	"fmt"
	"io"

	"github.com/bifrost/common/log"
	pb "github.com/bifrost/common/proto"
	pbclient "github.com/bifrost/common/proto/client"
)

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
	clientObj := a.connStore.Get(clientConnectionIDKey)
	if proxyServerWriter, ok := clientObj.(io.WriteCloser); ok {
		if _, err := proxyServerWriter.Write(pkt.Payload); err != nil {
			log.Errorf("failed sending packet, err=%v", err)
			a.sendClientSessionClose(sessionID, "fail to write packet")
			_ = proxyServerWriter.Close()
		}
		return
	}

	connenv, err := parseConnectionEnvVars(connParams.EnvVars, pb.ConnectionTypeMySQL)
	if err != nil {
		log.Error("mysql credentials not found in memory, err=%v", err)
		a.sendClientSessionClose(sessionID, "credentials are empty, contact the administrator")
		return
	}

	log.Infof("session=%v - starting mysql connection at %v:%v", sessionID, connenv.host, connenv.port)

	// POC: Execute MySQL query directly using mysql CLI (libbifrost is stub in POC)
	// In production, this would use libbifrost's MySQL protocol handler
	query := string(pkt.Payload)
	log.Infof("session=%v - executing query: %s", sessionID, query)

	// Execute mysql command (disable SSL for POC demo, force TCP protocol)
	// Using --skip-ssl for compatibility with both MySQL and MariaDB clients
	mysqlCmd := fmt.Sprintf("mysql --protocol=TCP -h%s -P%s -u%s -p%s --skip-ssl -D%s -e \"%s\" 2>&1",
		connenv.host, connenv.port, connenv.user, connenv.pass, connenv.dbname, query)

	output, exitCode := a.executeMySQLCommand(mysqlCmd)

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
