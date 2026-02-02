#!/usr/bin/env bash
set -euo pipefail

# ============================================
# YAAT  Installer
# ============================================

VERSION="${YAAT_VERSION:-latest}"
INSTALL_DIR="${YAAT_INSTALL_DIR:-/usr/local/bin}"
DATA_DIR="${YAAT_DATA_DIR:-/var/lib/yaat}"
WITH_SYSTEMD="${YAAT_SYSTEMD:-false}"
GITHUB_REPO="ibero-data/yaat"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

info()  { echo -e "${GREEN}✓${NC} $1"; }
warn()  { echo -e "${YELLOW}⚠${NC} $1"; }
error() { echo -e "${RED}✗${NC} $1"; exit 1; }
step()  { echo -e "${BLUE}→${NC} $1"; }

# Parse arguments
for arg in "$@"; do
  case $arg in
    --with-systemd) WITH_SYSTEMD=true ;;
    --version=*) VERSION="${arg#*=}" ;;
    --help)
      echo "YAAT  Installer"
      echo ""
      echo "Usage: install.sh [OPTIONS]"
      echo ""
      echo "Options:"
      echo "  --with-systemd    Install and enable systemd service (Linux)"
      echo "  --version=TAG     Install specific version (default: latest)"
      echo ""
      echo "Environment variables:"
      echo "  YAAT_INSTALL_DIR  Binary location (default: /usr/local/bin)"
      echo "  YAAT_DATA_DIR     Data directory (default: /var/lib/yaat)"
      exit 0
      ;;
  esac
done

detect_platform() {
  OS=$(uname -s | tr '[:upper:]' '[:lower:]')
  ARCH=$(uname -m)

  case "$ARCH" in
    x86_64) ARCH="amd64" ;;
    aarch64|arm64) ARCH="arm64" ;;
    *) error "Unsupported architecture: $ARCH" ;;
  esac

  case "$OS" in
    linux|darwin) ;;
    *) error "Unsupported OS: $OS" ;;
  esac

  PLATFORM="${OS}-${ARCH}"
  info "Detected platform: $PLATFORM"
}

get_latest_version() {
  if [ "$VERSION" = "latest" ]; then
    step "Fetching latest version..."
    VERSION=$(curl -sL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
    [ -z "$VERSION" ] && error "Failed to fetch latest version"
  fi
  info "Installing version: $VERSION"
}

download_binary() {
  BINARY_NAME="yaat-${PLATFORM}"
  DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/${VERSION}/${BINARY_NAME}"

  step "Downloading $BINARY_NAME..."
  TMP_FILE=$(mktemp)

  if ! curl -fsSL "$DOWNLOAD_URL" -o "$TMP_FILE"; then
    rm -f "$TMP_FILE"
    error "Failed to download binary. Check if version $VERSION exists for $PLATFORM"
  fi

  chmod +x "$TMP_FILE"
  info "Downloaded successfully"
}

install_binary() {
  step "Installing to $INSTALL_DIR/yaat..."

  if [ -w "$INSTALL_DIR" ]; then
    mv "$TMP_FILE" "$INSTALL_DIR/yaat"
  else
    sudo mv "$TMP_FILE" "$INSTALL_DIR/yaat"
  fi

  info "Binary installed: $INSTALL_DIR/yaat"
}

setup_systemd() {
  [ "$WITH_SYSTEMD" != "true" ] && return
  [ "$OS" != "linux" ] && { warn "Systemd only available on Linux"; return; }

  step "Setting up systemd service..."

  # Create yaat user if not exists
  if ! id -u yaat &>/dev/null; then
    sudo useradd --system --no-create-home --shell /usr/sbin/nologin yaat
    info "Created system user: yaat"
  fi

  # Create data directory
  sudo mkdir -p "$DATA_DIR"
  sudo chown yaat:yaat "$DATA_DIR"
  info "Created data directory: $DATA_DIR"

  # Create systemd service
  sudo tee /etc/systemd/system/yaat.service > /dev/null << EOF
[Unit]
Description=YAAT  Analytics
After=network.target

[Service]
Type=simple
User=yaat
Group=yaat
WorkingDirectory=$DATA_DIR
ExecStart=$INSTALL_DIR/yaat serve
Restart=always
RestartSec=5

# Environment
Environment=YAAT_DATA_DIR=$DATA_DIR
Environment=YAAT_PORT=3456

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
EOF

  sudo systemctl daemon-reload
  sudo systemctl enable yaat
  info "Systemd service installed and enabled"
}

print_success() {
  echo ""
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${GREEN}  YAAT  installed successfully!${NC}"
  echo -e "${GREEN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo ""
  echo "Next steps:"
  echo ""

  if [ "$WITH_SYSTEMD" = "true" ] && [ "$OS" = "linux" ]; then
    echo "  # Run setup wizard"
    echo "  sudo -u yaat $INSTALL_DIR/yaat init --data-dir=$DATA_DIR"
    echo ""
    echo "  # Start the service"
    echo "  sudo systemctl start yaat"
    echo ""
    echo "  # View logs"
    echo "  sudo journalctl -u yaat -f"
  else
    echo "  # Run setup wizard"
    echo "  yaat init"
    echo ""
    echo "  # Start the server"
    echo "  yaat serve"
  fi

  echo ""
  echo "Dashboard will be available at: http://localhost:3456"
  echo ""
}

main() {
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  YAAT  Installer"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  detect_platform
  get_latest_version
  download_binary
  install_binary
  setup_systemd
  print_success
}

main "$@"
