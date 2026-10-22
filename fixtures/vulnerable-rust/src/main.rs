use std::sync::{Arc, Mutex};

use axum::{
    extract::{Json, Path, State},
    http::HeaderMap,
    routing::{get, post},
    Router,
};
use serde_json::Value;

mod ai;
mod billing;
mod legacy;

#[derive(Clone)]
struct AppState {
    db: Arc<Mutex<Vec<String>>>,
    pool: sqlx::PgPool,
}

#[tokio::main]
async fn main() {
    let pool = sqlx::PgPool::connect_lazy(&std::env::var("DATABASE_URL").unwrap_or_default()).unwrap();
    let state = AppState { db: Arc::new(Mutex::new(Vec::new())), pool };
    let app = Router::new()
        .route("/healthz", get(health))
        .route("/users/:id", get(get_user).post(update_user))
        .route("/jobs", post(create_job))
        .route("/notes", post(billing::create_note))
        .route("/payouts", post(billing::create_payout))
        .route("/webhooks/stripe", post(billing::stripe_webhook))
        .route("/chat", post(ai::chat))
        .with_state(state);
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health() -> &'static str {
    "ok"
}

async fn get_user(State(state): State<AppState>, Path(id): Path<String>) -> String {
    let uid: usize = id.parse().unwrap();
    let db = state.db.lock().unwrap();
    db.get(uid).cloned().unwrap_or_default()
}

async fn update_user(Path(id): Path<u64>, headers: HeaderMap, Json(body): Json<Value>) -> String {
    let name = body.get("name").expect("name is required");
    let token = headers.get("x-token").unwrap().to_str().unwrap();
    format!("{id} {name} {token}")
}

async fn create_job(Json(job): Json<Value>) -> &'static str {
    tokio::spawn(async move {
        run(job).await;
    });
    "queued"
}

async fn run(_job: Value) {}
