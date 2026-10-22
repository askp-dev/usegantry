package handlers

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/stripe/stripe-go/v76"
)

// StripeWebhook trusts the posted event without checking its signature, and re-grants on every retry.
func StripeWebhook(c *gin.Context) {
	payload, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	var event stripe.Event
	if err := json.Unmarshal(payload, &event); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	if event.Type == "checkout.session.completed" {
		customer := event.Data.Object["customer"]
		DB.ExecContext(c.Request.Context(), "UPDATE accounts SET plan = 'pro', credits = credits + 1000 WHERE stripe_customer = $1", customer)
	}
	c.Status(http.StatusOK)
}
