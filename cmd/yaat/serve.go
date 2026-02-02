package main

import (
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/spf13/cobra"

	"github.com/yaat/yaat-/internal/api"
	"github.com/yaat/yaat-/internal/bot"
	"github.com/yaat/yaat-/internal/config"
	"github.com/yaat/yaat-/internal/database"
	"github.com/yaat/yaat-/internal/enrichment"
	"github.com/yaat/yaat-/internal/licensing"
	"github.com/yaat/yaat-/internal/settings"
	"github.com/yaat/yaat-/ui"
)

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the YAAT  server",
	Long:  `Starts the YAAT  analytics server and begins accepting tracking data.`,
	Run:   runServe,
}

func runServe(cmd *cobra.Command, args []string) {
	// Ensure data directory exists
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		log.Fatalf("Failed to create data directory: %v", err)
	}

	// Initialize database
	db, err := database.New(dataDir + "/yaat.db")
	if err != nil {
		log.Fatalf("Failed to initialize database: %v", err)
	}
	defer db.Close()

	// Run migrations
	if err := db.Migrate(); err != nil {
		log.Fatalf("Failed to run migrations: %v", err)
	}

	// Initialize settings service
	settingsSvc := settings.New(db.Conn())

	// Get or generate secret key
	secretKey, _ := settingsSvc.Get("secret_key")
	if secretKey == "" {
		secretKey = settings.GenerateSecretKey()
		settingsSvc.Set("secret_key", secretKey)
		log.Println("Generated new secret key")
	}
	settingsSvc.SetMasterKey(secretKey)

	// Load settings into config
	geoipPath := settingsSvc.GetWithDefault("geoip_path", dataDir+"/GeoLite2-City.mmdb")
	allowedOrigins := settingsSvc.GetWithDefault("allowed_origins", "*")

	// Build config from settings and flags
	cfg := &config.Config{
		ListenAddr:            listenAddr,
		DataDir:               dataDir,
		GeoIPPath:             geoipPath,
		SessionTimeoutMinutes: settingsSvc.GetInt("session_timeout_minutes", 30),
		TrackPerformance:      settingsSvc.GetBool("track_performance", true),
		TrackErrors:           settingsSvc.GetBool("track_errors", true),
		RespectDNT:            settingsSvc.GetBool("respect_dnt", true),
		AllowedOrigins:        []string{allowedOrigins},
		SecretKey:             secretKey,
	}

	// Initialize enrichment service
	enricher := enrichment.New(cfg.GeoIPPath)

	// Initialize license manager
	licenseManager := licensing.NewManager(cfg.DataDir + "/license.json")

	// Get embedded UI filesystem
	uiDist, err := fs.Sub(ui.DistFS, "dist")
	if err != nil {
		log.Fatalf("Failed to access embedded UI: %v", err)
	}

	// Create router
	router := api.NewRouter(db, enricher, licenseManager, cfg, uiDist)

	// Start data retention cleanup goroutine
	go func() {
		runDataRetention(db, licenseManager)
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			runDataRetention(db, licenseManager)
		}
	}()

	// Start bot batch analysis (every 15 minutes)
	batchAnalyzer := bot.NewBatchAnalyzer(db.Conn(), 15*time.Minute)
	go batchAnalyzer.Start()

	// Start server
	server := &http.Server{
		Addr:    cfg.ListenAddr,
		Handler: router,
	}

	// Graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)
		<-sigChan

		log.Println("Shutting down server...")
		server.Close()
	}()

	log.Printf("YAAT  %s starting on %s", Version, cfg.ListenAddr)
	log.Printf("Data directory: %s", cfg.DataDir)
	log.Printf("License: %s", licenseManager.GetTier())

	if err := server.ListenAndServe(); err != http.ErrServerClosed {
		log.Fatalf("Server error: %v", err)
	}
}

func runDataRetention(db *database.DB, lm *licensing.Manager) {
	retentionDays := lm.GetLimit("max_retention_days")
	if retentionDays == -1 {
		retentionDays = 365 * 10 // 10 years for unlimited
	}

	if err := db.CleanupOldData(retentionDays); err != nil {
		log.Printf("Data retention cleanup failed: %v", err)
	} else {
		log.Printf("Data retention: cleaned up data older than %d days", retentionDays)
	}
}
