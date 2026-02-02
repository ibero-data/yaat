package licensing

import (
	"encoding/json"
	"os"
	"sync"
	"time"
)

// Manager handles license loading and feature checking
type Manager struct {
	mu          sync.RWMutex
	license     *License
	state       ValidationState
	licensePath string
	verifier    *Verifier
}

func NewManager(licensePath string) *Manager {
	verifier, _ := NewVerifier()

	m := &Manager{
		licensePath: licensePath,
		state:       StateMissing,
		verifier:    verifier,
	}

	// Try to load existing license
	m.LoadLicense()

	return m
}

// LoadLicense loads and validates license from file
func (m *Manager) LoadLicense() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	data, err := os.ReadFile(m.licensePath)
	if err != nil {
		m.license = nil
		m.state = StateMissing
		return err
	}

	var licenseFile LicenseFile
	if err := json.Unmarshal(data, &licenseFile); err != nil {
		m.license = nil
		m.state = StateTampered
		return err
	}

	license, state, err := m.verifier.Verify(&licenseFile)
	m.license = license
	m.state = state

	return err
}

// SaveLicense saves a new license file
func (m *Manager) SaveLicense(licenseData []byte) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Validate before saving
	var licenseFile LicenseFile
	if err := json.Unmarshal(licenseData, &licenseFile); err != nil {
		return err
	}

	license, state, err := m.verifier.Verify(&licenseFile)
	if err != nil && state != StateExpired {
		return err
	}

	// Save to disk
	if err := os.WriteFile(m.licensePath, licenseData, 0600); err != nil {
		return err
	}

	m.license = license
	m.state = state

	return nil
}

// RemoveLicense removes the current license
func (m *Manager) RemoveLicense() error {
	m.mu.Lock()
	defer m.mu.Unlock()

	if err := os.Remove(m.licensePath); err != nil && !os.IsNotExist(err) {
		return err
	}

	m.license = nil
	m.state = StateMissing

	return nil
}

// HasFeature checks if a feature is enabled
func (m *Manager) HasFeature(feature string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.license == nil || m.state != StateValid {
		// Use community defaults
		features := DefaultFeatures(TierCommunity)
		return features[feature]
	}

	return m.license.Features[feature]
}

// GetLimit returns a limit value (-1 for unlimited)
func (m *Manager) GetLimit(limit string) int {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.license == nil || m.state != StateValid {
		// Use community defaults
		limits := DefaultLimits(TierCommunity)
		return limits[limit]
	}

	if val, ok := m.license.Limits[limit]; ok {
		return val
	}

	return DefaultLimits(m.license.Type)[limit]
}

// GetTier returns the current license tier
func (m *Manager) GetTier() string {
	m.mu.RLock()
	defer m.mu.RUnlock()

	if m.license == nil || m.state != StateValid {
		return TierCommunity
	}

	return m.license.Type
}

// GetState returns the validation state
func (m *Manager) GetState() ValidationState {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.state
}

// GetLicense returns the current license (may be nil)
func (m *Manager) GetLicense() *License {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.license
}

// GetInfo returns license info for API
func (m *Manager) GetInfo() map[string]interface{} {
	m.mu.RLock()
	defer m.mu.RUnlock()

	tier := TierCommunity
	features := DefaultFeatures(TierCommunity)
	limits := DefaultLimits(TierCommunity)
	var expiresAt *time.Time
	var licensee string

	if m.license != nil {
		tier = m.license.Type
		features = m.license.Features
		limits = m.license.Limits
		expiresAt = &m.license.ExpiresAt
		licensee = m.license.Licensee
	}

	return map[string]interface{}{
		"tier":       tier,
		"state":      m.state,
		"features":   features,
		"limits":     limits,
		"expires_at": expiresAt,
		"licensee":   licensee,
	}
}
