use axum::{extract::State, http::{HeaderMap, StatusCode}};
use stripe::{EventObject, EventType, Webhook};

use crate::AppState;

/// POST /webhooks/stripe: verified over the raw body, each event id processed once.
pub async fn stripe_webhook(State(state): State<AppState>, headers: HeaderMap, body: String) -> StatusCode {
    let Some(sig) = headers.get("stripe-signature").and_then(|v| v.to_str().ok()) else {
        return StatusCode::BAD_REQUEST;
    };
    let Ok(event) = Webhook::construct_event(&body, sig, &state.webhook_secret) else {
        return StatusCode::BAD_REQUEST;
    };
    let inserted = sqlx::query("INSERT INTO processed_webhook_events (event_id) VALUES ($1) ON CONFLICT (event_id) DO NOTHING")
        .bind(event.id.to_string())
        .execute(&state.pool)
        .await
        .map(|r| r.rows_affected())
        .unwrap_or(0);
    if inserted == 0 {
        return StatusCode::OK;
    }
    if let (EventType::CheckoutSessionCompleted, EventObject::CheckoutSession(session)) = (event.type_, event.data.object) {
        let customer = session.customer.map(|c| c.id().to_string()).unwrap_or_default();
        let _ = sqlx::query("UPDATE accounts SET plan = 'pro' WHERE stripe_customer = $1").bind(customer).execute(&state.pool).await;
    }
    StatusCode::OK
}
