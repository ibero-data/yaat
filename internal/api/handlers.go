package api

import (
	"bufio"
	"crypto/md5"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/yaat/yaat-/internal/adfraud"
	"github.com/yaat/yaat-/internal/auth"
	"github.com/yaat/yaat-/internal/bot"
	"github.com/yaat/yaat-/internal/config"
	"github.com/yaat/yaat-/internal/database"
	"github.com/yaat/yaat-/internal/enrichment"
	"github.com/yaat/yaat-/internal/identification"
	"github.com/yaat/yaat-/internal/licensing"
)

// Version is set from main.go at startup
var Version = "dev"

type Handlers struct {
	db             *database.DB
	enricher       *enrichment.Enricher
	licenseManager *licensing.Manager
	idGen          *identification.Generator
	cfg            *config.Config
	auth           *auth.Auth

	// SSE subscribers
	sseClients map[chan []byte]bool
	sseMu      sync.RWMutex
}

// Health check
func (h *Handlers) Health(w http.ResponseWriter, r *http.Request) {
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

// GetVersion returns the current version
func (h *Handlers) GetVersion(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"version": Version})
}

// ServeTrackerScript serves the JavaScript tracker
func (h *Handlers) ServeTrackerScript(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/javascript")
	w.Header().Set("Cache-Control", "public, max-age=86400")

	// Read embedded tracker script
	script, err := trackerJS.ReadFile("tracker.js")
	if err != nil {
		http.Error(w, "Script not found", http.StatusNotFound)
		return
	}

	// Inject configuration (no DNT - we're GDPR compliant by design with no cookies/PII)
	config := fmt.Sprintf(`window.__YAAT_CONFIG__={endpoint:"%s",trackPerformance:%t,trackErrors:%t};`,
		"/i",
		h.cfg.TrackPerformance && h.licenseManager.HasFeature(licensing.FeaturePerformance),
		h.cfg.TrackErrors && h.licenseManager.HasFeature(licensing.FeatureErrorTracking),
	)

	w.Write([]byte(config))
	w.Write(script)
}

// Ingest receives tracking events
func (h *Handlers) Ingest(w http.ResponseWriter, r *http.Request) {
	// Note: We don't check DNT since this is a privacy-first analytics solution
	// that is GDPR compliant by design (no cookies, no PII stored).

	// Parse events (NDJSON format - one event per line)
	body, err := io.ReadAll(io.LimitReader(r.Body, 1<<20)) // 1MB limit
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}

	// Get Origin/Referer for domain validation
	origin := r.Header.Get("Origin")
	if origin == "" {
		origin = r.Header.Get("Referer")
	}
	var requestHost string
	if origin != "" {
		if parsedOrigin, err := url.Parse(origin); err == nil {
			requestHost = parsedOrigin.Host
		}
	}

	// Get client info for enrichment
	clientIP := enrichment.ExtractClientIP(r.RemoteAddr, map[string]string{
		"X-Forwarded-For": r.Header.Get("X-Forwarded-For"),
		"X-Real-IP":       r.Header.Get("X-Real-IP"),
	})
	userAgent := r.Header.Get("User-Agent")

	// Collect headers for bot detection
	headers := map[string]string{
		"Accept-Language": r.Header.Get("Accept-Language"),
		"Accept-Encoding": r.Header.Get("Accept-Encoding"),
		"Accept":          r.Header.Get("Accept"),
	}

	// Enrich with geo, device, bot detection
	enriched := h.enricher.EnrichWithHeaders(clientIP, userAgent, "", headers)

	// Generate IP hash for tracking (privacy-preserving)
	ipHash := hashIP(clientIP)

	// Generate server-side session ID
	sessionID := h.idGen.GenerateSessionID(clientIP, userAgent)

	// Parse each line as a separate event
	var events []*database.Event
	var perfs []*database.Performance
	var errs []*database.Error

	scanner := bufio.NewScanner(strings.NewReader(string(body)))
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		var raw map[string]interface{}
		if err := json.Unmarshal([]byte(line), &raw); err != nil {
			continue
		}

		// Validate site_id and domain match
		siteID, _ := raw["site_id"].(string)
		if siteID == "" {
			// No site_id provided - reject unless we have no domains registered (backwards compat)
			var domainCount int
			h.db.Conn().QueryRow("SELECT COUNT(*) FROM domains").Scan(&domainCount)
			if domainCount > 0 {
				continue // Skip events without site_id when domains are configured
			}
		} else {
			// Validate site_id exists and matches the request origin
			var registeredDomain string
			err := h.db.Conn().QueryRow("SELECT domain FROM domains WHERE site_id = ? AND is_active = 1", siteID).Scan(&registeredDomain)
			if err != nil {
				continue // Invalid or inactive site_id
			}

			// Verify the request origin matches the registered domain
			// Allow localhost for development
			if requestHost != "" && requestHost != registeredDomain {
				// Check if it's localhost/127.0.0.1 (development mode)
				if !strings.HasPrefix(requestHost, "localhost") && !strings.HasPrefix(requestHost, "127.0.0.1") {
					continue // Origin doesn't match registered domain
				}
			}
		}

		eventType, _ := raw["type"].(string)

		switch eventType {
		case "performance":
			if !h.licenseManager.HasFeature(licensing.FeaturePerformance) {
				continue
			}
			perf := h.parsePerformance(raw, sessionID, enriched)
			if perf != nil {
				perfs = append(perfs, perf)
			}

		case "error":
			if !h.licenseManager.HasFeature(licensing.FeatureErrorTracking) {
				continue
			}
			errEvent := h.parseError(raw, sessionID, enriched)
			if errEvent != nil {
				errs = append(errs, errEvent)
			}

		default:
			event := h.parseEvent(raw, sessionID, enriched, userAgent, ipHash)
			if event != nil {
				events = append(events, event)
			}
		}
	}

	// Batch insert
	if err := h.db.InsertBatch(events, perfs, errs); err != nil {
		http.Error(w, "Failed to save events", http.StatusInternalServerError)
		return
	}

	// Notify SSE clients
	h.notifyClients(events, perfs, errs)

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) parseEvent(raw map[string]interface{}, sessionID string, enriched *enrichment.EnrichmentResult, userAgent string, ipHash string) *database.Event {
	urlStr, _ := raw["url"].(string)
	parsedURL, _ := url.Parse(urlStr)

	visitorHash, _ := raw["visitor_hash"].(string)
	if !identification.ValidateClientFingerprint(visitorHash) {
		// Use server-generated fallback
		visitorHash = h.idGen.GenerateVisitorHash("", userAgent)
	}

	// Extract client-side bot signals if provided
	var clientSignals *bot.ClientSignals
	if botSignalsRaw, ok := raw["bot_signals"].(map[string]interface{}); ok {
		clientSignals = &bot.ClientSignals{
			Webdriver:    getBoolFromFloat(botSignalsRaw, "webdriver"),
			Phantom:      getBoolFromFloat(botSignalsRaw, "phantom"),
			Selenium:     getBoolFromFloat(botSignalsRaw, "selenium"),
			Headless:     getBoolFromFloat(botSignalsRaw, "headless"),
			ScreenValid:  getBoolFromFloat(botSignalsRaw, "screen_valid"),
			Plugins:      int(getFloatOr(botSignalsRaw, "plugins", 0)),
			Languages:    int(getFloatOr(botSignalsRaw, "languages", 0)),
			ScreenWidth:  int(getFloatOr(botSignalsRaw, "screen_width", 0)),
			ScreenHeight: int(getFloatOr(botSignalsRaw, "screen_height", 0)),
		}
	}

	// Recalculate bot score with client signals
	botResult := enriched.BotScore
	botCategory := enriched.BotCategory
	botSignals := enriched.BotSignals

	if clientSignals != nil {
		// Merge server and client bot detection
		result := bot.CalculateScore(userAgent, clientSignals, enriched.DatacenterIP, nil)
		botResult = result.Score
		botCategory = result.Category
		botSignals = bot.SignalsToJSON(result.Signals)
	}

	// Set geo coordinates if available
	var geoLat, geoLon *float64
	if enriched.GeoLatitude != 0 {
		geoLat = &enriched.GeoLatitude
	}
	if enriched.GeoLongitude != 0 {
		geoLon = &enriched.GeoLongitude
	}

	event := &database.Event{
		ID:           generateID(),
		Timestamp:    time.Now(),
		EventType:    getStringOr(raw, "event_type", "pageview"),
		SessionID:    sessionID,
		VisitorHash:  visitorHash,
		Domain:       parsedURL.Host,
		URL:          urlStr,
		Path:         parsedURL.Path,
		GeoCountry:   &enriched.GeoCountry,
		GeoCity:      &enriched.GeoCity,
		GeoRegion:    &enriched.GeoRegion,
		GeoLatitude:  geoLat,
		GeoLongitude: geoLon,
		BrowserName:  &enriched.BrowserName,
		OSName:       &enriched.OSName,
		DeviceType:   &enriched.DeviceType,
		IsBot:        botResult > 50,

		// Bot detection fields
		BotScore:     botResult,
		BotCategory:  botCategory,
		BotSignals:   botSignals,
		DatacenterIP: enriched.DatacenterIP,
		IPHash:       &ipHash,
	}

	// Extract behavioral flags from client
	event.HasScroll = getBoolFromFloat(raw, "has_scroll")
	event.HasMouseMove = getBoolFromFloat(raw, "has_mouse_move")
	event.HasClick = getBoolFromFloat(raw, "has_click")
	event.HasTouch = getBoolFromFloat(raw, "has_touch")

	// Extract click coordinates
	if clickX, ok := raw["click_x"].(float64); ok {
		x := int(clickX)
		event.ClickX = &x
	}
	if clickY, ok := raw["click_y"].(float64); ok {
		y := int(clickY)
		event.ClickY = &y
	}

	// Extract page duration
	if duration, ok := raw["page_duration"].(float64); ok {
		d := int(duration)
		event.PageDuration = &d
	}

	if title, ok := raw["page_title"].(string); ok {
		event.PageTitle = &title
	}
	if name, ok := raw["event_name"].(string); ok {
		event.EventName = &name
	}
	if ref, ok := raw["referrer_url"].(string); ok {
		event.ReferrerURL = &ref
		refType := enriched.ReferrerType
		event.ReferrerType = &refType
	}
	if utm, ok := raw["utm_source"].(string); ok {
		event.UTMSource = &utm
	}
	if utm, ok := raw["utm_medium"].(string); ok {
		event.UTMMedium = &utm
	}
	if utm, ok := raw["utm_campaign"].(string); ok {
		event.UTMCampaign = &utm
	}
	// Handle props - tracker sends as JSON string, but could also be a map
	if propsStr, ok := raw["props"].(string); ok && propsStr != "" {
		event.Props = json.RawMessage(propsStr)
	} else if propsMap, ok := raw["props"].(map[string]interface{}); ok {
		propsJSON, _ := json.Marshal(propsMap)
		event.Props = propsJSON
	}

	return event
}

