package geoip

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

const (
	// MaxMind GeoLite2 download URL
	downloadURL = "https://download.maxmind.com/geoip/databases/GeoLite2-City/download?suffix=tar.gz"
)

// Downloader handles downloading and extracting the MaxMind GeoIP database
type Downloader struct {
	AccountID  string
	LicenseKey string
	DataDir    string
}

// Status represents the current state of the GeoIP database
type Status struct {
	Exists       bool      `json:"exists"`
	Path         string    `json:"path"`
	FileSize     int64     `json:"file_size"`
	LastModified time.Time `json:"last_modified"`
}

// NewDownloader creates a new Downloader instance
func NewDownloader(accountID, licenseKey, dataDir string) *Downloader {
	return &Downloader{
		AccountID:  accountID,
		LicenseKey: licenseKey,
		DataDir:    dataDir,
	}
}

// Download downloads and extracts the GeoLite2-City database
func (d *Downloader) Download() error {
	if d.AccountID == "" || d.LicenseKey == "" {
		return fmt.Errorf("MaxMind credentials not configured")
	}

	// Create HTTP client with timeout
	client := &http.Client{
		Timeout: 5 * time.Minute,
	}

	// Create request with basic auth
	req, err := http.NewRequest("GET", downloadURL, nil)
	if err != nil {
		return fmt.Errorf("failed to create request: %w", err)
	}
	req.SetBasicAuth(d.AccountID, d.LicenseKey)

	// Download the file
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("failed to download: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed with status: %s", resp.Status)
	}

	// Create temp file for download
	tmpFile, err := os.CreateTemp(d.DataDir, "geoip-*.tar.gz")
	if err != nil {
		return fmt.Errorf("failed to create temp file: %w", err)
	}
	tmpPath := tmpFile.Name()
	defer os.Remove(tmpPath)

	// Copy response to temp file
	_, err = io.Copy(tmpFile, resp.Body)
	tmpFile.Close()
	if err != nil {
		return fmt.Errorf("failed to save download: %w", err)
	}

	// Extract the database
	dbPath, err := d.extractDatabase(tmpPath)
	if err != nil {
		return fmt.Errorf("failed to extract database: %w", err)
	}

	// Move to final location
	finalPath := filepath.Join(d.DataDir, "GeoLite2-City.mmdb")
	if err := os.Rename(dbPath, finalPath); err != nil {
		// If rename fails (cross-device), try copy
		if err := copyFile(dbPath, finalPath); err != nil {
			return fmt.Errorf("failed to move database: %w", err)
		}
		os.Remove(dbPath)
	}

	return nil
}

// extractDatabase extracts the .mmdb file from the tar.gz archive
func (d *Downloader) extractDatabase(archivePath string) (string, error) {
	file, err := os.Open(archivePath)
	if err != nil {
		return "", err
	}
	defer file.Close()

	// Decompress gzip
	gzReader, err := gzip.NewReader(file)
	if err != nil {
		return "", err
	}
	defer gzReader.Close()

	// Read tar archive
	tarReader := tar.NewReader(gzReader)

	for {
		header, err := tarReader.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", err
		}

		// Look for the .mmdb file
		if strings.HasSuffix(header.Name, ".mmdb") {
			// Create temp file for the database
			outPath := filepath.Join(d.DataDir, "GeoLite2-City.mmdb.tmp")
			outFile, err := os.Create(outPath)
			if err != nil {
				return "", err
			}

			_, err = io.Copy(outFile, tarReader)
			outFile.Close()
			if err != nil {
				os.Remove(outPath)
				return "", err
			}

			return outPath, nil
		}
	}

	return "", fmt.Errorf("no .mmdb file found in archive")
}

// GetStatus returns the current status of the GeoIP database
func (d *Downloader) GetStatus() Status {
	path := filepath.Join(d.DataDir, "GeoLite2-City.mmdb")
	info, err := os.Stat(path)

	if err != nil {
		return Status{
			Exists: false,
			Path:   path,
		}
	}

	return Status{
		Exists:       true,
		Path:         path,
		FileSize:     info.Size(),
		LastModified: info.ModTime(),
	}
}

// copyFile copies a file from src to dst
func copyFile(src, dst string) error {
	sourceFile, err := os.Open(src)
	if err != nil {
		return err
	}
	defer sourceFile.Close()

	destFile, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer destFile.Close()

	_, err = io.Copy(destFile, sourceFile)
	return err
}
