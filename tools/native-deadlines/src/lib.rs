mod store;

use std::path::Path as FilePath;
use std::sync::{Arc, Mutex};

use axum::extract::{rejection::JsonRejection, Path, State};
use axum::http::{header, HeaderValue, StatusCode};
use axum::middleware;
use axum::response::{Html, IntoResponse, Response};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use store::{Search, Store};

const MAX_QUERY_IDS: usize = 16;

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
        .route(
            "/api/searches/query",
            post(query_searches)
                .get(invalid_route_id)
                .put(invalid_route_id),
        )
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

#[derive(Deserialize)]
struct SearchQuery {
    ids: Vec<String>,
}

#[derive(Serialize)]
struct SearchQueryResult {
    searches: Vec<Search>,
}

async fn query_searches(
    State(state): State<AppState>,
    body: Result<Json<SearchQuery>, JsonRejection>,
) -> Result<Json<SearchQueryResult>, ApiError> {
    let Json(query) = body.map_err(|_| ApiError::InvalidQuery)?;
    if query.ids.len() > MAX_QUERY_IDS {
        return Err(ApiError::TooManyIds);
    }

    let mut ids = Vec::with_capacity(query.ids.len());
    for id in query.ids {
        let id = parse_id(&id)?;
        if !ids.contains(&id) {
            ids.push(id);
        }
    }

    let searches = state
        .with_store(move |store, now_ms| store.query(&ids, now_ms))
        .await?;
    Ok(Json(SearchQueryResult { searches }))
}

async fn invalid_route_id() -> ApiError {
    ApiError::InvalidId
}

async fn no_store(mut response: Response) -> Response {
    response
        .headers_mut()
        .insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    response
}

async fn access_search(state: AppState, id: String, create: bool) -> Result<Search, ApiError> {
    let id = parse_id(&id)?;
    state
        .with_store(move |store, now_ms| store.access(id, now_ms, create))
        .await?
        .ok_or(ApiError::Missing)
}

fn parse_id(id: &str) -> Result<Uuid, ApiError> {
    Uuid::parse_str(id).map_err(|_| ApiError::InvalidId)
}

impl AppState {
    async fn with_store<T: Send + 'static>(
        self,
        operation: impl FnOnce(&mut Store, u64) -> rusqlite::Result<T> + Send + 'static,
    ) -> Result<T, ApiError> {
        tokio::task::spawn_blocking(move || {
            let mut store = self.store.lock().map_err(|_| ApiError::Storage)?;
            let now_ms = (self.clock)();
            operation(&mut store, now_ms).map_err(|error| {
                eprintln!("Timed search storage failed: {error}");
                ApiError::Storage
            })
        })
        .await
        .map_err(|_| ApiError::Storage)?
    }
}

enum ApiError {
    InvalidId,
    InvalidQuery,
    TooManyIds,
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
            Self::InvalidQuery => (StatusCode::BAD_REQUEST, "Invalid search query"),
            Self::TooManyIds => (
                StatusCode::BAD_REQUEST,
                "A search query accepts up to 16 IDs",
            ),
            Self::Missing => (StatusCode::NOT_FOUND, "Search not found"),
            Self::Storage => (StatusCode::INTERNAL_SERVER_ERROR, "Search unavailable"),
        };
        (status, Json(ErrorBody { error })).into_response()
    }
}
