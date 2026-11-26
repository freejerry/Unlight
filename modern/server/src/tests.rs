use axum::{
    body::{to_bytes, Body},
    http::{Method, Request},
};
use serde_json::{json, Value};
use tower::ServiceExt;

use super::*;

async fn request(
    router: &Router,
    method: Method,
    path: &str,
    data: Option<Value>,
) -> (StatusCode, Value) {
    let request = Request::builder().method(method).uri(path);
    let request = match data {
        Some(value) => request
            .header("content-type", "application/json")
            .body(Body::from(value.to_string())),
        None => request.body(Body::empty()),
    };
    let response = router.clone().oneshot(request.unwrap()).await.unwrap();
    let status = response.status();
    let bytes = to_bytes(response.into_body(), 64 * 1024).await.unwrap();
    (status, serde_json::from_slice(&bytes).unwrap())
}

#[tokio::test]
async fn starts_match_with_optional_seed_and_retrieves_snapshot() {
    let app = api_routes(Matches::default());
    let (status, health) = request(&app, Method::GET, "/api/health", None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(health, json!({ "ok": true }));

    let (status, generated) = request(&app, Method::POST, "/api/matches", None).await;
    assert_eq!(status, StatusCode::CREATED);
    assert!(generated["seed"].is_u64());

    let (status, initial) = request(
        &app,
        Method::POST,
        "/api/matches",
        Some(json!({ "seed": 73 })),
    )
    .await;
    assert_eq!(status, StatusCode::CREATED);
    assert_eq!(initial["seed"], 73);
    assert_eq!(initial["view"]["status"], "playing");
    assert_eq!(initial["history"], json!([]));
    let path = format!("/api/matches/{}", initial["id"].as_str().unwrap());
    let (status, lookup) = request(&app, Method::GET, &path, None).await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(lookup, initial);
}

#[tokio::test]
async fn rejects_duplicate_and_invalid_actions_without_changing_match() {
    let app = api_routes(Matches::default());
    let (_, initial) = request(
        &app,
        Method::POST,
        "/api/matches",
        Some(json!({ "seed": 73 })),
    )
    .await;
    let path = format!("/api/matches/{}", initial["id"].as_str().unwrap());
    let action_path = format!("{path}/actions");
    let revision = initial["view"]["revision"].as_u64().unwrap();
    let end_turn = json!({ "type": "end_turn", "revision": revision });
    let ((first, first_body), (second, second_body)) = tokio::join!(
        request(&app, Method::POST, &action_path, Some(end_turn.clone())),
        request(&app, Method::POST, &action_path, Some(end_turn)),
    );
    let (current, conflict) = match (first, second) {
        (StatusCode::OK, StatusCode::CONFLICT) => (first_body, second_body),
        (StatusCode::CONFLICT, StatusCode::OK) => (second_body, first_body),
        statuses => panic!("unexpected duplicate action statuses: {statuses:?}"),
    };
    assert!(conflict["error"].is_string());
    assert_eq!(current["view"]["revision"], revision + 1);
    assert_eq!(current["history"], json!([{ "type": "end_turn" }]));

    let invalid = json!({
        "type": "play",
        "card_id": "card-not-in-hand",
        "revision": revision + 1,
    });
    let (status, body) = request(&app, Method::POST, &action_path, Some(invalid)).await;
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY);
    assert!(body["error"].is_string());
    let (_, lookup) = request(&app, Method::GET, &path, None).await;
    assert_eq!(lookup, current);
}
