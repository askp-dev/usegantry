package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// CreateTransfer requires an Idempotency-Key, so a retried request can't move money twice.
func CreateTransfer(c *gin.Context) {
	user := c.MustGet("user").(string)
	key := c.GetHeader("Idempotency-Key")
	var body struct {
		To    string `json:"to"`
		Cents int64  `json:"cents"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Cents <= 0 || key == "" {
		c.Status(http.StatusBadRequest)
		return
	}
	if _, err := DB.ExecContext(c.Request.Context(), "INSERT INTO transfers (from_user, to_user, cents, idempotency_key) VALUES ($1, $2, $3, $4) ON CONFLICT (idempotency_key) DO NOTHING", user, body.To, body.Cents, key); err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	c.Status(http.StatusCreated)
}
