package enrichment

import (
	"net"

	"github.com/oschwald/geoip2-golang"
)

// GeoResult contains geolocation data
type GeoResult struct {
	Country   string
	City      string
	Region    string
	Latitude  float64
	Longitude float64
}

// GeoIP provides IP geolocation
type GeoIP struct {
	db *geoip2.Reader
}

// NewGeoIP creates a new GeoIP instance
func NewGeoIP(path string) (*GeoIP, error) {
	if path == "" {
		return nil, nil
	}

	db, err := geoip2.Open(path)
	if err != nil {
		return nil, err
	}

	return &GeoIP{db: db}, nil
}

// Close closes the GeoIP database
func (g *GeoIP) Close() error {
	if g.db != nil {
		return g.db.Close()
	}
	return nil
}

// Lookup returns geolocation for an IP address
func (g *GeoIP) Lookup(ipStr string) *GeoResult {
	if g.db == nil {
		return nil
	}

	ip := net.ParseIP(ipStr)
	if ip == nil {
		return nil
	}

	record, err := g.db.City(ip)
	if err != nil {
		return nil
	}

	result := &GeoResult{
		Country:   record.Country.IsoCode,
		Latitude:  record.Location.Latitude,
		Longitude: record.Location.Longitude,
	}

	if len(record.City.Names) > 0 {
		result.City = record.City.Names["en"]
	}

	if len(record.Subdivisions) > 0 {
		result.Region = record.Subdivisions[0].IsoCode
	}

	return result
}

// MaskIP masks the last octet of an IPv4 address for privacy
func MaskIP(ip string) string {
	parsed := net.ParseIP(ip)
	if parsed == nil {
		return ip
	}

	// For IPv4
	if ipv4 := parsed.To4(); ipv4 != nil {
		ipv4[3] = 0
		return ipv4.String()
	}

	// For IPv6, mask last 80 bits
	for i := 6; i < 16; i++ {
		parsed[i] = 0
	}
	return parsed.String()
}
