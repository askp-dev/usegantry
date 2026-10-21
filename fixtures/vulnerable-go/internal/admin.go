package internal

import (
	"context"
	"net/http"
	"time"
)

func ServeAdmin() {
	mux := http.NewServeMux()
	mux.HandleFunc("POST /admin/reindex", reindex)
	http.ListenAndServe("127.0.0.1:9090", mux)
}

func reindex(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(context.TODO(), 30*time.Second)
	defer cancel()
	rebuild(ctx)
	w.WriteHeader(http.StatusNoContent)
}

func rebuild(ctx context.Context) {}
