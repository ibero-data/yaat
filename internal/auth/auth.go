package auth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

var (
	ErrInvalidCredentials = errors.New("invalid email or password")
	ErrUserNotFound       = errors.New("user not found")
	ErrUserExists         = errors.New("user already exists")
	ErrInvalidToken       = errors.New("invalid token")
	ErrTokenExpired       = errors.New("token expired")
)

// Claims represents JWT claims
type Claims struct {
	UserID string `json:"user_id"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

// User represents a user in the system
type User struct {
	ID           string `json:"id"`
	Email        string `json:"email"`
	PasswordHash string `json:"-"`
	Name         string `json:"name"`
	Role         string `json:"role"`
	CreatedAt    int64  `json:"created_at"`
	UpdatedAt    int64  `json:"updated_at"`
}

// Auth handles authentication operations
type Auth struct {
	jwtSecret     []byte
	tokenDuration time.Duration
	secureCookie  bool
}

// New creates a new Auth instance
func New(jwtSecret string, secureCookie bool) *Auth {
	return &Auth{
		jwtSecret:     []byte(jwtSecret),
		tokenDuration: 7 * 24 * time.Hour, // 7 days
		secureCookie:  secureCookie,
	}
}

// HashPassword hashes a password using bcrypt
func HashPassword(password string) (string, error) {
	hash, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		return "", err
	}
	return string(hash), nil
}

// VerifyPassword checks if a password matches a hash
func VerifyPassword(password, hash string) bool {
	err := bcrypt.CompareHashAndPassword([]byte(hash), []byte(password))
	return err == nil
}

// GenerateID generates a random ID
func GenerateID() string {
	b := make([]byte, 16)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// GenerateToken creates a new JWT token for a user
func (a *Auth) GenerateToken(user *User) (string, error) {
	claims := &Claims{
		UserID: user.ID,
		Email:  user.Email,
		Role:   user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(a.tokenDuration)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			NotBefore: jwt.NewNumericDate(time.Now()),
			Issuer:    "yaat-",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(a.jwtSecret)
}

// ValidateToken validates a JWT token and returns the claims
func (a *Auth) ValidateToken(tokenString string) (*Claims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &Claims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, ErrInvalidToken
		}
		return a.jwtSecret, nil
	})

	if err != nil {
		if errors.Is(err, jwt.ErrTokenExpired) {
			return nil, ErrTokenExpired
		}
		return nil, ErrInvalidToken
	}

	claims, ok := token.Claims.(*Claims)
	if !ok || !token.Valid {
		return nil, ErrInvalidToken
	}

	return claims, nil
}

// SetAuthCookie sets the authentication cookie
func (a *Auth) SetAuthCookie(w http.ResponseWriter, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     "yaat_session",
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   a.secureCookie,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   int(a.tokenDuration.Seconds()),
	})
}

// ClearAuthCookie clears the authentication cookie
func (a *Auth) ClearAuthCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{
		Name:     "yaat_session",
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   a.secureCookie,
		SameSite: http.SameSiteLaxMode,
		MaxAge:   -1,
	})
}

// GetTokenFromRequest extracts the JWT token from the request
func GetTokenFromRequest(r *http.Request) string {
	// First try cookie
	cookie, err := r.Cookie("yaat_session")
	if err == nil && cookie.Value != "" {
		return cookie.Value
	}

	// Then try Authorization header
	auth := r.Header.Get("Authorization")
	if len(auth) > 7 && auth[:7] == "Bearer " {
		return auth[7:]
	}

	return ""
}
