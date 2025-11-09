package dbprovisioner

import (
	"crypto/rand"
	"encoding/json"

	"github.com/bifrost/common/log"
	"github.com/bifrost/common/memory"
	pb "github.com/bifrost/common/proto"
	pbsystem "github.com/bifrost/common/proto/system"
)

var memoryStore = memory.New()

func ProcessDBProvisionerRequest(client pb.ClientTransport, pkt *pb.Packet) {
	go processDBProvisionerRequest(client, pkt)
}

func processDBProvisionerRequest(client pb.ClientTransport, pkt *pb.Packet) {
	sid := string(pkt.Spec[pb.SpecGatewaySessionID])
	var req pbsystem.DBProvisionerRequest
	if err := json.Unmarshal(pkt.Payload, &req); err != nil {
		sendResponse(client, pbsystem.NewError(sid, "unable to decode payload: %v", err))
		return
	}

	// use a lock mechanism to avoid initializing multiple process to the same instance
	lockResourceID := req.OrgID + ":" + req.ResourceID
	if memoryStore.Has(lockResourceID) {
		sendResponse(client, pbsystem.NewError(sid, "process already being executed, resource_id=%v", req.ResourceID))
		return
	}
	memoryStore.Set(lockResourceID, nil)
	defer memoryStore.Del(lockResourceID)

	log.With("sid", sid).Infof("received provisoning request, type=%v, address=%v, masteruser=%v",
		req.DatabaseType, req.Address(), req.MasterUsername)

	var res *pbsystem.DBProvisionerResponse
	switch req.DatabaseType {
	case "postgres", "aurora-postgresql":
		res = provisionPostgresRoles(req)
	case "mysql", "aurora-mysql":
		res = provisionMySQLRoles(req)
	case "sqlserver-ee", "sqlserver-se", "sqlserver-ex", "sqlserver-web":
		res = provisionMSSQLRoles(req)
	default:
		sendResponse(client, pbsystem.NewError(sid, "database provisioner not implemented for type %q", req.DatabaseType))
		return
	}

	// if the provisioner doesn't set a status, set it to completed
	if res.Status == "" {
		res.Status = pbsystem.StatusCompletedType
		res.Message = pbsystem.MessageCompleted
	}

	// in case of any user provisioning error, set the main status as failed
	for _, item := range res.Result {
		if item.Status != pbsystem.StatusCompletedType {
			res.Message = pbsystem.MessageOneOrMoreRolesFailed
			res.Status = pbsystem.StatusFailedType
			break
		}
	}

	sendResponse(client, res)
}

func sendResponse(client pb.ClientTransport, response *pbsystem.DBProvisionerResponse) {
	payload, pbtype, _ := response.Encode()
	_ = client.Send(&pb.Packet{
		Type:    pbtype,
		Payload: payload,
		Spec: map[string][]byte{
			pb.SpecGatewaySessionID: []byte(response.SID),
		},
	})
}

func generateRandomPassword() (string, error) {
	// Character set for passwords (lowercase, uppercase, numbers, special chars)
	const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789*_"
	passwordLength := 25

	// Create a byte slice to store the password
	password := make([]byte, passwordLength)

	// Generate random bytes
	_, err := rand.Read(password)
	if err != nil {
		return "", err
	}

	// Map random bytes to characters in the charset
	for i := range passwordLength {
		// Use modulo to map the random byte to an index in the charset
		// This ensures the mapping is within the charset boundaries
		password[i] = charset[int(password[i])%len(charset)]
	}

	return string(password), nil
}
