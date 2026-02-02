package enrichment

import (
	"regexp"
	"strings"
)

// Bot patterns for detection
var botPatterns = []string{
	// Search engine crawlers
	`googlebot`, `bingbot`, `yandexbot`, `baiduspider`, `duckduckbot`,
	`slurp`, `sogou`, `exabot`, `facebot`, `ia_archiver`,

	// Social media crawlers
	`facebookexternalhit`, `twitterbot`, `linkedinbot`, `pinterest`,
	`whatsapp`, `telegrambot`, `slackbot`, `discordbot`,

	// Monitoring & SEO tools
	`pingdom`, `uptimerobot`, `statuscake`, `site24x7`, `datadog`,
	`newrelic`, `ahrefs`, `semrush`, `moz`, `majestic`, `screaming`,

	// Testing & automation
	`headless`, `phantom`, `puppeteer`, `selenium`, `playwright`,
	`webdriver`, `cypress`, `house`, `pagespeed`, `gtmetrix`,

	// Generic bot indicators
	`bot`, `crawler`, `spider`, `scraper`, `http`, `curl`, `wget`,
	`python-requests`, `go-http-client`, `java`, `ruby`, `perl`,
	`libwww`, `lwp`, `apache-httpclient`, `okhttp`,
}

var botRegex *regexp.Regexp

func init() {
	pattern := strings.Join(botPatterns, "|")
	botRegex = regexp.MustCompile(`(?i)(` + pattern + `)`)
}

// IsBot checks if a user-agent belongs to a bot
func IsBot(userAgent string) bool {
	if userAgent == "" {
		return true // Empty UA is suspicious
	}

	ua := strings.ToLower(userAgent)

	// Quick regex check
	if botRegex.MatchString(ua) {
		return true
	}

	// Check for missing typical browser indicators
	browserIndicators := []string{
		"mozilla", "chrome", "safari", "firefox", "edge", "opera",
	}
	hasBrowserIndicator := false
	for _, indicator := range browserIndicators {
		if strings.Contains(ua, indicator) {
			hasBrowserIndicator = true
			break
		}
	}

	// If no browser indicator and very short UA, likely a bot
	if !hasBrowserIndicator && len(userAgent) < 50 {
		return true
	}

	return false
}
