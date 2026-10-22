package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// RenameProject rejects anonymous callers before it writes.
func RenameProject(c *gin.Context) {
	if _, ok := c.Get("user"); !ok {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
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
	c.Status(http.StatusNoContent)
}

// ArchiveProject only deletes the caller's own project.
func ArchiveProject(c *gin.Context) {
	user, ok := c.Get("user")
	if !ok {
		c.AbortWithStatus(http.StatusUnauthorized)
		return
	}
	if _, err := DB.ExecContext(c.Request.Context(), "DELETE FROM projects WHERE id = $1 AND owner = $2", c.Param("id"), user); err != nil {
		c.Status(http.StatusInternalServerError)
		return
	}
	c.Status(http.StatusNoContent)
}
