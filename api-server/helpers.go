package main

import (
	"bytes"
	"encoding/base64"
	"encoding/gob"

	pb "github.com/bifrost/common/proto"
)

func base64Encode(s string) string {
	return base64.StdEncoding.EncodeToString([]byte(s))
}

func encodeConnectionParams(params *pb.AgentConnectionParams) ([]byte, error) {
	var buf bytes.Buffer
	encoder := gob.NewEncoder(&buf)
	if err := encoder.Encode(params); err != nil {
		return nil, err
	}
	return buf.Bytes(), nil
}
