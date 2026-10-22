package handlers

import (
	"context"
	"database/sql"
	"net/http"

	"github.com/gin-gonic/gin"
	"golang.org/x/sync/errgroup"
)

var DB *sql.DB

type OrderReq struct {
	Item  string `json:"item"`
	Email string `json:"email"`
}

type receipt struct {
	email string
	id    int64
}

var receipts = make(chan receipt, 256)
var sem = make(chan struct{}, 16)

// ReceiptWorker drains the bounded receipt queue.
func ReceiptWorker() {
	for r := range receipts {
		sendReceipt(r.email, r.id)
	}
}

// CreateOrder inserts an order for the signed-in user, once per Idempotency-Key, and queues a receipt.
func CreateOrder(c *gin.Context) {
	user, ok := c.Get("user")
	if !ok {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	key := c.GetHeader("Idempotency-Key")
	var req OrderReq
	if err := c.ShouldBindJSON(&req); err != nil || key == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "bad request"})
		return
	}
	var id int64
	err := DB.QueryRowContext(c.Request.Context(), "INSERT INTO orders (owner, item, idempotency_key) VALUES ($1, $2, $3) ON CONFLICT (idempotency_key) DO NOTHING RETURNING id", user, req.Item, key).Scan(&id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "db"})
		return
	}
	select {
	case receipts <- receipt{req.Email, id}:
	default:
		c.JSON(http.StatusServiceUnavailable, gin.H{"error": "busy"})
		return
	}
	c.JSON(http.StatusCreated, gin.H{"id": id})
}

// NotifyAll fans out with a concurrency limit.
func NotifyAll(c *gin.Context) {
	var ids []string
	if err := c.ShouldBindJSON(&ids); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	g, ctx := errgroup.WithContext(c.Request.Context())
	g.SetLimit(8)
	for _, id := range ids {
		g.Go(func() error { return push(ctx, id) })
	}
	if err := g.Wait(); err != nil {
		c.Status(http.StatusBadGateway)
		return
	}
	c.Status(http.StatusAccepted)
}

// Audit writes an audit row after the response, bounded by a semaphore.
func Audit(c *gin.Context) {
	ctx := context.WithoutCancel(c.Request.Context())
	select {
	case sem <- struct{}{}:
	default:
		c.Status(http.StatusTooManyRequests)
		return
	}
	go func() {
		defer func() { <-sem }()
		writeAudit(ctx)
	}()
	c.Status(http.StatusAccepted)
}

func sendReceipt(email string, id int64)             {}
func push(ctx context.Context, id string) error      { return nil }
func writeAudit(ctx context.Context)                 {}
