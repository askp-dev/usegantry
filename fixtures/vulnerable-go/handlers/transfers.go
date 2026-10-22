package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// CreateTransfer moves money between wallets; a retried request moves it twice.
func CreateTransfer(c *gin.Context) {
	user := c.MustGet("user").(string)
	var body struct {
		To    string `json:"to"`
		Cents int64  `json:"cents"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Cents <= 0 {
		c.Status(http.StatusBadRequest)
		return
	}
	if _, err := DB.ExecContext(c.Request.Context(), "INSERT INTO transfers (from_user, to_user, cents) VALUES ($1, $2, $3)", user, body.To, body.Cents); err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	c.Status(http.StatusCreated)
}
