use actix_web::{error::ErrorBadRequest, post, web, HttpRequest, HttpResponse, Result};
use futures::stream::{self, StreamExt};

#[post("/legacy/import")]
async fn import(req: HttpRequest, body: web::Bytes) -> Result<HttpResponse> {
    let n: usize = req
        .match_info()
        .get("n")
        .ok_or_else(|| ErrorBadRequest("n"))?
        .parse()
        .map_err(|_| ErrorBadRequest("n"))?;
    stream::iter(body.chunks(n.max(1)).map(|c| c.to_vec()))
        .for_each_concurrent(4, process)
        .await;
    Ok(HttpResponse::Accepted().finish())
}

async fn process(_chunk: Vec<u8>) {}