func (h *Handlers) parsePerformance(raw map[string]interface{}, sessionID string, enriched *enrichment.EnrichmentResult) *database.Performance {
	urlStr, _ := raw["url"].(string)
	parsedURL, _ := url.Parse(urlStr)

	perf := &database.Performance{
		ID:          generateID(),
		Timestamp:   time.Now(),
		SessionID:   sessionID,
		VisitorHash: getStringOr(raw, "visitor_hash", ""),
		Domain:      parsedURL.Host,
		URL:         urlStr,
		Path:        parsedURL.Path,
		DeviceType:  &enriched.DeviceType,
		GeoCountry:  &enriched.GeoCountry,
	}

	if v, ok := raw["lcp"].(float64); ok {
		perf.LCP = &v
	}
	if v, ok := raw["cls"].(float64); ok {
		perf.CLS = &v
	}
	if v, ok := raw["fcp"].(float64); ok {
		perf.FCP = &v
	}
	if v, ok := raw["ttfb"].(float64); ok {
		perf.TTFB = &v
	}
	if v, ok := raw["inp"].(float64); ok {
		perf.INP = &v
	}
	if v, ok := raw["page_load_time"].(float64); ok {
		perf.PageLoadTime = &v
	}
	if v, ok := raw["connection_type"].(string); ok {
		perf.ConnectionType = &v
	}

	return perf
}

func (h *Handlers) parseError(raw map[string]interface{}, sessionID string, enriched *enrichment.EnrichmentResult) *database.Error {
	urlStr, _ := raw["url"].(string)
	parsedURL, _ := url.Parse(urlStr)

	errorType := getStringOr(raw, "error_type", "javascript")
	errorMessage := getStringOr(raw, "message", "Unknown error")
	scriptURL := getStringOr(raw, "script_url", "")
	lineNumber := int(getFloatOr(raw, "line_number", 0))

	errEvent := &database.Error{
		ID:           generateID(),
		Timestamp:    time.Now(),
		SessionID:    sessionID,
		VisitorHash:  getStringOr(raw, "visitor_hash", ""),
		Domain:       parsedURL.Host,
		URL:          urlStr,
		Path:         parsedURL.Path,
		ErrorType:    errorType,
		ErrorMessage: errorMessage,
		ErrorHash:    enrichment.HashError(errorType, errorMessage, scriptURL, lineNumber),
		BrowserName:  &enriched.BrowserName,
		GeoCountry:   &enriched.GeoCountry,
	}

	if v, ok := raw["stack"].(string); ok {
		errEvent.ErrorStack = &v
	}
	if scriptURL != "" {
		errEvent.ScriptURL = &scriptURL
	}
	if lineNumber > 0 {
		errEvent.LineNumber = &lineNumber
	}
	if v, ok := raw["column_number"].(float64); ok {
		col := int(v)
		errEvent.ColumnNumber = &col
	}

	return errEvent
}

// License handlers
func (h *Handlers) GetLicense(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(h.licenseManager.GetInfo())
}

func (h *Handlers) UploadLicense(w http.ResponseWriter, r *http.Request) {
	body, err := io.ReadAll(r.Body)
	if err != nil {
		http.Error(w, "Failed to read body", http.StatusBadRequest)
		return
	}

	if err := h.licenseManager.SaveLicense(body); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(h.licenseManager.GetInfo())
}

func (h *Handlers) RemoveLicense(w http.ResponseWriter, r *http.Request) {
	if err := h.licenseManager.RemoveLicense(); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(h.licenseManager.GetInfo())
}

// Settings handlers
func (h *Handlers) GetSettings(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Conn().Query("SELECT key, value FROM settings")
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	settings := make(map[string]string)
	for rows.Next() {
		var key, value string
		rows.Scan(&key, &value)
		settings[key] = value
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(settings)
}

func (h *Handlers) UpdateSettings(w http.ResponseWriter, r *http.Request) {
	var settings map[string]string
	if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	tx, _ := h.db.Conn().Begin()
	for key, value := range settings {
		tx.Exec("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, ?)",
			key, value, time.Now().UnixMilli())
	}
	tx.Commit()

	w.WriteHeader(http.StatusNoContent)
}

// Database access for DuckDB WASM
func (h *Handlers) ServeDatabase(w http.ResponseWriter, r *http.Request) {
	dbPath := h.cfg.DataDir + "/yaat.db"

	// Check if client wants partial content (Range request)
	rangeHeader := r.Header.Get("Range")
	if rangeHeader != "" {
		// Let http.ServeFile handle Range requests
		w.Header().Set("Accept-Ranges", "bytes")
	}

	w.Header().Set("Content-Type", "application/x-sqlite3")
	w.Header().Set("Cache-Control", "no-cache")

	http.ServeFile(w, r, dbPath)
}

func (h *Handlers) GetDatabaseInfo(w http.ResponseWriter, r *http.Request) {
	dbPath := h.cfg.DataDir + "/yaat.db"
	info, err := os.Stat(dbPath)
	if err != nil {
		http.Error(w, "Database not found", http.StatusNotFound)
		return
	}

	eventCount, _ := h.db.GetEventCount()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"size_bytes":   info.Size(),
		"modified_at":  info.ModTime(),
		"event_count":  eventCount,
		"supports_wal": true,
	})
}

// SSE for real-time events
func (h *Handlers) EventStream(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "SSE not supported", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	// Create client channel
	client := make(chan []byte, 100)

	h.sseMu.Lock()
	if h.sseClients == nil {
		h.sseClients = make(map[chan []byte]bool)
	}
	h.sseClients[client] = true
	h.sseMu.Unlock()

	defer func() {
		h.sseMu.Lock()
		delete(h.sseClients, client)
		h.sseMu.Unlock()
		close(client)
	}()

	// Send initial connection message
	fmt.Fprintf(w, "data: {\"type\":\"connected\"}\n\n")
	flusher.Flush()

	// Listen for events
	for {
		select {
		case msg := <-client:
			fmt.Fprintf(w, "data: %s\n\n", msg)
			flusher.Flush()
		case <-r.Context().Done():
			return
		}
	}
}

