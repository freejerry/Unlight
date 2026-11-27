mod store;

use std::path::Path as FilePath;
use std::sync::{Arc, Mutex};

use axum::extract::{Path, State};
use axum::http::{header, HeaderValue, StatusCode};
use axum::middleware;
use axum::response::{Html, IntoResponse, Response};
use axum::routing::get;
use axum::{Json, Router};
use serde::Serialize;
use uuid::Uuid;

use store::{Search, Store};

#[derive(Clone)]
struct AppState {
    store: Arc<Mutex<Store>>,
    clock: Arc<dyn Fn() -> u64 + Send + Sync>,
}

/// Serve the browser and API using a SQLite path and a clock in Unix milliseconds.
pub fn router(
    path: impl AsRef<FilePath>,
    clock: impl Fn() -> u64 + Send + Sync + 'static,
) -> rusqlite::Result<Router> {
    let state = AppState {
        store: Arc::new(Mutex::new(Store::open(path.as_ref())?)),
        clock: Arc::new(clock),
    };
    let api = Router::new()
        .route("/api/searches/{id}", get(read_search).put(create_search))
        .route_layer(middleware::map_response(no_store));

    Ok(Router::new()
        .route(
            "/",
            get(|| async { Html(include_str!("../../../web-client/deadline.html")) }),
        )
        .route(
            "/style.css",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "text/css; charset=utf-8")],
                    include_str!("../../../web-client/style.css"),
                )
            }),
        )
        .route(
            "/deadline.css",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "text/css; charset=utf-8")],
                    include_str!("../../../web-client/deadline.css"),
                )
            }),
        )
        .route(
            "/deadline.js",
            get(|| async {
                (
                    [(header::CONTENT_TYPE, "text/javascript; charset=utf-8")],
                    include_str!("../../../web-client/deadline.js"),
                )
            }),
        )
        .merge(api)
        .with_state(state))
}

async fn read_search(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Search>, ApiError> {
    access_search(state, id, false).await.map(Json)
}

async fn create_search(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> Result<Json<Search>, ApiError> {
    access_search(state, id, true).await.map(Json)
}

async fn no_store(mut response: Response) -> Response {
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

async fn access_search(state: AppState, id: String, create: bool) -> Result<Search, ApiError> {
    let id = Uuid::parse_str(&id).map_err(|_| ApiError::InvalidId)?;
    tokio::task::spawn_blocking(move || {
        let mut store = state.store.lock().map_err(|_| ApiError::Storage)?;
        let now_ms = (state.clock)();
        store
            .access(id, now_ms, create)
            .map_err(|error| {
                eprintln!("Timed search storage failed: {error}");
                ApiError::Storage
            })?
            .ok_or(ApiError::Missing)
    })
    .await
    .map_err(|_| ApiError::Storage)?
}

enum ApiError {
    InvalidId,
    Missing,
    Storage,
}

#[derive(Serialize)]
struct ErrorBody {
    error: &'static str,
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, error) = match self {
            Self::InvalidId => (StatusCode::BAD_REQUEST, "Invalid search ID"),
            Self::Missing => (StatusCode::NOT_FOUND, "Search not found"),
            Self::Storage => (StatusCode::INTERNAL_SERVER_ERROR, "Search unavailable"),
        };
        (status, Json(ErrorBody { error })).into_response()
    }
}
