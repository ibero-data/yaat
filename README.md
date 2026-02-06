<p align="center">
  <img src="ui/public/logo.png" alt="YAAT" width="120" height="120">
</p>

<h1 align="center">YAAT</h1>

<p align="center">
  <strong>Self-hosted web analytics. Privacy-focused. Single binary.</strong>
</p>

<p align="center">
  <a href="https://github.com/ibero-data/yaat/actions/workflows/ci.yml">
    <img src="https://github.com/ibero-data/yaat/actions/workflows/ci.yml/badge.svg" alt="CI">
  </a>
  <a href="https://github.com/ibero-data/yaat/releases/latest">
    <img src="https://img.shields.io/github/v/release/ibero-data/yaat" alt="Release">
  </a>
  <a href="LICENSE">
    <img src="https://img.shields.io/badge/license-GPL--3.0-blue.svg" alt="License">
  </a>
</p>

---

## Quick Install

```bash
curl -sSL https://raw.githubusercontent.com/ibero-data/yaat/main/install.sh | bash
```

Or with systemd service (Linux):

```bash
curl -sSL https://raw.githubusercontent.com/ibero-data/yaat/main/install.sh | bash -s -- --with-systemd
```

## Features

- **Single Binary** - Go backend with embedded UI, no external dependencies
- **SQLite Storage** - WAL mode for fast, reliable analytics storage
- **Privacy-First** - Server-side session computation, no third-party cookies
- **Multi-Domain** - Track multiple websites from one installation
- **Real-Time Analytics** - Pageviews, visitors, referrers, and more
- **Bot Detection** - Identify and filter automated traffic
- **Core Web Vitals** - LCP, FCP, CLS, INP, TTFB metrics (Pro)
- **Error Tracking** - Capture JavaScript errors with deduplication (Pro)
- **Ad Fraud Detection** - Detect suspicious traffic patterns (Pro)
- **Dark Mode** - Beautiful UI that respects your system preference

## Quick Start

```bash
# Download the binary (or use the install script above)
# Then run:
./yaat serve

# Open http://localhost:3456
# Complete the setup wizard to create your admin account
```

## Uninstall

### Complete removal (systemd install)

```bash
# Stop and disable the service
sudo systemctl stop yaat
sudo systemctl disable yaat

# Remove service file
sudo rm /etc/systemd/system/yaat.service
sudo systemctl daemon-reload

# Remove binary
sudo rm /usr/local/bin/yaat

# Remove data (WARNING: deletes all analytics data!)
sudo rm -rf /var/lib/yaat

# Remove yaat user (optional)
sudo userdel yaat
```

### Manual install removal

```bash
# Just remove the binary and data
rm ./bin/yaat
rm -rf ./data
```

## Build from Source

Requires Go 1.22+ and Bun.

```bash
git clone https://github.com/ibero-data/yaat.git
cd yaat
make all
./bin/yaat serve
```

## Nginx Setup (Reverse Proxy)

Copy the example config:

```bash
sudo cp nginx.conf.example /etc/nginx/sites-available/yaat
sudo ln -s /etc/nginx/sites-available/yaat /etc/nginx/sites-enabled/
# Edit the file and replace 'your-domain.com' with your domain
sudo nano /etc/nginx/sites-available/yaat
sudo nginx -t && sudo systemctl reload nginx

# Add HTTPS with Let's Encrypt
sudo certbot --nginx -d your-domain.com
```

## Configuration

Environment variables (or `.env` file):

| Variable              | Default  | Description                                                     |
| --------------------- | -------- | --------------------------------------------------------------- |
| `YAAT_PORT`           | `3456`   | HTTP server port                                                |
| `YAAT_DATA_DIR`       | `./data` | Database storage directory                                      |
| `YAAT_JWT_SECRET`     | (random) | JWT signing secret (auto-generated if not set)                  |
| `YAAT_SECURE_COOKIES` | `false`  | Set to `true` only if running HTTPS directly (not behind proxy) |

## Tracking Setup

### 1. Add Your Domain

1. Log in to YAAT
2. Go to **Settings > Domains**
3. Click **Add Domain** and enter your site name and domain

### 2. Install the Tracking Script

Add this snippet to your website's `<head>`:

