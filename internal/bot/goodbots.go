package bot

import (
	"regexp"
	"strings"
)

// GoodBot represents a known legitimate crawler
type GoodBot struct {
	Name    string
	Pattern *regexp.Regexp
}

// goodBots is a list of known legitimate crawlers
var goodBots = []GoodBot{
	// Search engines
	{Name: "Googlebot", Pattern: regexp.MustCompile(`(?i)googlebot|google\s*web\s*preview|mediapartners-google|adsbot-google`)},
	{Name: "Bingbot", Pattern: regexp.MustCompile(`(?i)bingbot|msnbot|bingpreview`)},
	{Name: "Yahoo Slurp", Pattern: regexp.MustCompile(`(?i)slurp|yahoo`)},
	{Name: "DuckDuckBot", Pattern: regexp.MustCompile(`(?i)duckduckbot|duckduckgo`)},
	{Name: "Baiduspider", Pattern: regexp.MustCompile(`(?i)baiduspider|baidu`)},
	{Name: "Yandexbot", Pattern: regexp.MustCompile(`(?i)yandexbot|yandex`)},

	// Social media
	{Name: "Facebookbot", Pattern: regexp.MustCompile(`(?i)facebookexternalhit|facebot|facebook`)},
	{Name: "Twitterbot", Pattern: regexp.MustCompile(`(?i)twitterbot|twitter`)},
	{Name: "LinkedInBot", Pattern: regexp.MustCompile(`(?i)linkedinbot|linkedin`)},
	{Name: "Pinterest", Pattern: regexp.MustCompile(`(?i)pinterest`)},
	{Name: "WhatsApp", Pattern: regexp.MustCompile(`(?i)whatsapp`)},
	{Name: "Telegram", Pattern: regexp.MustCompile(`(?i)telegrambot`)},
	{Name: "Discord", Pattern: regexp.MustCompile(`(?i)discordbot`)},
	{Name: "Slack", Pattern: regexp.MustCompile(`(?i)slackbot|slack-imgproxy`)},

	// SEO tools (legitimate)
	{Name: "Ahrefs", Pattern: regexp.MustCompile(`(?i)ahrefsbot`)},
	{Name: "Semrush", Pattern: regexp.MustCompile(`(?i)semrushbot`)},
	{Name: "Moz", Pattern: regexp.MustCompile(`(?i)rogerbot|moz\.com`)},

	// Monitoring
	{Name: "Pingdom", Pattern: regexp.MustCompile(`(?i)pingdom`)},
	{Name: "UptimeRobot", Pattern: regexp.MustCompile(`(?i)uptimerobot`)},
	{Name: "StatusCake", Pattern: regexp.MustCompile(`(?i)statuscake`)},
	{Name: "GTmetrix", Pattern: regexp.MustCompile(`(?i)gtmetrix`)},

	// Feed readers
	{Name: "Feedly", Pattern: regexp.MustCompile(`(?i)feedly`)},
	{Name: "Feedbin", Pattern: regexp.MustCompile(`(?i)feedbin`)},

	// Other legitimate bots
	{Name: "Apple Bot", Pattern: regexp.MustCompile(`(?i)applebot`)},
	{Name: "Archive.org", Pattern: regexp.MustCompile(`(?i)archive\.org|ia_archiver`)},
}

// IsGoodBot checks if the user agent belongs to a known legitimate crawler
func IsGoodBot(userAgent string) bool {
	if userAgent == "" {
		return false
	}

	ua := strings.ToLower(userAgent)

	for _, bot := range goodBots {
		if bot.Pattern.MatchString(ua) {
			return true
		}
	}

	return false
}

// GetGoodBotName returns the name of the good bot if detected
func GetGoodBotName(userAgent string) string {
	if userAgent == "" {
		return ""
	}

	ua := strings.ToLower(userAgent)

	for _, bot := range goodBots {
		if bot.Pattern.MatchString(ua) {
			return bot.Name
		}
	}

	return ""
}

// GetGoodBotsList returns a list of all known good bot names
func GetGoodBotsList() []string {
	names := make([]string, len(goodBots))
	for i, bot := range goodBots {
		names[i] = bot.Name
	}
	return names
}
