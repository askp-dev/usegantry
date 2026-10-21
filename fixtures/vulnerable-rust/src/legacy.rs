use actix_web::{post, web, HttpRequest, HttpResponse, Responder};

#[post("/legacy/import")]
async fn import(req: HttpRequest, body: web::Bytes) -> impl Responder {
    let n: usize = req.match_info().get("n").unwrap().parse().unwrap();
    for chunk in body.chunks(n) {
        actix_rt::spawn(process(chunk.to_vec()));
    }
    HttpResponse::Accepted()
}

async fn process(_chunk: Vec<u8>) {}
