use axum::{
    extract::{Json, State},
    http::StatusCode,
};
use serde_json::Value;

use crate::AppState;

/// Extractor that rejects with 401 when the session cookie is missing or invalid.
pub struct AuthUser {
    pub id: i64,
}

/// POST /notes: writes with no session at all.
pub async fn create_note(State(state): State<AppState>, Json(body): Json<Value>) -> StatusCode {
    let text = body["text"].as_str().unwrap_or_default().to_string();
    match sqlx::query("INSERT INTO notes (body) VALUES ($1)").bind(text).execute(&state.pool).await {
        Ok(_) => StatusCode::CREATED,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

/// POST /payouts: a retried request pays out twice.
pub async fn create_payout(user: AuthUser, State(state): State<AppState>, Json(body): Json<Value>) -> StatusCode {
    let cents = body["cents"].as_i64().unwrap_or(0);
    match sqlx::query("INSERT INTO payouts (user_id, cents) VALUES ($1, $2)").bind(user.id).bind(cents).execute(&state.pool).await {
        Ok(_) => StatusCode::CREATED,
        Err(_) => StatusCode::INTERNAL_SERVER_ERROR,
    }
}

/// POST /webhooks/stripe: trusts the JSON body as-is and re-grants on every retry.
pub async fn stripe_webhook(State(state): State<AppState>, Json(event): Json<Value>) -> StatusCode {
    if event["type"] == "checkout.session.completed" {
        let customer = event["data"]["object"]["customer"].as_str().unwrap_or_default().to_string();
        let _ = sqlx::query("UPDATE accounts SET plan = 'pro' WHERE stripe_customer = $1").bind(customer).execute(&state.pool).await;
    }
    StatusCode::OK
}
