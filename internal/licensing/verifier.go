package licensing

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/json"
	"errors"
	"time"
)

// Public key for license verification (embedded in binary)
// This is the PUBLIC key - private key is kept secret for license generation
// Generate with: go run ./cmd/licensegen -keygen
var publicKeyBase64 = "Xsr8J8AX+2nz0ZCS6N3AZy64WoZobmXZOX8cqXGac5o="

var (
	ErrInvalidSignature = errors.New("invalid license signature")
	ErrExpiredLicense   = errors.New("license has expired")
	ErrInvalidPayload   = errors.New("invalid license payload")
)

type Verifier struct {
	publicKey ed25519.PublicKey
}

func NewVerifier() (*Verifier, error) {
	keyBytes, err := base64.StdEncoding.DecodeString(publicKeyBase64)
	if err != nil {
		return nil, err
	}

	// For PKIX format, extract the actual key (last 32 bytes)
	if len(keyBytes) > 32 {
		keyBytes = keyBytes[len(keyBytes)-32:]
	}

	return &Verifier{
		publicKey: ed25519.PublicKey(keyBytes),
	}, nil
}

func (v *Verifier) Verify(licenseFile *LicenseFile) (*License, ValidationState, error) {
	// Decode signature
	signature, err := base64.StdEncoding.DecodeString(licenseFile.Signature)
	if err != nil {
		return nil, StateTampered, ErrInvalidSignature
	}

	// Verify signature (signature is computed over the base64-encoded payload string)
	if !ed25519.Verify(v.publicKey, []byte(licenseFile.Payload), signature) {
		return nil, StateTampered, ErrInvalidSignature
	}

	// Decode payload (now that signature is verified)
	payloadBytes, err := base64.StdEncoding.DecodeString(licenseFile.Payload)
	if err != nil {
		return nil, StateTampered, ErrInvalidPayload
	}

	// Parse license
	var license License
	if err := json.Unmarshal(payloadBytes, &license); err != nil {
		return nil, StateTampered, ErrInvalidPayload
	}

	// Check expiration
	if time.Now().After(license.ExpiresAt) {
		return &license, StateExpired, ErrExpiredLicense
	}

	return &license, StateValid, nil
}

// SetPublicKey allows setting a custom public key (for testing)
func SetPublicKey(key string) {
	publicKeyBase64 = key
}
