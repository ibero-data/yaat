package enrichment

import (
	"github.com/mssola/useragent"
)

// UAResult contains parsed user-agent data
type UAResult struct {
	BrowserName    string
	BrowserVersion string
	OSName         string
	OSVersion      string
	DeviceType     string
	IsMobile       bool
	IsBot          bool
}

// ParseUserAgent parses a user-agent string
func ParseUserAgent(uaString string) *UAResult {
	ua := useragent.New(uaString)

	browserName, browserVersion := ua.Browser()
	osName := ua.OS()

	result := &UAResult{
		BrowserName:    browserName,
		BrowserVersion: browserVersion,
		OSName:         osName,
		IsMobile:       ua.Mobile(),
		IsBot:          ua.Bot(),
	}

	// Determine device type
	if ua.Mobile() {
		result.DeviceType = "mobile"
	} else if isTablet(uaString) {
		result.DeviceType = "tablet"
	} else {
		result.DeviceType = "desktop"
	}

	return result
}

func isTablet(ua string) bool {
	// Simple tablet detection
	tablets := []string{
		"iPad", "Android", "Tablet", "PlayBook", "Silk",
	}
	for _, t := range tablets {
		if contains(ua, t) && !contains(ua, "Mobile") {
			return true
		}
	}
	return false
}

func contains(s, substr string) bool {
	return len(s) >= len(substr) && findSubstring(s, substr)
}

func findSubstring(s, substr string) bool {
	for i := 0; i <= len(s)-len(substr); i++ {
		if s[i:i+len(substr)] == substr {
			return true
		}
	}
	return false
}
