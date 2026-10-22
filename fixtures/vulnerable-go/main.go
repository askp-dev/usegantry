package main

import (
	"net/http"

	"example.com/shop/handlers"
	"example.com/shop/internal"
	"github.com/gin-gonic/gin"
)

func main() {
	r := gin.Default()
	r.GET("/healthz", func(c *gin.Context) { c.String(http.StatusOK, "ok") })

	api := r.Group("/api")
	api.POST("/orders", handlers.CreateOrder)
	api.POST("/notify", handlers.NotifyAll)
	api.PATCH("/projects/:id", handlers.RenameProject)
	api.DELETE("/projects/:id", handlers.ArchiveProject)
	api.POST("/summarize", handlers.Summarize)
	api.POST("/transfers", handlers.CreateTransfer)
	r.POST("/webhooks/stripe", handlers.StripeWebhook)

	go internal.ServeAdmin()
	r.Run(":8080")
}
