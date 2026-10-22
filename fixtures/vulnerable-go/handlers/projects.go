package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// RenameProject writes first and only then checks the session.
func RenameProject(c *gin.Context) {
	var body struct {
		Name string `json:"name"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	if _, err := DB.ExecContext(c.Request.Context(), "UPDATE projects SET name = $1 WHERE id = $2", body.Name, c.Param("id")); err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	if _, ok := c.Get("user"); !ok {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	c.Status(http.StatusNoContent)
}

// ArchiveProject reads the user but never rejects when it's missing.
func ArchiveProject(c *gin.Context) {
	user, _ := c.Get("user")
	var body struct {
		Reason string `json:"reason"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.Status(http.StatusBadRequest)
		return
	}
	DB.ExecContext(c.Request.Context(), "DELETE FROM projects WHERE id = $1 AND owner = $2", c.Param("id"), user)
	c.Status(http.StatusNoContent)
}
