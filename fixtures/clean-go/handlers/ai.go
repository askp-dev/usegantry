package handlers

import (
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	openai "github.com/sashabaranov/go-openai"
	"golang.org/x/time/rate"
)

var AI = openai.NewClient(os.Getenv("OPENAI_API_KEY"))
var summarizeLimiter = rate.NewLimiter(rate.Limit(5), 10)

// Summarize is throttled, size-capped and token-capped.
func Summarize(c *gin.Context) {
	user := c.MustGet("user").(string)
	if !summarizeLimiter.Allow() {
		c.AbortWithStatus(http.StatusTooManyRequests)
		return
	}
	c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, 16<<10)
	var body struct {
		Text string `json:"text"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.Text) > 8000 {
		c.Status(http.StatusBadRequest)
		return
	}
	resp, err := AI.CreateChatCompletion(c.Request.Context(), openai.ChatCompletionRequest{
		Model:     openai.GPT4o,
		User:      user,
		MaxTokens: 512,
		Messages:  []openai.ChatCompletionMessage{{Role: openai.ChatMessageRoleUser, Content: body.Text}},
	})
	if err != nil {
		c.Status(http.StatusBadGateway)
		return
	}
	c.JSON(http.StatusOK, gin.H{"summary": resp.Choices[0].Message.Content})
}
