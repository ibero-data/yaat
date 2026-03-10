package main

import (
	"fmt"
	"os"

	"github.com/spf13/cobra"
	"github.com/caioricciuti/etiquetta/internal/api"
)

var (
	// Version information (set via ldflags)
	Version   = "dev"
	Commit    = "none"
	BuildDate = "unknown"

	// Global flags
	dataDir    string
	listenAddr string
)

var rootCmd = &cobra.Command{
	Use:   "etiquetta",
	Short: "Etiquetta - Privacy-first web analytics",
	Long: `Etiquetta is a self-hosted, privacy-focused web analytics platform.

It provides:
  - Pageview and event tracking
  - Bot detection and fraud analysis
  - Core Web Vitals monitoring
  - Error tracking
  - Multi-domain support

Get started:
  etiquetta init     # Interactive setup wizard
  etiquetta serve    # Start the server

Documentation: https://github.com/caioricciuti/etiquetta`,
	Run: func(cmd *cobra.Command, args []string) {
		// Default behavior: run serve command
		serveCmd.Run(cmd, args)
	},
}

func init() {
	// Set version in API package for /api/version endpoint
	api.Version = Version

	// Global flags available to all commands
	rootCmd.PersistentFlags().StringVarP(&dataDir, "data", "d", "./data", "Data directory for database and files")
	rootCmd.PersistentFlags().StringVarP(&listenAddr, "listen", "l", ":3456", "Address to listen on")

	// Add subcommands
	rootCmd.AddCommand(serveCmd)
	rootCmd.AddCommand(initCmd)
	rootCmd.AddCommand(versionCmd)
	rootCmd.AddCommand(userCmd)
	rootCmd.AddCommand(geoipCmd)
	rootCmd.AddCommand(updateCmd)
}

func main() {
	if err := rootCmd.Execute(); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
