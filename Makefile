.PHONY: build run dev clean test ui all install release

# Version info (reads from VERSION file)
VERSION = $(shell cat VERSION 2>/dev/null || echo "dev")
COMMIT = $(shell git rev-parse --short HEAD 2>/dev/null || echo "none")
BUILD_DATE = $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")
LDFLAGS = -ldflags "-s -w -X main.Version=$(VERSION) -X main.Commit=$(COMMIT) -X main.BuildDate=$(BUILD_DATE)"

# Build everything (UI + binary)
all: ui build

# Build the Go binary
build:
	go build $(LDFLAGS) -o bin/yaat ./cmd/yaat

# Run the server
run: build
	./bin/yaat serve

# Initialize the database and create admin user
init: build
	./bin/yaat init

# Development mode with hot reload (requires air)
dev:
	air

# Build UI with bun
ui:
	cd ui && bun install && bun run build

# Clean build artifacts
clean:
	rm -rf bin/
	rm -rf ui/dist/

# Run tests
test:
	go test -v ./...

# Install to /usr/local/bin
install: all
	cp bin/yaat /usr/local/bin/yaat

# Generate license keypair
keygen:
	go run ./cmd/licensegen -keygen

# Generate a test pro license (requires keypair)
license-pro:
	go run ./cmd/licensegen -licensee "Development" -tier pro -days 365

# Generate a test enterprise license (requires keypair)
license-enterprise:
	go run ./cmd/licensegen -licensee "Development" -tier enterprise -days 365

# Download GeoIP database (requires credentials in settings)
geoip:
	./bin/yaat geoip download

# Build release binaries for all platforms
release: ui
	@mkdir -p dist
	@echo "Building release binaries..."
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o dist/yaat-linux-amd64 ./cmd/yaat
	GOOS=linux GOARCH=arm64 go build $(LDFLAGS) -o dist/yaat-linux-arm64 ./cmd/yaat
	GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o dist/yaat-darwin-amd64 ./cmd/yaat
	GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o dist/yaat-darwin-arm64 ./cmd/yaat
	@echo "Release binaries created in dist/"

# Show help
help:
	@echo "YAAT  Makefile"
	@echo ""
	@echo "Usage:"
	@echo "  make all       - Build UI and binary"
	@echo "  make build     - Build Go binary only"
	@echo "  make ui        - Build React UI only"
	@echo "  make run       - Build and run server"
	@echo "  make init      - Initialize database and create admin"
	@echo "  make dev       - Development mode with hot reload"
	@echo "  make test      - Run tests"
	@echo "  make clean     - Remove build artifacts"
	@echo "  make install   - Install to /usr/local/bin"
	@echo "  make release   - Build binaries for all platforms"
	@echo "  make geoip     - Download GeoIP database"
	@echo ""
	@echo "CLI Commands:"
	@echo "  yaat serve     - Start the server"
	@echo "  yaat init      - Interactive setup wizard"
	@echo "  yaat version   - Show version info"
	@echo "  yaat user list - List users"
	@echo "  yaat user create - Create a user"
	@echo "  yaat geoip download - Download GeoIP database"