func (h *Handlers) notifyClients(events []*database.Event, perfs []*database.Performance, errs []*database.Error) {
	h.sseMu.RLock()
	defer h.sseMu.RUnlock()

	if len(h.sseClients) == 0 {
		return
	}

	// Build notification
	notification := map[string]interface{}{
		"type":        "batch",
		"events":      len(events),
		"performance": len(perfs),
		"errors":      len(errs),
		"timestamp":   time.Now().UnixMilli(),
	}

	// Add last event details
	if len(events) > 0 {
		last := events[len(events)-1]
		notification["last_event"] = map[string]interface{}{
			"type":    last.EventType,
			"path":    last.Path,
			"country": last.GeoCountry,
		}
	}

	data, _ := json.Marshal(notification)

	for client := range h.sseClients {
		select {
		case client <- data:
		default:
			// Client buffer full, skip
		}
	}
}

// Stats summary (works without DuckDB)
func (h *Handlers) GetStatsSummary(w http.ResponseWriter, r *http.Request) {
	now := time.Now()
	today := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).UnixMilli()
	last24h := now.Add(-24 * time.Hour).UnixMilli()
	last7d := now.Add(-7 * 24 * time.Hour).UnixMilli()

	var todayCount, last24hCount, last7dCount, totalCount int64
	var uniqueVisitors, uniqueSessions int64

	h.db.Conn().QueryRow("SELECT COUNT(*) FROM events WHERE timestamp >= ?", today).Scan(&todayCount)
	h.db.Conn().QueryRow("SELECT COUNT(*) FROM events WHERE timestamp >= ?", last24h).Scan(&last24hCount)
	h.db.Conn().QueryRow("SELECT COUNT(*) FROM events WHERE timestamp >= ?", last7d).Scan(&last7dCount)
	h.db.Conn().QueryRow("SELECT COUNT(*) FROM events").Scan(&totalCount)
	h.db.Conn().QueryRow("SELECT COUNT(DISTINCT visitor_hash) FROM events WHERE timestamp >= ?", last7d).Scan(&uniqueVisitors)
	h.db.Conn().QueryRow("SELECT COUNT(DISTINCT session_id) FROM events WHERE timestamp >= ?", last7d).Scan(&uniqueSessions)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"today":           todayCount,
		"last_24h":        last24hCount,
		"last_7d":         last7dCount,
		"total":           totalCount,
		"unique_visitors": uniqueVisitors,
		"unique_sessions": uniqueSessions,
	})
}

// GetStatsOverview returns main dashboard stats
func (h *Handlers) GetStatsOverview(w http.ResponseWriter, r *http.Request) {
	days := getDaysParam(r, 7)
	domain := getDomainParam(r)
	cutoff := time.Now().Add(-time.Duration(days) * 24 * time.Hour).UnixMilli()
	live := time.Now().Add(-5 * time.Minute).UnixMilli()

	var totalEvents, uniqueVisitors, sessions, pageviews, liveVisitors int64
	var bounceRate float64
	var avgDuration float64

	// Filter out bots (is_bot = 0)
	if domain != "" {
		h.db.Conn().QueryRow("SELECT COUNT(*) FROM events WHERE timestamp >= ? AND domain = ? AND is_bot = 0", cutoff, domain).Scan(&totalEvents)
		h.db.Conn().QueryRow("SELECT COUNT(DISTINCT visitor_hash) FROM events WHERE timestamp >= ? AND domain = ? AND is_bot = 0", cutoff, domain).Scan(&uniqueVisitors)
		h.db.Conn().QueryRow("SELECT COUNT(DISTINCT session_id) FROM events WHERE timestamp >= ? AND domain = ? AND is_bot = 0", cutoff, domain).Scan(&sessions)
		h.db.Conn().QueryRow("SELECT COUNT(*) FROM events WHERE timestamp >= ? AND event_type = 'pageview' AND domain = ? AND is_bot = 0", cutoff, domain).Scan(&pageviews)
		h.db.Conn().QueryRow("SELECT COUNT(DISTINCT session_id) FROM events WHERE timestamp >= ? AND domain = ? AND is_bot = 0", live, domain).Scan(&liveVisitors)

		// Bounce rate: sessions with only 1 pageview / total sessions
		h.db.Conn().QueryRow(`
			SELECT COALESCE(
				CAST(SUM(CASE WHEN pv_count = 1 THEN 1 ELSE 0 END) AS FLOAT) / NULLIF(COUNT(*), 0) * 100,
				0
			) FROM (
				SELECT session_id, COUNT(*) as pv_count
				FROM events
				WHERE timestamp >= ? AND event_type = 'pageview' AND domain = ? AND is_bot = 0
				GROUP BY session_id
			)
		`, cutoff, domain).Scan(&bounceRate)

		// Average session duration from engagement events
		h.db.Conn().QueryRow(`
			SELECT COALESCE(AVG(
				CAST(json_extract(props, '$.visible_time_ms') AS INTEGER)
			), 0) / 1000.0
			FROM events
			WHERE timestamp >= ? AND event_type = 'engagement' AND domain = ? AND is_bot = 0
		`, cutoff, domain).Scan(&avgDuration)
	} else {
		h.db.Conn().QueryRow("SELECT COUNT(*) FROM events WHERE timestamp >= ? AND is_bot = 0", cutoff).Scan(&totalEvents)
		h.db.Conn().QueryRow("SELECT COUNT(DISTINCT visitor_hash) FROM events WHERE timestamp >= ? AND is_bot = 0", cutoff).Scan(&uniqueVisitors)
		h.db.Conn().QueryRow("SELECT COUNT(DISTINCT session_id) FROM events WHERE timestamp >= ? AND is_bot = 0", cutoff).Scan(&sessions)
		h.db.Conn().QueryRow("SELECT COUNT(*) FROM events WHERE timestamp >= ? AND event_type = 'pageview' AND is_bot = 0", cutoff).Scan(&pageviews)
		h.db.Conn().QueryRow("SELECT COUNT(DISTINCT session_id) FROM events WHERE timestamp >= ? AND is_bot = 0", live).Scan(&liveVisitors)

		h.db.Conn().QueryRow(`
			SELECT COALESCE(
				CAST(SUM(CASE WHEN pv_count = 1 THEN 1 ELSE 0 END) AS FLOAT) / NULLIF(COUNT(*), 0) * 100,
				0
			) FROM (
				SELECT session_id, COUNT(*) as pv_count
				FROM events
				WHERE timestamp >= ? AND event_type = 'pageview' AND is_bot = 0
				GROUP BY session_id
			)
		`, cutoff).Scan(&bounceRate)

		h.db.Conn().QueryRow(`
			SELECT COALESCE(AVG(
				CAST(json_extract(props, '$.visible_time_ms') AS INTEGER)
			), 0) / 1000.0
			FROM events
			WHERE timestamp >= ? AND event_type = 'engagement' AND is_bot = 0
		`, cutoff).Scan(&avgDuration)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"total_events":        totalEvents,
		"unique_visitors":     uniqueVisitors,
		"sessions":            sessions,
		"pageviews":           pageviews,
		"live_visitors":       liveVisitors,
		"bounce_rate":         bounceRate,
		"avg_session_seconds": avgDuration,
	})
}

