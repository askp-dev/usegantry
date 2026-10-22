package handlers

import (
	"net/http"
	"os"

	"github.com/gin-gonic/gin"
	openai "github.com/sashabaranov/go-openai"
)

var AI = openai.NewClient(os.Getenv("OPENAI_API_KEY"))

// Summarize forwards any prompt to the model with no limiter and no token cap.
func Summarize(c *gin.Context) {
	user := c.MustGet("user").(string)
	var body struct {
		Text string `json:"text"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	resp, err := AI.CreateChatCompletion(c.Request.Context(), openai.ChatCompletionRequest{
		Model:    openai.GPT4o,
		User:     user,
		Messages: []openai.ChatCompletionMessage{{Role: openai.ChatMessageRoleUser, Content: body.Text}},
	})
	if err != nil {
		c.Status(http.StatusBadGateway)
		return
	}
	c.JSON(http.StatusOK, gin.H{"summary": resp.Choices[0].Message.Content})
}
