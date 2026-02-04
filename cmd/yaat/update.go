package main

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"

	"github.com/spf13/cobra"
)

var updateCmd = &cobra.Command{
	Use:   "update",
	Short: "Update YAAT to the latest version",
	Long:  `Downloads and installs the latest version of YAAT from GitHub releases.`,
	Run:   runUpdate,
}

type githubRelease struct {
	TagName string `json:"tag_name"`
	Assets  []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
	} `json:"assets"`
}

func runUpdate(cmd *cobra.Command, args []string) {
	fmt.Println("Checking for updates...")

	// Get latest release info
	resp, err := http.Get("https://api.github.com/repos/ibero-data/yaat/releases/latest")
	if err != nil {
		fmt.Printf("Failed to check for updates: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		fmt.Printf("Failed to fetch release info: HTTP %d\n", resp.StatusCode)
		os.Exit(1)
	}

	var release githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&release); err != nil {
		fmt.Printf("Failed to parse release info: %v\n", err)
		os.Exit(1)
	}

	latestVersion := strings.TrimPrefix(release.TagName, "v")
	currentVersion := strings.TrimPrefix(Version, "v")

	fmt.Printf("Current version: %s\n", Version)
	fmt.Printf("Latest version:  %s\n", release.TagName)

	if currentVersion == latestVersion {
		fmt.Println("Already running the latest version.")
		return
	}

	// Determine binary name for this platform
	binaryName := fmt.Sprintf("yaat-%s-%s", runtime.GOOS, runtime.GOARCH)

	// Find download URL
	var downloadURL string
	for _, asset := range release.Assets {
		if asset.Name == binaryName {
			downloadURL = asset.BrowserDownloadURL
			break
		}
	}

	if downloadURL == "" {
		fmt.Printf("No binary available for %s/%s\n", runtime.GOOS, runtime.GOARCH)
		os.Exit(1)
	}

	fmt.Printf("Downloading %s...\n", binaryName)

	// Download new binary
	resp, err = http.Get(downloadURL)
	if err != nil {
		fmt.Printf("Failed to download update: %v\n", err)
		os.Exit(1)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		fmt.Printf("Failed to download: HTTP %d\n", resp.StatusCode)
		os.Exit(1)
	}

	// Get current executable path
	execPath, err := os.Executable()
	if err != nil {
		fmt.Printf("Failed to get executable path: %v\n", err)
		os.Exit(1)
	}

	// Create temp file
	tmpFile, err := os.CreateTemp("", "yaat-update-*")
	if err != nil {
		fmt.Printf("Failed to create temp file: %v\n", err)
		os.Exit(1)
	}
	tmpPath := tmpFile.Name()

	// Download to temp file
	_, err = io.Copy(tmpFile, resp.Body)
	tmpFile.Close()
	if err != nil {
		os.Remove(tmpPath)
		fmt.Printf("Failed to download: %v\n", err)
		os.Exit(1)
	}

	// Make executable
	if err := os.Chmod(tmpPath, 0755); err != nil {
		os.Remove(tmpPath)
		fmt.Printf("Failed to set permissions: %v\n", err)
		os.Exit(1)
	}

	// Replace current binary
	// First try direct rename (works if same filesystem)
	if err := os.Rename(tmpPath, execPath); err != nil {
		// If rename fails, try copy
		src, err := os.Open(tmpPath)
		if err != nil {
			os.Remove(tmpPath)
			fmt.Printf("Failed to open downloaded file: %v\n", err)
			os.Exit(1)
		}
		defer src.Close()

		dst, err := os.OpenFile(execPath, os.O_WRONLY|os.O_TRUNC, 0755)
		if err != nil {
			os.Remove(tmpPath)
			fmt.Printf("Failed to update binary (try running with sudo): %v\n", err)
			os.Exit(1)
		}
		defer dst.Close()

		if _, err := io.Copy(dst, src); err != nil {
			os.Remove(tmpPath)
			fmt.Printf("Failed to write update: %v\n", err)
			os.Exit(1)
		}

		os.Remove(tmpPath)
	}

	fmt.Printf("Successfully updated to %s\n", release.TagName)

	// Try to restart the service automatically
	fmt.Println("Restarting YAAT...")

	// Check if systemctl is available (Linux with systemd)
	if _, err := exec.LookPath("systemctl"); err == nil {
		// Try systemd restart (may need sudo)
		cmd := exec.Command("systemctl", "restart", "yaat")
		if err := cmd.Run(); err != nil {
			// Try with sudo
			cmd = exec.Command("sudo", "systemctl", "restart", "yaat")
			if err := cmd.Run(); err != nil {
				fmt.Println("Could not restart automatically.")
				fmt.Println("Please run: sudo systemctl restart yaat")
				return
			}
		}
		fmt.Println("YAAT restarted successfully!")
		return
	}

	// Fallback for non-systemd systems
	fmt.Println("Please restart YAAT manually to use the new version.")
}
