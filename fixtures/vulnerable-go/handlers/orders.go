package handlers

import (
	"context"
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
)

var DB *sql.DB

type OrderReq struct {
	Item  string `json:"item"`
	Email string `json:"email"`
}

// CreateOrder inserts an order and emails a receipt.
func CreateOrder(c *gin.Context) {
	var req OrderReq
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad request"})
		return
	}
	var id int64
	err := DB.QueryRowContext(context.Background(), "INSERT INTO orders (item) VALUES ($1) RETURNING id", req.Item).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	go sendReceipt(req.Email, id)
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

// NotifyAll pushes a notification to every id in the body.
func NotifyAll(c *gin.Context) {
	var ids []string
	if err := c.ShouldBindJSON(&ids); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	for _, id := range ids {
		go push(id)
	}
	c.Status(http.StatusAccepted)
}

func sendReceipt(email string, id int64) {}
func push(id string)                      {}
