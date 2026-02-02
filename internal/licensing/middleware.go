package licensing

import (
	"encoding/json"
	"net/http"
)

// RequireFeature returns middleware that blocks access if feature is not enabled
func RequireFeature(manager *Manager, feature string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !manager.HasFeature(feature) {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusPaymentRequired)
				json.NewEncoder(w).Encode(map[string]interface{}{
					"error":   "feature_not_available",
					"message": "This feature requires a Pro or Enterprise license",
					"feature": feature,
					"tier":    manager.GetTier(),
					"upgrade": true,
				})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequireTier returns middleware that requires a minimum tier
func RequireTier(manager *Manager, minTier string) func(http.Handler) http.Handler {
	tierOrder := map[string]int{
		TierCommunity:  0,
		TierPro:        1,
		TierEnterprise: 2,
	}

	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			currentTier := manager.GetTier()
			if tierOrder[currentTier] < tierOrder[minTier] {
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusPaymentRequired)
				json.NewEncoder(w).Encode(map[string]interface{}{
					"error":        "tier_not_sufficient",
					"message":      "This feature requires a " + minTier + " license or higher",
					"current_tier": currentTier,
					"required":     minTier,
					"upgrade":      true,
				})
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
