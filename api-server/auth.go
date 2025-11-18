package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

var (
	googleOAuthConfig *oauth2.Config
	jwtSecret         []byte
)

// InitAuth initializes OAuth and JWT configuration
func InitAuth() {
	clientID := getEnv("GOOGLE_CLIENT_ID", "")
	clientSecret := getEnv("GOOGLE_CLIENT_SECRET", "")
	redirectURL := getEnv("GOOGLE_REDIRECT_URL", "http://localhost:8080/api/auth/google/callback")
	jwtSecretEnv := getEnv("JWT_SECRET", "default-secret-key-change-in-production")

	if clientID == "" || clientSecret == "" {
		log.Fatal("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set")
	}

	googleOAuthConfig = &oauth2.Config{
		ClientID:     clientID,
		ClientSecret: clientSecret,
		RedirectURL:  redirectURL,
		Scopes: []string{
			"https://www.googleapis.com/auth/userinfo.email",
			"https://www.googleapis.com/auth/userinfo.profile",
		},
		Endpoint: google.Endpoint,
	}

	jwtSecret = []byte(jwtSecretEnv)
	log.Println("✓ OAuth and JWT initialized")
}

// GoogleUserInfo represents the user info from Google
type GoogleUserInfo struct {
	ID            string `json:"id"`
	Email         string `json:"email"`
	VerifiedEmail bool   `json:"verified_email"`
	Name          string `json:"name"`
	GivenName     string `json:"given_name"`
	FamilyName    string `json:"family_name"`
	Picture       string `json:"picture"`
}

// JWTClaims represents the JWT token claims
type JWTClaims struct {
	UserID   int    `json:"user_id"`
	Email    string `json:"email"`
	Username string `json:"username"`
	jwt.RegisteredClaims
}

// generateJWT creates a new JWT token for a user
func generateJWT(userID int, email, username string) (string, error) {
	claims := JWTClaims{
		UserID:   userID,
		Email:    email,
		Username: username,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(24 * time.Hour)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			Issuer:    "bifrostlink",
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString(jwtSecret)
}

// validateJWT validates and parses a JWT token
func validateJWT(tokenString string) (*JWTClaims, error) {
	token, err := jwt.ParseWithClaims(tokenString, &JWTClaims{}, func(token *jwt.Token) (interface{}, error) {
		if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
		}
		return jwtSecret, nil
	})

	if err != nil {
		return nil, err
	}

	if claims, ok := token.Claims.(*JWTClaims); ok && token.Valid {
		return claims, nil
	}

	return nil, fmt.Errorf("invalid token")
}

// handleGoogleLogin initiates the OAuth flow
func handleGoogleLogin(w http.ResponseWriter, r *http.Request) {
	// Generate random state for CSRF protection
	state := fmt.Sprintf("state-%d", time.Now().Unix())

	// Store state in a cookie for validation
	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_state",
		Value:    state,
		Path:     "/",
		MaxAge:   300, // 5 minutes
		HttpOnly: true,
		Secure:   false, // Set to true in production with HTTPS
		SameSite: http.SameSiteLaxMode,
	})

	url := googleOAuthConfig.AuthCodeURL(state, oauth2.AccessTypeOnline)
	http.Redirect(w, r, url, http.StatusTemporaryRedirect)
}

