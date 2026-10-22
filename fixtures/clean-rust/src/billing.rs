use axum::{
    extract::{Json, State},
    http::{HeaderMap, StatusCode},
};
use serde_json::Value;

use crate::AppState;

/// Extractor that rejects with 401 when the session cookie is missing or invalid.
pub struct AuthUser {
    pub id: i64,
}

/// POST /notes: only for signed-in users.
pub async fn create_note(user: AuthUser, State(state): State<AppState>, Json(body): Json<Value>) -> StatusCode {
    let text = body["text"].as_str().unwrap_or_default().to_string();
    match sqlx::query("INSERT INTO notes (owner, body) VALUES ($1, $2)").bind(user.id).bind(text).execute(&state.pool).await {
        Ok(_) => StatusCode::CREATED,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

/// POST /payouts: one payout per Idempotency-Key.
pub async fn create_payout(user: AuthUser, State(state): State<AppState>, headers: HeaderMap, Json(body): Json<Value>) -> StatusCode {
    let Some(key) = headers.get("idempotency-key").and_then(|v| v.to_str().ok()) else {
        return StatusCode::BAD_REQUEST;
    };
    let cents = body["cents"].as_i64().unwrap_or(0);
    let sql = "INSERT INTO payouts (user_id, cents, idempotency_key) VALUES ($1, $2, $3) ON CONFLICT (idempotency_key) DO NOTHING";
    match sqlx::query(sql).bind(user.id).bind(cents).bind(key).execute(&state.pool).await {
        Ok(_) => StatusCode::CREATED,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}
