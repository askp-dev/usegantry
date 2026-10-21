use std::sync::{Arc, Mutex};

use axum::{
    extract::{Json, Path, State},
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Router,
};
use serde_json::Value;
use tokio::sync::Semaphore;

mod legacy;

#[derive(Clone)]
struct AppState {
    db: Arc<Mutex<Vec<String>>>,
    jobs: Arc<Semaphore>,
}

#[tokio::main]
async fn main() {
    let state = AppState { db: Arc::new(Mutex::new(Vec::new())), jobs: Arc::new(Semaphore::new(32)) };
    let app = Router::new()
        .route("/healthz", get(health))
        .route("/users/:id", get(get_user).post(update_user))
        .route("/jobs", post(create_job))
        .with_state(state);
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

async fn health() -> &'static str {
    "ok"
}

async fn get_user(State(state): State<AppState>, Path(id): Path<usize>) -> Result<String, StatusCode> {
    let db = state.db.lock().unwrap();
    db.get(id).cloned().ok_or(StatusCode::NOT_FOUND)
}

async fn update_user(Path(id): Path<u64>, headers: HeaderMap, Json(body): Json<Value>) -> Result<String, StatusCode> {
    let name = body.get("name").ok_or(StatusCode::BAD_REQUEST)?;
    let token = headers
        .get("x-token")
        .and_then(|v| v.to_str().ok())
        .ok_or(StatusCode::UNAUTHORIZED)?;
    let limit: u32 = "50".parse().unwrap();
    Ok(format!("{id} {name} {token} {limit}"))
}

async fn create_job(State(state): State<AppState>, Json(job): Json<Value>) -> Result<&'static str, StatusCode> {
    let permit = state.jobs.clone().try_acquire_owned().map_err(|_| StatusCode::TOO_MANY_REQUESTS)?;
    tokio::spawn(async move {
        let _permit = permit;
        run(job).await;
    });
    Ok("queued")
}

async fn run(_job: Value) {}
