package bot

import (
	"database/sql"
	"log"
	"time"
)

// BatchAnalyzer performs scheduled analysis of session behavior
type BatchAnalyzer struct {
	db       *sql.DB
	interval time.Duration
	stopCh   chan struct{}
}

// NewBatchAnalyzer creates a new batch analyzer
func NewBatchAnalyzer(db *sql.DB, interval time.Duration) *BatchAnalyzer {
	return &BatchAnalyzer{
		db:       db,
		interval: interval,
		stopCh:   make(chan struct{}),
	}
}

// Start begins the batch analysis loop
func (b *BatchAnalyzer) Start() {
	log.Printf("Starting bot batch analyzer with %v interval", b.interval)

	// Run immediately on startup
	b.analyze()

	ticker := time.NewTicker(b.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			b.analyze()
		case <-b.stopCh:
			log.Println("Stopping bot batch analyzer")
			return
		}
	}
}

// Stop halts the batch analysis
func (b *BatchAnalyzer) Stop() {
	close(b.stopCh)
}

// analyze runs all behavioral analysis patterns
func (b *BatchAnalyzer) analyze() {
	since := time.Now().Add(-15 * time.Minute)
	log.Printf("Running bot batch analysis for sessions since %v", since.Format(time.RFC3339))

	count := 0
	count += b.analyzeZeroInteraction(since)
	count += b.analyzeImpossibleSpeed(since)
	count += b.analyzePerfectTiming(since)

	if count > 0 {
		log.Printf("Bot batch analysis: updated %d sessions", count)
	}
}

// analyzeZeroInteraction detects sessions with no interaction
// Pattern: No scroll/mouse/click, single pageview, <1s duration
func (b *BatchAnalyzer) analyzeZeroInteraction(since time.Time) int {
	query := `
		UPDATE events
		SET bot_score = MIN(bot_score + 25, 100),
			bot_signals = json_insert(bot_signals, '$[#]', json('{"name":"zero_interaction","weight":25}')),
			bot_category = CASE
				WHEN bot_score + 25 > 50 THEN 'bad_bot'
				WHEN bot_score + 25 > 20 THEN 'suspicious'
				ELSE bot_category
			END
		WHERE session_id IN (
			SELECT session_id
			FROM events
			WHERE timestamp >= ?
			GROUP BY session_id
			HAVING
				SUM(has_scroll) = 0
				AND SUM(has_mouse_move) = 0
				AND SUM(has_click) = 0
				AND COUNT(*) = 1
				AND SUM(CASE WHEN event_type = 'pageview' THEN 1 ELSE 0 END) = 1
				AND COALESCE(MAX(page_duration), 0) < 1000
		)
		AND bot_score < 75
		AND bot_signals NOT LIKE '%zero_interaction%'
	`

	result, err := b.db.Exec(query, since.UnixMilli())
	if err != nil {
		log.Printf("Zero interaction analysis error: %v", err)
		return 0
	}

	affected, _ := result.RowsAffected()
	return int(affected)
}

// analyzeImpossibleSpeed detects sessions with inhuman speed
// Pattern: >50 pageviews in 10 seconds
func (b *BatchAnalyzer) analyzeImpossibleSpeed(since time.Time) int {
	query := `
		UPDATE events
		SET bot_score = MIN(bot_score + 30, 100),
			bot_signals = json_insert(bot_signals, '$[#]', json('{"name":"impossible_speed","weight":30}')),
			bot_category = 'bad_bot'
		WHERE session_id IN (
			SELECT session_id
			FROM events
			WHERE timestamp >= ?
				AND event_type = 'pageview'
			GROUP BY session_id
			HAVING
				COUNT(*) > 50
				AND (MAX(timestamp) - MIN(timestamp)) < 10000
		)
		AND bot_signals NOT LIKE '%impossible_speed%'
	`

	result, err := b.db.Exec(query, since.UnixMilli())
	if err != nil {
		log.Printf("Impossible speed analysis error: %v", err)
		return 0
	}

	affected, _ := result.RowsAffected()
	return int(affected)
}

// analyzePerfectTiming detects sessions with robotic click patterns
// Pattern: Click intervals with <50ms variance (not easily detectable with SQLite)
// This is a simplified version that looks for suspiciously regular timing
func (b *BatchAnalyzer) analyzePerfectTiming(since time.Time) int {
	// SQLite doesn't have great support for variance calculation
	// We'll use a simpler heuristic: sessions with many clicks but very short total time
	query := `
		UPDATE events
		SET bot_score = MIN(bot_score + 20, 100),
			bot_signals = json_insert(bot_signals, '$[#]', json('{"name":"perfect_timing","weight":20}')),
			bot_category = CASE
				WHEN bot_score + 20 > 50 THEN 'bad_bot'
				ELSE 'suspicious'
			END
		WHERE session_id IN (
			SELECT e.session_id
			FROM events e
			WHERE e.timestamp >= ?
				AND e.event_type = 'click'
			GROUP BY e.session_id
			HAVING
				COUNT(*) >= 10
				AND (MAX(e.timestamp) - MIN(e.timestamp)) / COUNT(*) < 100
		)
		AND bot_signals NOT LIKE '%perfect_timing%'
	`

	result, err := b.db.Exec(query, since.UnixMilli())
	if err != nil {
		log.Printf("Perfect timing analysis error: %v", err)
		return 0
	}

	affected, _ := result.RowsAffected()
	return int(affected)
}

// MaterializeSessions creates/updates the visitor_sessions table
func (b *BatchAnalyzer) MaterializeSessions(since time.Time) error {
	query := `
		INSERT OR REPLACE INTO visitor_sessions (
			id, session_id, visitor_hash, domain,
			start_time, end_time, duration, pageviews,
			entry_url, exit_url, is_bounce,
			bot_score, bot_category
		)
		SELECT
			session_id || '_' || domain as id,
			session_id,
			MAX(visitor_hash) as visitor_hash,
			domain,
			MIN(timestamp) as start_time,
			MAX(timestamp) as end_time,
			MAX(timestamp) - MIN(timestamp) as duration,
			SUM(CASE WHEN event_type = 'pageview' THEN 1 ELSE 0 END) as pageviews,
			(SELECT url FROM events e2 WHERE e2.session_id = e.session_id AND e2.domain = e.domain ORDER BY timestamp ASC LIMIT 1) as entry_url,
			(SELECT url FROM events e3 WHERE e3.session_id = e.session_id AND e3.domain = e.domain ORDER BY timestamp DESC LIMIT 1) as exit_url,
			CASE WHEN SUM(CASE WHEN event_type = 'pageview' THEN 1 ELSE 0 END) = 1 THEN 1 ELSE 0 END as is_bounce,
			MAX(bot_score) as bot_score,
			MAX(bot_category) as bot_category
		FROM events e
		WHERE timestamp >= ?
		GROUP BY session_id, domain
	`

	_, err := b.db.Exec(query, since.UnixMilli())
	return err
}
