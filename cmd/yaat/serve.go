package main

import (
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
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

var detach bool

var serveCmd = &cobra.Command{
	Use:   "serve",
	Short: "Start the YAAT  server",
	Long:  `Starts the YAAT  analytics server and begins accepting tracking data.`,
	Run:   runServe,
}

func init() {
	serveCmd.Flags().BoolVar(&detach, "detach", false, "Run server in background (detached mode)")
}

func runServe(cmd *cobra.Command, args []string) {
	// Handle detach mode - fork to background
	if detach {
		if err := os.MkdirAll(dataDir, 0755); err != nil {
			log.Fatalf("Failed to create data directory: %v", err)
		}

		// Build command without -d flag
		execPath, err := os.Executable()
		if err != nil {
			log.Fatalf("Failed to get executable path: %v", err)
		}

		cmdArgs := []string{"serve", "-d=false", "--data", dataDir, "--listen", listenAddr}
		child := exec.Command(execPath, cmdArgs...)

		// Redirect output to log file
		logPath := filepath.Join(dataDir, "yaat.log")
		logFile, err := os.OpenFile(logPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
		if err != nil {
			log.Fatalf("Failed to open log file: %v", err)
		}
		child.Stdout = logFile
		child.Stderr = logFile

		// Start detached process
		if err := child.Start(); err != nil {
			log.Fatalf("Failed to start background process: %v", err)
		}

		// Write PID file
		pidPath := filepath.Join(dataDir, "yaat.pid")
		if err := os.WriteFile(pidPath, []byte(fmt.Sprintf("%d", child.Process.Pid)), 0644); err != nil {
			log.Printf("Warning: Failed to write PID file: %v", err)
		}

		fmt.Printf("YAAT started in background (PID: %d)\n", child.Process.Pid)
		fmt.Printf("Log file: %s\n", logPath)
		fmt.Printf("PID file: %s\n", pidPath)
		return
	}

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
		Addr:         cfg.ListenAddr,
		Handler:      router,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
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
