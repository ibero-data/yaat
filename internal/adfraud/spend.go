package adfraud

import (
	"database/sql"
	"time"
)

// Campaign represents a marketing campaign with cost data
type Campaign struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	UTMSource   *string   `json:"utm_source,omitempty"`
	UTMMedium   *string   `json:"utm_medium,omitempty"`
	UTMCampaign *string   `json:"utm_campaign,omitempty"`
	CPC         float64   `json:"cpc"`          // Cost per click in cents
	CPM         float64   `json:"cpm"`          // Cost per 1000 impressions in cents
	Budget      float64   `json:"budget"`       // Total budget in cents
	StartDate   *int64    `json:"start_date,omitempty"`
	EndDate     *int64    `json:"end_date,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

// CampaignReport contains fraud analysis for a campaign
type CampaignReport struct {
	Campaign        Campaign `json:"campaign"`
	TotalClicks     int64    `json:"total_clicks"`
	BotClicks       int64    `json:"bot_clicks"`
	HumanClicks     int64    `json:"human_clicks"`
	SuspiciousClicks int64   `json:"suspicious_clicks"`
	TotalImpressions int64   `json:"total_impressions"`
	BotImpressions  int64    `json:"bot_impressions"`
	TotalSpend      float64  `json:"total_spend"`      // In dollars
	WastedSpend     float64  `json:"wasted_spend"`     // In dollars
	ValidSpend      float64  `json:"valid_spend"`      // In dollars
	FraudRate       float64  `json:"fraud_rate"`       // Percentage
	ROIImpact       float64  `json:"roi_impact"`       // Percentage loss due to fraud
}

// SpendAnalyzer handles spend and waste calculations
type SpendAnalyzer struct {
	db *sql.DB
}

// NewSpendAnalyzer creates a new spend analyzer
func NewSpendAnalyzer(db *sql.DB) *SpendAnalyzer {
	return &SpendAnalyzer{db: db}
}

// GetCampaignReport generates a fraud report for a specific campaign
func (s *SpendAnalyzer) GetCampaignReport(campaignID string, domain string) (*CampaignReport, error) {
	// Get campaign details
	campaign, err := s.GetCampaign(campaignID)
	if err != nil {
		return nil, err
	}

	report := &CampaignReport{
		Campaign: *campaign,
	}

	// Build query conditions for UTM matching
	var utmConditions []string
	var args []interface{}

	if campaign.UTMSource != nil {
		utmConditions = append(utmConditions, "utm_source = ?")
		args = append(args, *campaign.UTMSource)
	}
	if campaign.UTMMedium != nil {
		utmConditions = append(utmConditions, "utm_medium = ?")
		args = append(args, *campaign.UTMMedium)
	}
	if campaign.UTMCampaign != nil {
		utmConditions = append(utmConditions, "utm_campaign = ?")
		args = append(args, *campaign.UTMCampaign)
	}

	if len(utmConditions) == 0 {
		// No UTM filters, return empty report
		return report, nil
	}

	// Get click stats
	clickQuery := `
		SELECT
			COUNT(*) as total_clicks,
			SUM(CASE WHEN bot_category = 'bad_bot' THEN 1 ELSE 0 END) as bot_clicks,
			SUM(CASE WHEN bot_category = 'human' THEN 1 ELSE 0 END) as human_clicks,
			SUM(CASE WHEN bot_category = 'suspicious' THEN 1 ELSE 0 END) as suspicious_clicks
		FROM events
		WHERE event_type = 'click'
	`
	for _, cond := range utmConditions {
		clickQuery += " AND " + cond
	}
	clickArgs := make([]interface{}, len(args))
	copy(clickArgs, args)

	if domain != "" {
		clickQuery += " AND domain = ?"
		clickArgs = append(clickArgs, domain)
	}

	err = s.db.QueryRow(clickQuery, clickArgs...).Scan(
		&report.TotalClicks,
		&report.BotClicks,
		&report.HumanClicks,
		&report.SuspiciousClicks,
	)
	if err != nil {
		return nil, err
	}

	// Get impression stats (pageviews)
	impQuery := `
		SELECT
			COUNT(*) as total_impressions,
			SUM(CASE WHEN bot_category IN ('bad_bot', 'good_bot') THEN 1 ELSE 0 END) as bot_impressions
		FROM events
		WHERE event_type = 'pageview'
	`
	for _, cond := range utmConditions {
		impQuery += " AND " + cond
	}
	impArgs := make([]interface{}, len(args))
	copy(impArgs, args)

	if domain != "" {
		impQuery += " AND domain = ?"
		impArgs = append(impArgs, domain)
	}

	s.db.QueryRow(impQuery, impArgs...).Scan(&report.TotalImpressions, &report.BotImpressions)

	// Calculate spend
	if campaign.CPC > 0 {
		report.TotalSpend = float64(report.TotalClicks) * campaign.CPC / 100
		report.WastedSpend = float64(report.BotClicks+report.SuspiciousClicks) * campaign.CPC / 100
		report.ValidSpend = float64(report.HumanClicks) * campaign.CPC / 100
	}
	if campaign.CPM > 0 {
		impSpend := float64(report.TotalImpressions) * campaign.CPM / 1000 / 100
		wastedImpSpend := float64(report.BotImpressions) * campaign.CPM / 1000 / 100
		report.TotalSpend += impSpend
		report.WastedSpend += wastedImpSpend
		report.ValidSpend += impSpend - wastedImpSpend
	}

	// Calculate fraud rate
	totalFraudTraffic := report.BotClicks + report.SuspiciousClicks + report.BotImpressions
	totalTraffic := report.TotalClicks + report.TotalImpressions
	if totalTraffic > 0 {
		report.FraudRate = float64(totalFraudTraffic) / float64(totalTraffic) * 100
	}

	// Calculate ROI impact
	if report.TotalSpend > 0 {
		report.ROIImpact = report.WastedSpend / report.TotalSpend * 100
	}

	return report, nil
}

// GetCampaign retrieves a campaign by ID
func (s *SpendAnalyzer) GetCampaign(id string) (*Campaign, error) {
	var c Campaign
	var startDate, endDate, createdAt sql.NullInt64

	err := s.db.QueryRow(`
		SELECT id, name, utm_source, utm_medium, utm_campaign, cpc, cpm, budget, start_date, end_date, created_at
		FROM campaigns
		WHERE id = ?
	`, id).Scan(
		&c.ID, &c.Name, &c.UTMSource, &c.UTMMedium, &c.UTMCampaign,
		&c.CPC, &c.CPM, &c.Budget, &startDate, &endDate, &createdAt,
	)
	if err != nil {
		return nil, err
	}

	if startDate.Valid {
		c.StartDate = &startDate.Int64
	}
	if endDate.Valid {
		c.EndDate = &endDate.Int64
	}
	if createdAt.Valid {
		c.CreatedAt = time.UnixMilli(createdAt.Int64)
	}

	return &c, nil
}

// ListCampaigns returns all campaigns
func (s *SpendAnalyzer) ListCampaigns() ([]Campaign, error) {
	rows, err := s.db.Query(`
		SELECT id, name, utm_source, utm_medium, utm_campaign, cpc, cpm, budget, start_date, end_date, created_at
		FROM campaigns
		ORDER BY created_at DESC
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	campaigns := make([]Campaign, 0)
	for rows.Next() {
		var c Campaign
		var startDate, endDate, createdAt sql.NullInt64

		err := rows.Scan(
			&c.ID, &c.Name, &c.UTMSource, &c.UTMMedium, &c.UTMCampaign,
			&c.CPC, &c.CPM, &c.Budget, &startDate, &endDate, &createdAt,
		)
		if err != nil {
			continue
		}

		if startDate.Valid {
			c.StartDate = &startDate.Int64
		}
		if endDate.Valid {
			c.EndDate = &endDate.Int64
		}
		if createdAt.Valid {
			c.CreatedAt = time.UnixMilli(createdAt.Int64)
		}

		campaigns = append(campaigns, c)
	}

	return campaigns, nil
}

// CreateCampaign creates a new campaign
func (s *SpendAnalyzer) CreateCampaign(c *Campaign) error {
	var startDate, endDate interface{}
	if c.StartDate != nil {
		startDate = *c.StartDate
	}
	if c.EndDate != nil {
		endDate = *c.EndDate
	}

	_, err := s.db.Exec(`
		INSERT INTO campaigns (id, name, utm_source, utm_medium, utm_campaign, cpc, cpm, budget, start_date, end_date, created_at)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
	`, c.ID, c.Name, c.UTMSource, c.UTMMedium, c.UTMCampaign,
		c.CPC, c.CPM, c.Budget, startDate, endDate, time.Now().UnixMilli())

	return err
}

// DeleteCampaign removes a campaign
func (s *SpendAnalyzer) DeleteCampaign(id string) error {
	_, err := s.db.Exec("DELETE FROM campaigns WHERE id = ?", id)
	return err
}