```html
<script defer src="https://your-yaat-instance.com/s.js"></script>
```

The tracker automatically collects:

- Pageviews with SPA navigation support
- Unique visitors (fingerprint-based, no cookies)
- Referrer information
- Core Web Vitals (LCP, FCP, CLS, INP, TTFB)
- JavaScript errors
- Scroll depth (25%, 50%, 75%, 100%)
- Outbound link clicks
- Engagement time
- Bot detection signals

### Respecting Privacy

- **Do-Not-Track**: Honors the browser's DNT setting by default
- **No Cookies**: Uses server-side fingerprinting, no client-side storage
- **Data Ownership**: All data stays on your server
- **GDPR Friendly**: No personal data collection

## Pricing

| Feature            | Community |     Pro      |  Enterprise   |
| ------------------ | :-------: | :----------: | :-----------: |
| Core Analytics     |     ✓     |      ✓       |       ✓       |
| Unlimited Domains  |     ✓     |      ✓       |       ✓       |
| Bot Analysis       |     ✓     |      ✓       |       ✓       |
| Core Web Vitals    |     -     |      ✓       |       ✓       |
| Error Tracking     |     -     |      ✓       |       ✓       |
| Data Export        |     -     |      ✓       |       ✓       |
| Ad Fraud Detection |     -     |      -       |       ✓       |
| Multi-User         |     -     |      -       |       ✓       |
| Priority Support   |     -     |      -       |       ✓       |
| **Price**          | **Free**  | **€99/year** | **€299/year** |

[Get a License](https://ibero.dev/yaat)

## API Reference

### Authentication

All API endpoints (except `/api/auth/setup` and `/api/auth/login`) require authentication via HTTP-only cookie.

```
POST /api/auth/setup    - Initial admin account creation (first run only)
POST /api/auth/login    - Login with email/password
POST /api/auth/logout   - Clear session
GET  /api/auth/me       - Get current user info
POST /api/auth/password - Change password
```

### Domains

```
GET    /api/domains              - List all registered domains
POST   /api/domains              - Add a new domain
DELETE /api/domains/{id}         - Remove a domain
GET    /api/domains/{id}/snippet - Get tracking snippet for a domain
```

### Analytics

```
GET /api/stats/overview     - Summary stats
GET /api/stats/timeseries   - Pageviews over time
GET /api/stats/pages        - Top pages
GET /api/stats/referrers    - Top referrers
GET /api/stats/devices      - Device breakdown
GET /api/stats/geo          - Geographic breakdown
GET /api/stats/vitals       - Core Web Vitals (Pro)
GET /api/stats/errors       - JavaScript errors (Pro)
GET /api/stats/bots         - Bot traffic breakdown
GET /api/stats/fraud        - Fraud analysis (Enterprise)
```

Query parameters: `?from=2024-01-01&to=2024-01-31&domain=example.com`

### Event Ingestion

```
POST /i     - Receive tracking events (NDJSON format)
GET  /s.js  - Serve tracker script
```

## Development

```bash
# Start development server with hot reload
make dev

# Run tests
make test

# Build for all platforms
make release

# Clean build artifacts
make clean
```

## Architecture

```
yaat/
├── cmd/yaat/         # CLI entry point
├── internal/
│   ├── api/          # HTTP handlers and router
│   ├── auth/         # JWT authentication
│   ├── database/     # SQLite with migrations
│   ├── enrichment/   # GeoIP, bot detection
│   └── licensing/    # License verification
├── ui/               # React frontend (Vite + shadcn)
│   ├── src/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── pages/
│   └── dist/         # Built UI (embedded in binary)
└── data/             # SQLite database (created at runtime)
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run `make test`
5. Submit a pull request

## License

YAAT is licensed under the [GNU General Public License v3.0](LICENSE).

You are free to use, modify, and distribute this software under the terms of the GPL-3.0 license. If you distribute modified versions, you must also make the source code available under the same license.

## Support

- Issues: [github.com/ibero-data/yaat/issues](https://github.com/ibero-data/yaat/issues)
- Website: [ibero.dev/yaat](https://yaat.io)

---

<p align="center">
  Built with Go and React. Privacy-focused analytics for everyone.
</p>