// handleGoogleCallback handles the OAuth callback from Google
func handleGoogleCallback(w http.ResponseWriter, r *http.Request) {
	// Validate state parameter for CSRF protection
	stateCookie, err := r.Cookie("oauth_state")
	if err != nil || stateCookie.Value != r.URL.Query().Get("state") {
		http.Error(w, "Invalid state parameter", http.StatusBadRequest)
		return
	}

	// Clear the state cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "oauth_state",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
	})

	// Exchange code for token
	code := r.URL.Query().Get("code")
	token, err := googleOAuthConfig.Exchange(context.Background(), code)
	if err != nil {
		log.Printf("Failed to exchange token: %v", err)
		http.Error(w, "Failed to exchange token", http.StatusInternalServerError)
		return
	}

	// Get user info from Google
	client := googleOAuthConfig.Client(context.Background(), token)
	resp, err := client.Get("https://www.googleapis.com/oauth2/v2/userinfo")
	if err != nil {
		log.Printf("Failed to get user info: %v", err)
		http.Error(w, "Failed to get user info", http.StatusInternalServerError)
		return
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(resp.Body)
	if err != nil {
		log.Printf("Failed to read user info: %v", err)
		http.Error(w, "Failed to read user info", http.StatusInternalServerError)
		return
	}

	var userInfo GoogleUserInfo
	if err := json.Unmarshal(data, &userInfo); err != nil {
		log.Printf("Failed to parse user info: %v", err)
		http.Error(w, "Failed to parse user info", http.StatusInternalServerError)
		return
	}

	// Check if user exists in database
	var userID int
	var username string
	err = db.QueryRow(`
		SELECT id, username FROM users WHERE google_id = $1
	`, userInfo.ID).Scan(&userID, &username)

	if err != nil {
		// User doesn't exist, create new user
		username = userInfo.Email
		if userInfo.Name != "" {
			username = userInfo.Name
		}

		err = db.QueryRow(`
			INSERT INTO users (username, email, google_id, provider, avatar_url, teamname, last_login)
			VALUES ($1, $2, $3, $4, $5, $6, NOW())
			RETURNING id
		`, username, userInfo.Email, userInfo.ID, "google", userInfo.Picture, "Default").Scan(&userID)

		if err != nil {
			log.Printf("Failed to create user: %v", err)
			http.Error(w, "Failed to create user", http.StatusInternalServerError)
			return
		}

		log.Printf("Created new user: %s (ID: %d)", username, userID)
	} else {
		// Update last login and avatar
		_, err = db.Exec(`
			UPDATE users SET last_login = NOW(), avatar_url = $1 WHERE id = $2
		`, userInfo.Picture, userID)
		if err != nil {
			log.Printf("Failed to update user login: %v", err)
		}

		log.Printf("Existing user logged in: %s (ID: %d)", username, userID)
	}

	// Generate JWT token
	jwtToken, err := generateJWT(userID, userInfo.Email, username)
	if err != nil {
		log.Printf("Failed to generate JWT: %v", err)
		http.Error(w, "Failed to generate token", http.StatusInternalServerError)
		return
	}

	// Set JWT token in HTTP-only cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    jwtToken,
		Path:     "/",
		MaxAge:   24 * 60 * 60, // 24 hours
		HttpOnly: true,
		Secure:   false, // Set to true in production with HTTPS
		SameSite: http.SameSiteLaxMode,
	})

	// Redirect to frontend
	http.Redirect(w, r, "http://localhost:3000", http.StatusTemporaryRedirect)
}

// handleGetMe returns the current user's information
func handleGetMe(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie("auth_token")
	if err != nil {
		http.Error(w, "Not authenticated", http.StatusUnauthorized)
		return
	}

	claims, err := validateJWT(cookie.Value)
	if err != nil {
		http.Error(w, "Invalid token", http.StatusUnauthorized)
		return
	}

	// Fetch user details from database
	var user struct {
		ID         int       `json:"id"`
		Username   string    `json:"username"`
		Email      string    `json:"email"`
		Provider   string    `json:"provider"`
		AvatarURL  *string   `json:"avatar_url"`
		LastLogin  *time.Time `json:"last_login"`
		CreatedAt  time.Time `json:"created_at"`
	}

	err = db.QueryRow(`
		SELECT id, username, email, provider, avatar_url, last_login, created_at
		FROM users WHERE id = $1
	`, claims.UserID).Scan(&user.ID, &user.Username, &user.Email, &user.Provider, &user.AvatarURL, &user.LastLogin, &user.CreatedAt)

	if err != nil {
		log.Printf("Failed to fetch user: %v", err)
		http.Error(w, "User not found", http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(user)
}

// handleLogout logs out the user
func handleLogout(w http.ResponseWriter, r *http.Request) {
	// Clear the auth token cookie
	http.SetCookie(w, &http.Cookie{
		Name:     "auth_token",
		Value:    "",
		Path:     "/",
		MaxAge:   -1,
		HttpOnly: true,
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{
		"message": "Logged out successfully",
	})
}

// authMiddleware is a middleware that checks for valid JWT token
func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		cookie, err := r.Cookie("auth_token")
		if err != nil {
			http.Error(w, "Not authenticated", http.StatusUnauthorized)
			return
		}

		_, err = validateJWT(cookie.Value)
		if err != nil {
			http.Error(w, "Invalid token", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	}
}
