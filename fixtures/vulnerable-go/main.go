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

	go internal.ServeAdmin()
	r.Run(":8080")
}
