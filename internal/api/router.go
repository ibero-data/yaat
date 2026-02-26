package api

import (
	"embed"
	"io/fs"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"

	"github.com/yaat/yaat-/internal/auth"
	"github.com/yaat/yaat-/internal/config"
	"github.com/yaat/yaat-/internal/database"
	"github.com/yaat/yaat-/internal/enrichment"
	"github.com/yaat/yaat-/internal/identification"
	"github.com/yaat/yaat-/internal/licensing"
)

//go:embed tracker.js
var trackerJS embed.FS

// NewRouter creates the HTTP router
func NewRouter(db *database.DB, enricher *enrichment.Enricher, licenseManager *licensing.Manager, cfg *config.Config, uiFS fs.FS) http.Handler {
	r := chi.NewRouter()

	// Middleware
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(middleware.RealIP)
	r.Use(middleware.Compress(5))

	// CORS - allow credentials for auth cookies
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   cfg.AllowedOrigins,
		AllowedMethods:   []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Content-Type", "X-Requested-With", "Authorization"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: true,
		MaxAge:           300,
	}))

	// Create auth service
	// secureCookie should only be true when running with HTTPS directly
	// When behind a reverse proxy (nginx), the proxy handles HTTPS
	// Check YAAT_SECURE_COOKIES env var, default to false for proxy setups
	secureCookie := os.Getenv("YAAT_SECURE_COOKIES") == "true"
	authService := auth.New(cfg.SecretKey, secureCookie)
	authMiddleware := auth.NewMiddleware(authService)

	// Create identity generator
	idGen := identification.New(cfg.SecretKey, cfg.SessionTimeoutMinutes)

	// Create handlers
	h := &Handlers{
		db:             db,
		enricher:       enricher,
		licenseManager: licenseManager,
		idGen:          idGen,
		cfg:            cfg,
		auth:           authService,
	}

	// ========== Public endpoints ==========

	// Tracker script - serve at /s.js (clean URL)
	r.Get("/s.js", h.ServeTrackerScript)
	r.Get("/s/tracker.js", h.ServeTrackerScript) // Legacy URL

	// Ingest endpoint (rate limited: 100 req/min/IP)
	r.With(RateLimit(100, time.Minute)).Post("/i", h.Ingest)

	// Health check
	r.Get("/health", h.Health)

	// Version endpoint (public)
	r.Get("/api/version", h.GetVersion)

	// ========== API routes ==========
	r.Route("/api", func(r chi.Router) {

		// Auth routes (public)
		r.Route("/auth", func(r chi.Router) {
			r.Get("/setup", h.CheckSetup)
			r.Post("/setup", h.Setup)
			r.Post("/login", h.Login)
			r.Post("/logout", h.Logout)

			// Protected auth routes
			r.Group(func(r chi.Router) {
				r.Use(authMiddleware.RequireAuth)
				r.Get("/me", h.GetCurrentUser)
				r.Post("/password", h.ChangePassword)
			})
		})

		// License info (public - needed for UI to check features)
		r.Get("/license", h.GetLicense)

		// Protected routes
		r.Group(func(r chi.Router) {
			r.Use(authMiddleware.RequireAuth)

			// License management
			r.Post("/license", h.UploadLicense)
			r.Delete("/license", h.RemoveLicense)

			// Settings
			r.Get("/settings", h.GetSettings)
			r.Put("/settings", h.UpdateSettings)

			// GeoIP Settings (admin only)
			r.Group(func(r chi.Router) {
				r.Use(authMiddleware.RequireAdmin)
				r.Get("/settings/geoip", h.GetGeoIPSettings)
				r.Put("/settings/geoip", h.UpdateGeoIPSettings)
				r.Get("/settings/geoip/status", h.GetGeoIPStatus)
				r.Post("/settings/geoip/download", h.DownloadGeoIPDatabase)
			})

			// Email Settings (admin only)
			r.Group(func(r chi.Router) {
				r.Use(authMiddleware.RequireAdmin)
				r.Get("/settings/email", h.GetEmailSettings)
				r.Put("/settings/email", h.UpdateEmailSettings)
				r.Post("/settings/email/test", h.TestEmailSettings)
			})

			// Database access
			r.Get("/db", h.ServeDatabase)
			r.Get("/db/info", h.GetDatabaseInfo)

			// Real-time events via SSE
			r.Get("/events/stream", h.EventStream)

			// Stats endpoints
			r.Get("/stats/overview", h.GetStatsOverview)
			r.Get("/stats/timeseries", h.GetStatsTimeseries)
			r.Get("/stats/pages", h.GetStatsPages)
			r.Get("/stats/referrers", h.GetStatsReferrers)
			r.Get("/stats/geo", h.GetStatsGeo)
			r.Get("/stats/map", h.GetStatsMapData)
			r.Get("/stats/devices", h.GetStatsDevices)
			r.Get("/stats/browsers", h.GetStatsBrowsers)
			r.Get("/stats/campaigns", h.GetStatsCampaigns)
			r.Get("/stats/events", h.GetStatsCustomEvents)
			r.Get("/stats/outbound", h.GetStatsOutbound)
			r.Get("/stats/bots", h.GetStatsBots) // Bot traffic breakdown

			// Domain management
			r.Get("/domains", h.ListDomains)
			r.Post("/domains", h.CreateDomain)
			r.Delete("/domains/{id}", h.DeleteDomain)
			r.Get("/domains/{id}/snippet", h.GetDomainSnippet)

			// Pro features - Web Vitals
			r.Group(func(r chi.Router) {
				r.Use(licensing.RequireFeature(licenseManager, licensing.FeaturePerformance))
				r.Get("/stats/vitals", h.GetStatsVitals)
			})

			// Pro features - Error tracking
			r.Group(func(r chi.Router) {
				r.Use(licensing.RequireFeature(licenseManager, licensing.FeatureErrorTracking))
				r.Get("/stats/errors", h.GetStatsErrors)
			})

			// Pro features - Export
			r.Group(func(r chi.Router) {
				r.Use(licensing.RequireFeature(licenseManager, licensing.FeatureExport))
				r.Get("/export/events", h.ExportEvents)
			})

			// Pro features - Ad Fraud Detection
			r.Group(func(r chi.Router) {
				r.Use(licensing.RequireFeature(licenseManager, licensing.FeatureAdFraud))
				r.Get("/stats/fraud", h.GetFraudSummary)
				r.Get("/sources/quality", h.GetSourceQuality)
				r.Get("/campaigns", h.ListCampaigns)
				r.Post("/campaigns", h.CreateCampaign)
				r.Get("/campaigns/{id}/report", h.GetCampaignReport)
				r.Delete("/campaigns/{id}", h.DeleteCampaign)
			})

			// Admin only - User management
			r.Group(func(r chi.Router) {
				r.Use(authMiddleware.RequireAdmin)
				r.Use(licensing.RequireFeature(licenseManager, licensing.FeatureMultiUser))
				r.Get("/users", h.ListUsers)
				r.Post("/users", h.CreateUser)
				r.Put("/users/{id}", h.UpdateUser)
				r.Delete("/users/{id}", h.DeleteUser)
			})

			// Admin only - Data Explorer
			r.Group(func(r chi.Router) {
				r.Use(authMiddleware.RequireAdmin)
				r.Post("/explorer/query", h.ExplorerQuery)
				r.Get("/explorer/schema", h.ExplorerSchema)
			})
		})
	})

	// Serve static UI files from embedded filesystem
	fileServer := http.FileServer(http.FS(uiFS))
	r.Get("/*", func(w http.ResponseWriter, req *http.Request) {
		path := req.URL.Path

		// Try to serve the file directly
		if path != "/" {
			// Check if file exists
			filePath := strings.TrimPrefix(path, "/")
			if f, err := uiFS.Open(filePath); err == nil {
				f.Close()
				fileServer.ServeHTTP(w, req)
				return
			}
		}

		// Serve index.html for SPA routes
		indexFile, err := uiFS.Open("index.html")
		if err != nil {
			http.NotFound(w, req)
			return
		}
		defer indexFile.Close()

		stat, _ := indexFile.Stat()
		content, _ := fs.ReadFile(uiFS, "index.html")
		http.ServeContent(w, req, "index.html", stat.ModTime(), strings.NewReader(string(content)))
	})

	return r
}

