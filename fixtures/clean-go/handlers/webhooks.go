package handlers

import (
	"io"
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/stripe/stripe-go/v76/webhook"
)

// StripeWebhook verifies the signature over the raw body and processes each event id once.
func StripeWebhook(c *gin.Context) {
	payload, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, 65536))
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	event, err := webhook.ConstructEvent(payload, c.GetHeader("Stripe-Signature"), os.Getenv("STRIPE_WEBHOOK_SECRET"))
	if err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	ctx := c.Request.Context()
	tx, err := DB.BeginTx(ctx, nil)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	defer tx.Rollback()
	res, err := tx.ExecContext(ctx, "INSERT INTO processed_webhook_events (event_id) VALUES ($1) ON CONFLICT (event_id) DO NOTHING", event.ID)
	if err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		c.Status(http.StatusOK)
		return
	}
	if event.Type == "checkout.session.completed" {
		tx.ExecContext(ctx, "UPDATE accounts SET plan = 'pro' WHERE stripe_customer = $1", event.Data.Object["customer"])
	}
	tx.Commit()
	c.Status(http.StatusOK)
}
