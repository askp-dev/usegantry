package main

import (
	"net/http"

	"example.com/shop/handlers"
	"github.com/gin-gonic/gin"
)

func main() {
	// Background workers are started once at boot, not per request.
	for i := 0; i < 4; i++ {
		go handlers.ReceiptWorker()
	}
	r := gin.Default()
	r.GET("/healthz", func(c *gin.Context) { c.String(http.StatusOK, "ok") })

	api := r.Group("/api")
	api.POST("/orders", handlers.CreateOrder)
	api.POST("/notify", handlers.NotifyAll)
	api.POST("/audit", handlers.Audit)
	api.PATCH("/projects/:id", handlers.RenameProject)
	api.DELETE("/projects/:id", handlers.ArchiveProject)
	api.POST("/summarize", handlers.Summarize)
	api.POST("/transfers", handlers.CreateTransfer)
	r.POST("/webhooks/stripe", handlers.StripeWebhook)
	r.Run(":8080")
}
