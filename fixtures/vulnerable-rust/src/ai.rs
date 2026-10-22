use async_openai::{
    config::OpenAIConfig,
    types::{ChatCompletionRequestUserMessageArgs, CreateChatCompletionRequestArgs},
    Client,
};
use axum::{extract::Json, http::StatusCode};
use serde_json::Value;

use crate::billing::AuthUser;

/// POST /chat: signed in, but unthrottled and uncapped.
pub async fn chat(user: AuthUser, Json(body): Json<Value>) -> Result<String, StatusCode> {
    let prompt = body["prompt"].as_str().ok_or(StatusCode::BAD_REQUEST)?;
    let message = ChatCompletionRequestUserMessageArgs::default().content(prompt).build().map_err(|_| StatusCode::BAD_REQUEST)?;
    let request = CreateChatCompletionRequestArgs::default()
        .model("gpt-4o")
        .user(user.id.to_string())
        .messages([message.into()])
        .build()
        .map_err(|_| StatusCode::BAD_REQUEST)?;
    let response = Client::<OpenAIConfig>::new().chat().create(request).await.map_err(|_| StatusCode::BAD_GATEWAY)?;
    Ok(response.choices.first().and_then(|c| c.message.content.clone()).unwrap_or_default())
}