// GetStatsTimeseries returns traffic over time
func (h *Handlers) GetStatsTimeseries(w http.ResponseWriter, r *http.Request) {
	days := getDaysParam(r, 7)
	domain := getDomainParam(r)
	cutoff := time.Now().Add(-time.Duration(days) * 24 * time.Hour).UnixMilli()

	// Use daily granularity - filter out bots
	var rows *sql.Rows
	var err error
	if domain != "" {
		rows, err = h.db.Conn().Query(`
			SELECT
				date(timestamp / 1000, 'unixepoch') as period,
				COUNT(*) as pageviews,
				COUNT(DISTINCT visitor_hash) as visitors
			FROM events
			WHERE timestamp >= ? AND event_type = 'pageview' AND domain = ? AND is_bot = 0
			GROUP BY period
			ORDER BY period
		`, cutoff, domain)
	} else {
		rows, err = h.db.Conn().Query(`
			SELECT
				date(timestamp / 1000, 'unixepoch') as period,
				COUNT(*) as pageviews,
				COUNT(DISTINCT visitor_hash) as visitors
			FROM events
			WHERE timestamp >= ? AND event_type = 'pageview' AND is_bot = 0
			GROUP BY period
			ORDER BY period
		`, cutoff)
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := make([]map[string]interface{}, 0)
	for rows.Next() {
		var period string
		var pageviews, visitors int64
		rows.Scan(&period, &pageviews, &visitors)
		result = append(result, map[string]interface{}{
			"period":    period,
			"pageviews": pageviews,
			"visitors":  visitors,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// GetStatsPages returns top pages
func (h *Handlers) GetStatsPages(w http.ResponseWriter, r *http.Request) {
	days := getDaysParam(r, 7)
	domain := getDomainParam(r)
	cutoff := time.Now().Add(-time.Duration(days) * 24 * time.Hour).UnixMilli()

	var rows *sql.Rows
	var err error
	if domain != "" {
		rows, err = h.db.Conn().Query(`
			SELECT path, COUNT(*) as views, COUNT(DISTINCT visitor_hash) as visitors
			FROM events
			WHERE timestamp >= ? AND event_type = 'pageview' AND domain = ? AND is_bot = 0
			GROUP BY path
			ORDER BY views DESC
			LIMIT 10
		`, cutoff, domain)
	} else {
		rows, err = h.db.Conn().Query(`
			SELECT path, COUNT(*) as views, COUNT(DISTINCT visitor_hash) as visitors
			FROM events
			WHERE timestamp >= ? AND event_type = 'pageview' AND is_bot = 0
			GROUP BY path
			ORDER BY views DESC
			LIMIT 10
		`, cutoff)
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := make([]map[string]interface{}, 0)
	for rows.Next() {
		var path string
		var views, visitors int64
		rows.Scan(&path, &views, &visitors)
		result = append(result, map[string]interface{}{
			"path":     path,
			"views":    views,
			"visitors": visitors,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// GetStatsReferrers returns traffic sources
func (h *Handlers) GetStatsReferrers(w http.ResponseWriter, r *http.Request) {
	days := getDaysParam(r, 7)
	domain := getDomainParam(r)
	cutoff := time.Now().Add(-time.Duration(days) * 24 * time.Hour).UnixMilli()

	var rows *sql.Rows
	var err error
	if domain != "" {
		rows, err = h.db.Conn().Query(`
			SELECT COALESCE(referrer_type, 'direct') as source, COUNT(*) as visits, COUNT(DISTINCT visitor_hash) as visitors
			FROM events
			WHERE timestamp >= ? AND event_type = 'pageview' AND domain = ? AND is_bot = 0
			GROUP BY referrer_type
			ORDER BY visits DESC
		`, cutoff, domain)
	} else {
		rows, err = h.db.Conn().Query(`
			SELECT COALESCE(referrer_type, 'direct') as source, COUNT(*) as visits, COUNT(DISTINCT visitor_hash) as visitors
			FROM events
			WHERE timestamp >= ? AND event_type = 'pageview' AND is_bot = 0
			GROUP BY referrer_type
			ORDER BY visits DESC
		`, cutoff)
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := make([]map[string]interface{}, 0)
	for rows.Next() {
		var source string
		var visits, visitors int64
		rows.Scan(&source, &visits, &visitors)
		result = append(result, map[string]interface{}{
			"source":   source,
			"visits":   visits,
			"visitors": visitors,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// GetStatsGeo returns geographic distribution
func (h *Handlers) GetStatsGeo(w http.ResponseWriter, r *http.Request) {
	days := getDaysParam(r, 7)
	domain := getDomainParam(r)
	cutoff := time.Now().Add(-time.Duration(days) * 24 * time.Hour).UnixMilli()

	var rows *sql.Rows
	var err error
	if domain != "" {
		rows, err = h.db.Conn().Query(`
			SELECT COALESCE(geo_country, 'Unknown') as country, COUNT(DISTINCT visitor_hash) as visitors
			FROM events
			WHERE timestamp >= ? AND domain = ? AND is_bot = 0
			GROUP BY geo_country
			ORDER BY visitors DESC
			LIMIT 20
		`, cutoff, domain)
	} else {
		rows, err = h.db.Conn().Query(`
			SELECT COALESCE(geo_country, 'Unknown') as country, COUNT(DISTINCT visitor_hash) as visitors
			FROM events
			WHERE timestamp >= ? AND is_bot = 0
			GROUP BY geo_country
			ORDER BY visitors DESC
			LIMIT 20
		`, cutoff)
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := make([]map[string]interface{}, 0)
	for rows.Next() {
		var country string
		var visitors int64
		rows.Scan(&country, &visitors)
		result = append(result, map[string]interface{}{
			"country":  country,
			"visitors": visitors,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// GetStatsDevices returns device breakdown
func (h *Handlers) GetStatsDevices(w http.ResponseWriter, r *http.Request) {
	days := getDaysParam(r, 7)
	domain := getDomainParam(r)
	cutoff := time.Now().Add(-time.Duration(days) * 24 * time.Hour).UnixMilli()

	var rows *sql.Rows
	var err error
	if domain != "" {
		rows, err = h.db.Conn().Query(`
			SELECT COALESCE(device_type, 'Unknown') as device, COUNT(DISTINCT visitor_hash) as visitors
			FROM events
			WHERE timestamp >= ? AND domain = ? AND is_bot = 0
			GROUP BY device_type
			ORDER BY visitors DESC
		`, cutoff, domain)
	} else {
		rows, err = h.db.Conn().Query(`
			SELECT COALESCE(device_type, 'Unknown') as device, COUNT(DISTINCT visitor_hash) as visitors
			FROM events
			WHERE timestamp >= ? AND is_bot = 0
			GROUP BY device_type
			ORDER BY visitors DESC
		`, cutoff)
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := make([]map[string]interface{}, 0)
	for rows.Next() {
		var device string
		var visitors int64
		rows.Scan(&device, &visitors)
		result = append(result, map[string]interface{}{
			"device":   device,
			"visitors": visitors,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// GetStatsBrowsers returns browser breakdown
func (h *Handlers) GetStatsBrowsers(w http.ResponseWriter, r *http.Request) {
	days := getDaysParam(r, 7)
	domain := getDomainParam(r)
	cutoff := time.Now().Add(-time.Duration(days) * 24 * time.Hour).UnixMilli()

	var rows *sql.Rows
	var err error
	if domain != "" {
		rows, err = h.db.Conn().Query(`
			SELECT COALESCE(browser_name, 'Unknown') as browser, COUNT(DISTINCT visitor_hash) as visitors
			FROM events
			WHERE timestamp >= ? AND domain = ? AND is_bot = 0
			GROUP BY browser_name
			ORDER BY visitors DESC
			LIMIT 10
		`, cutoff, domain)
	} else {
		rows, err = h.db.Conn().Query(`
			SELECT COALESCE(browser_name, 'Unknown') as browser, COUNT(DISTINCT visitor_hash) as visitors
			FROM events
			WHERE timestamp >= ? AND is_bot = 0
			GROUP BY browser_name
			ORDER BY visitors DESC
			LIMIT 10
		`, cutoff)
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := make([]map[string]interface{}, 0)
	for rows.Next() {
		var browser string
		var visitors int64
		rows.Scan(&browser, &visitors)
		result = append(result, map[string]interface{}{
			"browser":  browser,
			"visitors": visitors,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// GetStatsCampaigns returns UTM campaign breakdown
func (h *Handlers) GetStatsCampaigns(w http.ResponseWriter, r *http.Request) {
	days := getDaysParam(r, 7)
	domain := getDomainParam(r)
	cutoff := time.Now().Add(-time.Duration(days) * 24 * time.Hour).UnixMilli()

	var rows *sql.Rows
	var err error
	if domain != "" {
		rows, err = h.db.Conn().Query(`
			SELECT
				COALESCE(utm_source, '(direct)') as source,
				COALESCE(utm_medium, '(none)') as medium,
				COALESCE(utm_campaign, '(none)') as campaign,
				COUNT(*) as visits,
				COUNT(DISTINCT visitor_hash) as visitors
			FROM events
			WHERE timestamp >= ? AND event_type = 'pageview' AND domain = ? AND is_bot = 0
			GROUP BY utm_source, utm_medium, utm_campaign
			ORDER BY visits DESC
			LIMIT 20
		`, cutoff, domain)
	} else {
		rows, err = h.db.Conn().Query(`
			SELECT
				COALESCE(utm_source, '(direct)') as source,
				COALESCE(utm_medium, '(none)') as medium,
				COALESCE(utm_campaign, '(none)') as campaign,
				COUNT(*) as visits,
				COUNT(DISTINCT visitor_hash) as visitors
			FROM events
			WHERE timestamp >= ? AND event_type = 'pageview' AND is_bot = 0
			GROUP BY utm_source, utm_medium, utm_campaign
			ORDER BY visits DESC
			LIMIT 20
		`, cutoff)
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := make([]map[string]interface{}, 0)
	for rows.Next() {
		var source, medium, campaign string
		var visits, visitors int64
		rows.Scan(&source, &medium, &campaign, &visits, &visitors)
		result = append(result, map[string]interface{}{
			"utm_source":   source,
			"utm_medium":   medium,
			"utm_campaign": campaign,
			"sessions":     visits,
			"visitors":     visitors,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// GetStatsCustomEvents returns custom event breakdown
func (h *Handlers) GetStatsCustomEvents(w http.ResponseWriter, r *http.Request) {
	days := getDaysParam(r, 7)
	domain := getDomainParam(r)
	cutoff := time.Now().Add(-time.Duration(days) * 24 * time.Hour).UnixMilli()

	var rows *sql.Rows
	var err error
	if domain != "" {
		rows, err = h.db.Conn().Query(`
			SELECT
				event_name,
				COUNT(*) as count,
				COUNT(DISTINCT visitor_hash) as visitors
			FROM events
			WHERE timestamp >= ? AND event_type = 'custom' AND domain = ? AND is_bot = 0
			GROUP BY event_name
			ORDER BY count DESC
			LIMIT 20
		`, cutoff, domain)
	} else {
		rows, err = h.db.Conn().Query(`
			SELECT
				event_name,
				COUNT(*) as count,
				COUNT(DISTINCT visitor_hash) as visitors
			FROM events
			WHERE timestamp >= ? AND event_type = 'custom' AND is_bot = 0
			GROUP BY event_name
			ORDER BY count DESC
			LIMIT 20
		`, cutoff)
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := make([]map[string]interface{}, 0)
	for rows.Next() {
		var name *string
		var count, visitors int64
		rows.Scan(&name, &count, &visitors)
		eventName := "(unnamed)"
		if name != nil {
			eventName = *name
		}
		result = append(result, map[string]interface{}{
			"event_name":      eventName,
			"count":           count,
			"unique_visitors": visitors,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// GetStatsOutbound returns outbound link clicks
func (h *Handlers) GetStatsOutbound(w http.ResponseWriter, r *http.Request) {
	days := getDaysParam(r, 7)
	domain := getDomainParam(r)
	cutoff := time.Now().Add(-time.Duration(days) * 24 * time.Hour).UnixMilli()

	var rows *sql.Rows
	var err error
	if domain != "" {
		rows, err = h.db.Conn().Query(`
			SELECT
				json_extract(props, '$.target') as target,
				COUNT(*) as clicks,
				COUNT(DISTINCT visitor_hash) as visitors
			FROM events
			WHERE timestamp >= ? AND event_type = 'click' AND event_name = 'outbound' AND domain = ? AND is_bot = 0
			GROUP BY target
			ORDER BY clicks DESC
			LIMIT 20
		`, cutoff, domain)
	} else {
		rows, err = h.db.Conn().Query(`
			SELECT
				json_extract(props, '$.target') as target,
				COUNT(*) as clicks,
				COUNT(DISTINCT visitor_hash) as visitors
			FROM events
			WHERE timestamp >= ? AND event_type = 'click' AND event_name = 'outbound' AND is_bot = 0
			GROUP BY target
			ORDER BY clicks DESC
			LIMIT 20
		`, cutoff)
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := make([]map[string]interface{}, 0)
	for rows.Next() {
		var target *string
		var clicks, visitors int64
		rows.Scan(&target, &clicks, &visitors)
		targetURL := "(unknown)"
		if target != nil {
			targetURL = *target
		}
		result = append(result, map[string]interface{}{
			"url":             targetURL,
			"clicks":          clicks,
			"unique_visitors": visitors,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// GetStatsVitals returns web vitals (Pro feature)
func (h *Handlers) GetStatsVitals(w http.ResponseWriter, r *http.Request) {
	days := getDaysParam(r, 7)
	domain := getDomainParam(r)
	cutoff := time.Now().Add(-time.Duration(days) * 24 * time.Hour).UnixMilli()

	var lcp, cls, fcp, ttfb, inp float64
	var samples int64

	if domain != "" {
		h.db.Conn().QueryRow(`
			SELECT
				COALESCE(AVG(lcp), 0),
				COALESCE(AVG(cls), 0),
				COALESCE(AVG(fcp), 0),
				COALESCE(AVG(ttfb), 0),
				COALESCE(AVG(inp), 0),
				COUNT(*)
			FROM performance
			WHERE timestamp >= ? AND domain = ?
		`, cutoff, domain).Scan(&lcp, &cls, &fcp, &ttfb, &inp, &samples)
	} else {
		h.db.Conn().QueryRow(`
			SELECT
				COALESCE(AVG(lcp), 0),
				COALESCE(AVG(cls), 0),
				COALESCE(AVG(fcp), 0),
				COALESCE(AVG(ttfb), 0),
				COALESCE(AVG(inp), 0),
				COUNT(*)
			FROM performance
			WHERE timestamp >= ?
		`, cutoff).Scan(&lcp, &cls, &fcp, &ttfb, &inp, &samples)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"lcp":     lcp,
		"cls":     cls,
		"fcp":     fcp,
		"ttfb":    ttfb,
		"inp":     inp,
		"samples": samples,
	})
}

// GetStatsErrors returns error summary (Pro feature)
func (h *Handlers) GetStatsErrors(w http.ResponseWriter, r *http.Request) {
	days := getDaysParam(r, 7)
	domain := getDomainParam(r)
	cutoff := time.Now().Add(-time.Duration(days) * 24 * time.Hour).UnixMilli()

	var rows *sql.Rows
	var err error
	if domain != "" {
		rows, err = h.db.Conn().Query(`
			SELECT error_hash, error_type, error_message, COUNT(*) as occurrences, COUNT(DISTINCT session_id) as affected_sessions
			FROM errors
			WHERE timestamp >= ? AND domain = ?
			GROUP BY error_hash, error_type, error_message
			ORDER BY occurrences DESC
			LIMIT 10
		`, cutoff, domain)
	} else {
		rows, err = h.db.Conn().Query(`
			SELECT error_hash, error_type, error_message, COUNT(*) as occurrences, COUNT(DISTINCT session_id) as affected_sessions
			FROM errors
			WHERE timestamp >= ?
			GROUP BY error_hash, error_type, error_message
			ORDER BY occurrences DESC
			LIMIT 10
		`, cutoff)
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	result := make([]map[string]interface{}, 0)
	for rows.Next() {
		var hash, errType, message string
		var occurrences, affected int64
		rows.Scan(&hash, &errType, &message, &occurrences, &affected)
		result = append(result, map[string]interface{}{
			"error_hash":        hash,
			"error_type":        errType,
			"error_message":     message,
			"occurrences":       occurrences,
			"affected_sessions": affected,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(result)
}

// GetStatsBots returns bot traffic breakdown
func (h *Handlers) GetStatsBots(w http.ResponseWriter, r *http.Request) {
	days := getDaysParam(r, 7)
	domain := getDomainParam(r)
	cutoff := time.Now().Add(-time.Duration(days) * 24 * time.Hour).UnixMilli()

	// Category distribution
	var categoryRows *sql.Rows
	var err error
	if domain != "" {
		categoryRows, err = h.db.Conn().Query(`
			SELECT bot_category, COUNT(*) as count, COUNT(DISTINCT visitor_hash) as visitors
			FROM events
			WHERE timestamp >= ? AND domain = ?
			GROUP BY bot_category
		`, cutoff, domain)
	} else {
		categoryRows, err = h.db.Conn().Query(`
			SELECT bot_category, COUNT(*) as count, COUNT(DISTINCT visitor_hash) as visitors
			FROM events
			WHERE timestamp >= ?
			GROUP BY bot_category
		`, cutoff)
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	categories := make([]map[string]interface{}, 0)
	for categoryRows.Next() {
		var category string
		var count, visitors int64
		categoryRows.Scan(&category, &count, &visitors)
		categories = append(categories, map[string]interface{}{
			"category": category,
			"events":   count,
			"visitors": visitors,
		})
	}
	categoryRows.Close()

	// Score distribution (histogram)
	var scoreRows *sql.Rows
	if domain != "" {
		scoreRows, err = h.db.Conn().Query(`
			SELECT
				CASE
					WHEN bot_score <= 10 THEN '0-10'
					WHEN bot_score <= 20 THEN '11-20'
					WHEN bot_score <= 30 THEN '21-30'
					WHEN bot_score <= 40 THEN '31-40'
					WHEN bot_score <= 50 THEN '41-50'
					WHEN bot_score <= 60 THEN '51-60'
					WHEN bot_score <= 70 THEN '61-70'
					WHEN bot_score <= 80 THEN '71-80'
					WHEN bot_score <= 90 THEN '81-90'
					ELSE '91-100'
				END as score_range,
				COUNT(*) as count
			FROM events
			WHERE timestamp >= ? AND domain = ?
			GROUP BY score_range
			ORDER BY score_range
		`, cutoff, domain)
	} else {
		scoreRows, err = h.db.Conn().Query(`
			SELECT
				CASE
					WHEN bot_score <= 10 THEN '0-10'
					WHEN bot_score <= 20 THEN '11-20'
					WHEN bot_score <= 30 THEN '21-30'
					WHEN bot_score <= 40 THEN '31-40'
					WHEN bot_score <= 50 THEN '41-50'
					WHEN bot_score <= 60 THEN '51-60'
					WHEN bot_score <= 70 THEN '61-70'
					WHEN bot_score <= 80 THEN '71-80'
					WHEN bot_score <= 90 THEN '81-90'
					ELSE '91-100'
				END as score_range,
				COUNT(*) as count
			FROM events
			WHERE timestamp >= ?
			GROUP BY score_range
			ORDER BY score_range
		`, cutoff)
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	scoreDistribution := make([]map[string]interface{}, 0)
	for scoreRows.Next() {
		var scoreRange string
		var count int64
		scoreRows.Scan(&scoreRange, &count)
		scoreDistribution = append(scoreDistribution, map[string]interface{}{
			"range": scoreRange,
			"count": count,
		})
	}
	scoreRows.Close()

	// Bot traffic over time
	var timeRows *sql.Rows
	if domain != "" {
		timeRows, err = h.db.Conn().Query(`
			SELECT
				date(timestamp / 1000, 'unixepoch') as period,
				SUM(CASE WHEN bot_category = 'human' THEN 1 ELSE 0 END) as humans,
				SUM(CASE WHEN bot_category = 'suspicious' THEN 1 ELSE 0 END) as suspicious,
				SUM(CASE WHEN bot_category = 'bad_bot' THEN 1 ELSE 0 END) as bad_bots,
				SUM(CASE WHEN bot_category = 'good_bot' THEN 1 ELSE 0 END) as good_bots
			FROM events
			WHERE timestamp >= ? AND domain = ?
			GROUP BY period
			ORDER BY period
		`, cutoff, domain)
	} else {
		timeRows, err = h.db.Conn().Query(`
			SELECT
				date(timestamp / 1000, 'unixepoch') as period,
				SUM(CASE WHEN bot_category = 'human' THEN 1 ELSE 0 END) as humans,
				SUM(CASE WHEN bot_category = 'suspicious' THEN 1 ELSE 0 END) as suspicious,
				SUM(CASE WHEN bot_category = 'bad_bot' THEN 1 ELSE 0 END) as bad_bots,
				SUM(CASE WHEN bot_category = 'good_bot' THEN 1 ELSE 0 END) as good_bots
			FROM events
			WHERE timestamp >= ?
			GROUP BY period
			ORDER BY period
		`, cutoff)
	}
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	timeseries := make([]map[string]interface{}, 0)
	for timeRows.Next() {
		var period string
		var humans, suspicious, badBots, goodBots int64
		timeRows.Scan(&period, &humans, &suspicious, &badBots, &goodBots)
		timeseries = append(timeseries, map[string]interface{}{
			"period":     period,
			"humans":     humans,
			"suspicious": suspicious,
			"bad_bots":   badBots,
			"good_bots":  goodBots,
		})
	}
	timeRows.Close()

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"categories":         categories,
		"score_distribution": scoreDistribution,
		"timeseries":         timeseries,
	})
}

func getDaysParam(r *http.Request, defaultVal int) int {
	if d := r.URL.Query().Get("days"); d != "" {
		if days, err := strconv.Atoi(d); err == nil && days > 0 && days <= 365 {
			return days
		}
	}
	return defaultVal
}

func getDomainParam(r *http.Request) string {
	return r.URL.Query().Get("domain")
}

// buildDomainFilter returns SQL condition and args for domain filtering
func buildDomainFilter(domain string, baseCondition string, baseArgs ...interface{}) (string, []interface{}) {
	if domain == "" {
		return baseCondition, baseArgs
	}
	return baseCondition + " AND domain = ?", append(baseArgs, domain)
}

// Performance summary (Pro feature)
func (h *Handlers) GetPerformanceSummary(w http.ResponseWriter, r *http.Request) {
	var avgLCP, avgCLS, avgFCP, avgTTFB, avgINP float64
	var count int64

	last7d := time.Now().Add(-7 * 24 * time.Hour).UnixMilli()

	h.db.Conn().QueryRow(`
		SELECT
			COALESCE(AVG(lcp), 0),
			COALESCE(AVG(cls), 0),
			COALESCE(AVG(fcp), 0),
			COALESCE(AVG(ttfb), 0),
			COALESCE(AVG(inp), 0),
			COUNT(*)
		FROM performance
		WHERE timestamp >= ?
	`, last7d).Scan(&avgLCP, &avgCLS, &avgFCP, &avgTTFB, &avgINP, &count)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"lcp":   avgLCP,
		"cls":   avgCLS,
		"fcp":   avgFCP,
		"ttfb":  avgTTFB,
		"inp":   avgINP,
		"count": count,
	})
}

// Errors summary (Pro feature)
func (h *Handlers) GetErrorsSummary(w http.ResponseWriter, r *http.Request) {
	last7d := time.Now().Add(-7 * 24 * time.Hour).UnixMilli()

	rows, _ := h.db.Conn().Query(`
		SELECT error_hash, error_type, error_message, COUNT(*) as count
		FROM errors
		WHERE timestamp >= ?
		GROUP BY error_hash
		ORDER BY count DESC
		LIMIT 10
	`, last7d)
	defer rows.Close()

	var errors []map[string]interface{}
	for rows.Next() {
		var hash, errType, message string
		var count int64
		rows.Scan(&hash, &errType, &message, &count)
		errors = append(errors, map[string]interface{}{
			"hash":    hash,
			"type":    errType,
			"message": message,
			"count":   count,
		})
	}

	var totalErrors int64
	h.db.Conn().QueryRow("SELECT COUNT(*) FROM errors WHERE timestamp >= ?", last7d).Scan(&totalErrors)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"total":      totalErrors,
		"top_errors": errors,
	})
}

// Export (Pro feature)
func (h *Handlers) ExportEvents(w http.ResponseWriter, r *http.Request) {
	// Get date range from query params
	from := r.URL.Query().Get("from")
	to := r.URL.Query().Get("to")

	query := "SELECT * FROM events"
	var args []interface{}

	if from != "" || to != "" {
		query += " WHERE 1=1"
		if from != "" {
			fromTime, _ := time.Parse(time.RFC3339, from)
			query += " AND timestamp >= ?"
			args = append(args, fromTime.UnixMilli())
		}
		if to != "" {
			toTime, _ := time.Parse(time.RFC3339, to)
			query += " AND timestamp <= ?"
			args = append(args, toTime.UnixMilli())
		}
	}

	query += " ORDER BY timestamp DESC LIMIT 100000"

	rows, err := h.db.Conn().Query(query, args...)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Content-Disposition", "attachment; filename=events.json")

	encoder := json.NewEncoder(w)
	w.Write([]byte("["))
	first := true

	cols, _ := rows.Columns()
	for rows.Next() {
		values := make([]interface{}, len(cols))
		valuePtrs := make([]interface{}, len(cols))
		for i := range values {
			valuePtrs[i] = &values[i]
		}

		rows.Scan(valuePtrs...)

		row := make(map[string]interface{})
		for i, col := range cols {
			row[col] = values[i]
		}

		if !first {
			w.Write([]byte(","))
		}
		first = false
		encoder.Encode(row)
	}

	w.Write([]byte("]"))
}

// User management (Enterprise)
func (h *Handlers) ListUsers(w http.ResponseWriter, r *http.Request) {
	rows, _ := h.db.Conn().Query("SELECT id, email, name, role, created_at FROM users ORDER BY created_at DESC")
	defer rows.Close()

	var users []map[string]interface{}
	for rows.Next() {
		var id, email, name, role string
		var createdAt int64
		rows.Scan(&id, &email, &name, &role, &createdAt)
		users = append(users, map[string]interface{}{
			"id":         id,
			"email":      email,
			"name":       name,
			"role":       role,
			"created_at": createdAt,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(users)
}

func (h *Handlers) CreateUser(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Name     string `json:"name"`
		Role     string `json:"role"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Validate email
	if input.Email == "" || !strings.Contains(input.Email, "@") {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid email address"})
		return
	}

	// Validate password
	if len(input.Password) < 8 {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Password must be at least 8 characters"})
		return
	}

	// Validate role
	if input.Role != "admin" && input.Role != "viewer" {
		input.Role = "viewer" // Default to viewer if invalid
	}

	// Check user limit
	var count int
	h.db.Conn().QueryRow("SELECT COUNT(*) FROM users").Scan(&count)
	maxUsers := h.licenseManager.GetLimit("max_users")
	if maxUsers != -1 && count >= maxUsers {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusPaymentRequired)
		json.NewEncoder(w).Encode(map[string]string{
			"error": "User limit reached",
		})
		return
	}

	// Check if email already exists
	var existingID string
	err := h.db.Conn().QueryRow("SELECT id FROM users WHERE email = ?", input.Email).Scan(&existingID)
	if err == nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusConflict)
		json.NewEncoder(w).Encode(map[string]string{"error": "Email already exists"})
		return
	}

	// Hash password
	passwordHash, err := auth.HashPassword(input.Password)
	if err != nil {
		http.Error(w, "Failed to hash password", http.StatusInternalServerError)
		return
	}

	id := generateID()
	now := time.Now().UnixMilli()

	_, err = h.db.Conn().Exec(
		"INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
		id, input.Email, passwordHash, input.Name, input.Role, now, now,
	)

	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]string{"id": id})
}

func (h *Handlers) DeleteUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	_, err := h.db.Conn().Exec("DELETE FROM users WHERE id = ?", id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

func (h *Handlers) UpdateUser(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var input struct {
		Name     string `json:"name"`
		Role     string `json:"role"`
		Password string `json:"password,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid JSON", http.StatusBadRequest)
		return
	}

	// Check if user exists
	var existingID string
	err := h.db.Conn().QueryRow("SELECT id FROM users WHERE id = ?", id).Scan(&existingID)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "User not found"})
		return
	}

	// Validate role if provided
	if input.Role != "" && input.Role != "admin" && input.Role != "viewer" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Role must be 'admin' or 'viewer'"})
		return
	}

	now := time.Now().UnixMilli()

	// If password is provided, validate and hash it
	if input.Password != "" {
		if len(input.Password) < 8 {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(map[string]string{"error": "Password must be at least 8 characters"})
			return
		}

		passwordHash, err := auth.HashPassword(input.Password)
		if err != nil {
			http.Error(w, "Failed to hash password", http.StatusInternalServerError)
			return
		}

		_, err = h.db.Conn().Exec(
			"UPDATE users SET name = COALESCE(NULLIF(?, ''), name), role = COALESCE(NULLIF(?, ''), role), password_hash = ?, updated_at = ? WHERE id = ?",
			input.Name, input.Role, passwordHash, now, id,
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	} else {
		_, err = h.db.Conn().Exec(
			"UPDATE users SET name = COALESCE(NULLIF(?, ''), name), role = COALESCE(NULLIF(?, ''), role), updated_at = ? WHERE id = ?",
			input.Name, input.Role, now, id,
		)
		if err != nil {
			http.Error(w, err.Error(), http.StatusInternalServerError)
			return
		}
	}

	w.WriteHeader(http.StatusNoContent)
}

// Helpers
func generateID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func getStringOr(m map[string]interface{}, key, def string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return def
}

func getFloatOr(m map[string]interface{}, key string, def float64) float64 {
	if v, ok := m[key].(float64); ok {
		return v
	}
	return def
}

func getBoolFromFloat(m map[string]interface{}, key string) bool {
	if v, ok := m[key].(float64); ok {
		return v != 0
	}
	if v, ok := m[key].(bool); ok {
		return v
	}
	return false
}

func hashIP(ip string) string {
	h := md5.Sum([]byte(ip))
	return hex.EncodeToString(h[:8])
}

// getBotFilterCondition returns SQL condition for bot filtering
func getBotFilterCondition(filter string) string {
	switch filter {
	case "all":
		return "1=1"
	case "humans":
		return "bot_category = 'human'"
	case "good_bots":
		return "bot_category = 'good_bot'"
	case "bad_bots":
		return "bot_category = 'bad_bot'"
	case "suspicious":
		return "bot_category = 'suspicious'"
	default:
		// Default: exclude bots (maintain backward compatibility)
		return "is_bot = 0"
	}
}

func getBotFilterParam(r *http.Request) string {
	return r.URL.Query().Get("bot_filter")
}

// ========== Auth Handlers ==========

// CheckSetup returns whether initial setup is complete
func (h *Handlers) CheckSetup(w http.ResponseWriter, r *http.Request) {
	var count int
	h.db.Conn().QueryRow("SELECT COUNT(*) FROM users WHERE role = 'admin'").Scan(&count)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"setup_complete": count > 0,
	})
}

// Setup creates the initial admin user
func (h *Handlers) Setup(w http.ResponseWriter, r *http.Request) {
	// Check if setup is already complete
	var count int
	h.db.Conn().QueryRow("SELECT COUNT(*) FROM users WHERE role = 'admin'").Scan(&count)
	if count > 0 {
		http.Error(w, "Setup already complete", http.StatusBadRequest)
		return
	}

	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Name     string `json:"name"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if input.Email == "" || input.Password == "" {
		http.Error(w, "Email and password are required", http.StatusBadRequest)
		return
	}

	if len(input.Password) < 8 {
		http.Error(w, "Password must be at least 8 characters", http.StatusBadRequest)
		return
	}

	// Hash password
	passwordHash, err := auth.HashPassword(input.Password)
	if err != nil {
		http.Error(w, "Failed to hash password", http.StatusInternalServerError)
		return
	}

	// Create admin user
	id := auth.GenerateID()
	now := time.Now().UnixMilli()

	_, err = h.db.Conn().Exec(
		"INSERT INTO users (id, email, password_hash, name, role, created_at, updated_at) VALUES (?, ?, ?, ?, 'admin', ?, ?)",
		id, input.Email, passwordHash, input.Name, now, now,
	)
	if err != nil {
		http.Error(w, "Failed to create user", http.StatusInternalServerError)
		return
	}

	// Mark setup as complete
	h.db.Conn().Exec(
		"UPDATE settings SET value = 'true', updated_at = ? WHERE key = 'setup_complete'",
		now,
	)

	// Generate token and set cookie
	user := &auth.User{
		ID:    id,
		Email: input.Email,
		Role:  "admin",
	}
	token, err := h.auth.GenerateToken(user)
	if err != nil {
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	h.auth.SetAuthCookie(w, token)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"user": map[string]interface{}{
			"id":    id,
			"email": input.Email,
			"name":  input.Name,
			"role":  "admin",
		},
	})
}

// Login authenticates a user
func (h *Handlers) Login(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	// Find user
	var user auth.User
	err := h.db.Conn().QueryRow(
		"SELECT id, email, password_hash, name, role FROM users WHERE email = ?",
		input.Email,
	).Scan(&user.ID, &user.Email, &user.PasswordHash, &user.Name, &user.Role)

	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid email or password"})
		return
	}

	// Verify password
	if !auth.VerifyPassword(input.Password, user.PasswordHash) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": "Invalid email or password"})
		return
	}

	// Generate token
	token, err := h.auth.GenerateToken(&user)
	if err != nil {
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	h.auth.SetAuthCookie(w, token)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"user": map[string]interface{}{
			"id":    user.ID,
			"email": user.Email,
			"name":  user.Name,
			"role":  user.Role,
		},
	})
}

// Logout clears the auth cookie
func (h *Handlers) Logout(w http.ResponseWriter, r *http.Request) {
	h.auth.ClearAuthCookie(w)
	w.WriteHeader(http.StatusNoContent)
}

// GetCurrentUser returns the current authenticated user
func (h *Handlers) GetCurrentUser(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, "Not authenticated", http.StatusUnauthorized)
		return
	}

	// Get full user data
	var user struct {
		ID    string `json:"id"`
		Email string `json:"email"`
		Name  string `json:"name"`
		Role  string `json:"role"`
	}

	err := h.db.Conn().QueryRow(
		"SELECT id, email, name, role FROM users WHERE id = ?",
		claims.UserID,
	).Scan(&user.ID, &user.Email, &user.Name, &user.Role)

	if err != nil {
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{"user": user})
}

// ChangePassword changes the current user's password
func (h *Handlers) ChangePassword(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())
	if claims == nil {
		http.Error(w, "Not authenticated", http.StatusUnauthorized)
		return
	}

	var input struct {
		CurrentPassword string `json:"current_password"`
		NewPassword     string `json:"new_password"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if len(input.NewPassword) < 8 {
		http.Error(w, "Password must be at least 8 characters", http.StatusBadRequest)
		return
	}

	// Verify current password
	var currentHash string
	err := h.db.Conn().QueryRow(
		"SELECT password_hash FROM users WHERE id = ?",
		claims.UserID,
	).Scan(&currentHash)

	if err != nil || !auth.VerifyPassword(input.CurrentPassword, currentHash) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Current password is incorrect"})
		return
	}

	// Hash new password
	newHash, err := auth.HashPassword(input.NewPassword)
	if err != nil {
		http.Error(w, "Failed to hash password", http.StatusInternalServerError)
		return
	}

	// Update password
	_, err = h.db.Conn().Exec(
		"UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?",
		newHash, time.Now().UnixMilli(), claims.UserID,
	)
	if err != nil {
		http.Error(w, "Failed to update password", http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// ========== Domain Handlers ==========

// ListDomains returns all registered domains
func (h *Handlers) ListDomains(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Conn().Query(`
		SELECT id, name, domain, site_id, created_by, created_at, is_active
		FROM domains
		ORDER BY created_at DESC
	`)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}
	defer rows.Close()

	domains := make([]map[string]interface{}, 0)
	for rows.Next() {
		var id, name, domain string
		var siteID, createdBy *string
		var createdAt int64
		var isActive int

		rows.Scan(&id, &name, &domain, &siteID, &createdBy, &createdAt, &isActive)
		domains = append(domains, map[string]interface{}{
			"id":         id,
			"name":       name,
			"domain":     domain,
			"site_id":    siteID,
			"created_by": createdBy,
			"created_at": createdAt,
			"is_active":  isActive == 1,
		})
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(domains)
}

// CreateDomain adds a new domain
func (h *Handlers) CreateDomain(w http.ResponseWriter, r *http.Request) {
	claims := auth.GetUserFromContext(r.Context())

	var input struct {
		Name   string `json:"name"`
		Domain string `json:"domain"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if input.Name == "" || input.Domain == "" {
		http.Error(w, "Name and domain are required", http.StatusBadRequest)
		return
	}

	// Check domain limit based on license tier
	var domainCount int
	h.db.Conn().QueryRow("SELECT COUNT(*) FROM domains").Scan(&domainCount)

	// Domain limits: community=2, pro=10, enterprise=unlimited
	maxDomains := 2 // community default
	tier := h.licenseManager.GetTier()
	switch tier {
	case "pro":
		maxDomains = 10
	case "enterprise":
		maxDomains = -1 // unlimited
	}

	if maxDomains != -1 && domainCount >= maxDomains {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusPaymentRequired)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":       fmt.Sprintf("Domain limit reached (%d domains for %s tier)", maxDomains, tier),
			"max_domains": maxDomains,
			"tier":        tier,
		})
		return
	}

	// Normalize domain (lowercase, no protocol)
	domain := strings.ToLower(input.Domain)
	domain = strings.TrimPrefix(domain, "https://")
	domain = strings.TrimPrefix(domain, "http://")
	domain = strings.TrimSuffix(domain, "/")

	id := auth.GenerateID()
	siteID := "site_" + generateID()[:16] // Generate unique site_id
	now := time.Now().UnixMilli()

	var createdBy *string
	if claims != nil {
		createdBy = &claims.UserID
	}

	_, err := h.db.Conn().Exec(
		"INSERT INTO domains (id, name, domain, site_id, created_by, created_at, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)",
		id, input.Name, domain, siteID, createdBy, now,
	)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint") {
			http.Error(w, "Domain already exists", http.StatusConflict)
			return
		}
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"id":         id,
		"name":       input.Name,
		"domain":     domain,
		"site_id":    siteID,
		"created_at": now,
		"is_active":  true,
	})
}

// DeleteDomain removes a domain
func (h *Handlers) DeleteDomain(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	result, err := h.db.Conn().Exec("DELETE FROM domains WHERE id = ?", id)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	affected, _ := result.RowsAffected()
	if affected == 0 {
		http.Error(w, "Domain not found", http.StatusNotFound)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}

// GetDomainSnippet returns the tracking snippet for a domain
func (h *Handlers) GetDomainSnippet(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var domain, siteID string
	err := h.db.Conn().QueryRow("SELECT domain, site_id FROM domains WHERE id = ?", id).Scan(&domain, &siteID)
	if err != nil {
		http.Error(w, "Domain not found", http.StatusNotFound)
		return
	}

	// Get the host from the request or use localhost for local dev
	host := r.Host
	scheme := "https"
	if strings.HasPrefix(host, "localhost") || strings.HasPrefix(host, "127.0.0.1") {
		scheme = "http"
	}

	snippet := fmt.Sprintf(`<!-- YAAT  Analytics -->
<script defer data-site="%s" src="%s://%s/s.js"></script>`, siteID, scheme, host)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"domain":  domain,
		"site_id": siteID,
		"snippet": snippet,
	})
}

// ========== Ad Fraud Handlers ==========

// GetFraudSummary returns fraud detection summary
func (h *Handlers) GetFraudSummary(w http.ResponseWriter, r *http.Request) {
	days := getDaysParam(r, 7)
	domain := getDomainParam(r)

	detector := adfraud.NewDetector(h.db.Conn())
	summary, err := detector.GetFraudSummary(domain, days)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(summary)
}

// GetSourceQuality returns traffic quality per source
func (h *Handlers) GetSourceQuality(w http.ResponseWriter, r *http.Request) {
	days := getDaysParam(r, 7)
	domain := getDomainParam(r)

	detector := adfraud.NewDetector(h.db.Conn())
	sources, err := detector.GetSourceQuality(domain, days)
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(sources)
}

// ListCampaigns returns all campaigns
func (h *Handlers) ListCampaigns(w http.ResponseWriter, r *http.Request) {
	analyzer := adfraud.NewSpendAnalyzer(h.db.Conn())
	campaigns, err := analyzer.ListCampaigns()
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(campaigns)
}

// CreateCampaign creates a new campaign
func (h *Handlers) CreateCampaign(w http.ResponseWriter, r *http.Request) {
	var input struct {
		Name        string  `json:"name"`
		UTMSource   *string `json:"utm_source,omitempty"`
		UTMMedium   *string `json:"utm_medium,omitempty"`
		UTMCampaign *string `json:"utm_campaign,omitempty"`
		CPC         float64 `json:"cpc"`
		CPM         float64 `json:"cpm"`
		Budget      float64 `json:"budget"`
		StartDate   *int64  `json:"start_date,omitempty"`
		EndDate     *int64  `json:"end_date,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&input); err != nil {
		http.Error(w, "Invalid request body", http.StatusBadRequest)
		return
	}

	if input.Name == "" {
		http.Error(w, "Campaign name is required", http.StatusBadRequest)
		return
	}

	campaign := &adfraud.Campaign{
		ID:          generateID(),
		Name:        input.Name,
		UTMSource:   input.UTMSource,
		UTMMedium:   input.UTMMedium,
		UTMCampaign: input.UTMCampaign,
		CPC:         input.CPC,
		CPM:         input.CPM,
		Budget:      input.Budget,
		StartDate:   input.StartDate,
		EndDate:     input.EndDate,
	}

	analyzer := adfraud.NewSpendAnalyzer(h.db.Conn())
	if err := analyzer.CreateCampaign(campaign); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(campaign)
}

// GetCampaignReport returns fraud report for a campaign
func (h *Handlers) GetCampaignReport(w http.ResponseWriter, r *http.Request) {
	campaignID := chi.URLParam(r, "id")
	domain := getDomainParam(r)

	analyzer := adfraud.NewSpendAnalyzer(h.db.Conn())
	report, err := analyzer.GetCampaignReport(campaignID, domain)
	if err != nil {
		if err == sql.ErrNoRows {
			http.Error(w, "Campaign not found", http.StatusNotFound)
		} else {
			http.Error(w, err.Error(), http.StatusInternalServerError)
		}
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(report)
}

// DeleteCampaign removes a campaign
func (h *Handlers) DeleteCampaign(w http.ResponseWriter, r *http.Request) {
	campaignID := chi.URLParam(r, "id")

	analyzer := adfraud.NewSpendAnalyzer(h.db.Conn())
	if err := analyzer.DeleteCampaign(campaignID); err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
