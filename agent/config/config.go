package config

import (
	"fmt"
	"os"

	"github.com/bifrost/common/clientconfig"
	"github.com/bifrost/common/dsnkeys"
	"github.com/bifrost/common/envloader"
	"github.com/bifrost/common/grpc"
	"github.com/bifrost/common/log"
	"github.com/bifrost/common/proto"
)

type Config struct {
	Token     string
	URL       string
	Name      string
	Type      string
	AgentMode string
	insecure  bool
	tlsCA     string
}

// Load the configuration based on environment variable BIFROST_KEY or BIFROST_DSN (legacy).
func Load() (*Config, error) {
	isLegacy, key := getEnvCredentials()
	dsn, err := dsnkeys.Parse(key)
	if err != nil && err != dsnkeys.ErrEmpty {
		if isLegacy {
			return nil, fmt.Errorf("BIFROST_DSN (deprecated) is in wrong format, reason=%v", err)
		}
		return nil, fmt.Errorf("BIFROST_KEY is in wrong format, reason=%v", err)
	}
	if dsn != nil {
		if isLegacy {
			log.Warnf("BIFROST_DSN environment variable is deprecated, use BIFROST_KEY instead")
		}
		tlsCA, err := envloader.GetEnv("BIFROST_TLSCA")
		if err != nil {
			return nil, err
		}
		isInsecure := dsn.Scheme == "http" || dsn.Scheme == "grpc"
		return &Config{
			Name:      dsn.Name,
			Type:      clientconfig.ModeDsn,
			AgentMode: dsn.AgentMode,
			Token:     dsn.Key(),
			URL:       dsn.Address,
			insecure:  isInsecure,
			tlsCA:     tlsCA,
		}, nil
	}
	legacyToken := getLegacyHoopTokenCredentials()
	grpcURL := os.Getenv("BIFROST_GRPCURL")
	if legacyToken != "" && grpcURL != "" {
		log.Warnf("BIFROST_TOKEN and BIFROST_GRPCURL environment variables are deprecated, create a new token to use the new format")
		return &Config{
			Type:      clientconfig.ModeEnv,
			AgentMode: proto.AgentModeStandardType,
			Token:     legacyToken,
			URL:       grpcURL,
			insecure:  grpcURL == grpc.LocalhostAddr}, nil
	}
	return nil, fmt.Errorf("missing BIFROST_KEY environment variable")
}

func (c *Config) GrpcClientConfig() (grpc.ClientConfig, error) {
	srvAddr, err := grpc.ParseServerAddress(c.URL)
	return grpc.ClientConfig{
		ServerAddress: srvAddr,
		Token:         c.Token,
		Insecure:      c.IsInsecure(),
		TLSServerName: os.Getenv("BIFROST_TLSSERVERNAME"),
		TLSCA:         c.tlsCA,
	}, err
}

func (c *Config) HasTlsCA() bool   { return c.tlsCA != "" }
func (c *Config) IsInsecure() bool { return c.insecure }
func (c *Config) IsValid() bool    { return c.Token != "" && c.URL != "" }

// getEnvToken backwards compatible with BIFROST_DSN env
func getEnvCredentials() (legacy bool, v string) {
	v = os.Getenv("BIFROST_KEY")
	if v != "" {
		return
	}
	return true, os.Getenv("BIFROST_DSN")
}

func getLegacyHoopTokenCredentials() string {
	token := os.Getenv("TOKEN")
	if token != "" {
		return token
	}
	return os.Getenv("BIFROST_TOKEN")
}
