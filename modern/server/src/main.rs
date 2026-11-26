use std::{
    collections::HashMap,
    env,
    net::{IpAddr, SocketAddr},
    sync::Arc,
    time::{Duration, Instant},
};

use axum::{
    extract::{
        rejection::JsonRejection,
        ws::{Message, WebSocket},
        DefaultBodyLimit, Path, State, WebSocketUpgrade,
    },
    http::StatusCode,
    response::{IntoResponse, Response},
    routing::{any, get, post},
    Json, Router,
};
use naval_engine::{Action, Game, GameView};
use serde::{Deserialize, Serialize};
use tokio::sync::{watch, Mutex};
use tower_http::services::ServeDir;
use uuid::Uuid;

#[cfg(test)]
mod tests;

const MAX_MATCHES: usize = 256;
const MATCH_IDLE_LIMIT: Duration = Duration::from_secs(2 * 60 * 60);
const MAX_INPUT_BYTES: usize = 8 * 1024;

type Matches = Arc<Mutex<HashMap<Uuid, Match>>>;
type ApiResult<T> = Result<T, ApiError>;

#[derive(Serialize)]
struct Snapshot {
    id: Uuid,
    seed: u32,
    view: GameView,
    history: Vec<Action>,
}

struct Match {
    game: Game,
    seed: u32,
    snapshots: watch::Sender<Arc<Snapshot>>,
    last_activity: Instant,
}

#[derive(Deserialize)]
struct CreateMatch {
    seed: Option<u32>,
}

#[derive(Deserialize)]
struct UpdateMatch {
    revision: u64,
    #[serde(flatten)]
    action: Action,
}

struct ApiError(StatusCode, String);

impl ApiError {
    fn match_missing() -> Self {
        Self(StatusCode::NOT_FOUND, "找不到這場對局。".into())
    }
}

impl From<JsonRejection> for ApiError {
    fn from(error: JsonRejection) -> Self {
        Self(error.status(), "無法讀取請求中的資料。".into())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(serde_json::json!({ "error": self.1 }))).into_response()
    }
}

fn api_routes(matches: Matches) -> Router {
    Router::new()
        .route(
            "/api/health",
            get(|| async { Json(serde_json::json!({ "ok": true })) }),
        )
        .route("/api/matches", post(create_match))
        .route("/api/matches/{id}", get(get_match))
        .route("/api/matches/{id}/actions", post(update_match))
        .route("/api/matches/{id}/ws", get(upgrade_match_socket))
        .route(
            "/api/{*path}",
            any(|| async { ApiError(StatusCode::NOT_FOUND, "找不到這個 API。".into()) }),
        )
        .layer(DefaultBodyLimit::max(MAX_INPUT_BYTES))
        .with_state(matches)
}

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let host: IpAddr = env::var("HOST")
        .unwrap_or_else(|_| "127.0.0.1".into())
        .parse()?;
    let port: u16 = env::var("PORT").unwrap_or_else(|_| "3000".into()).parse()?;
    let web_dist = env::var("WEB_DIST").unwrap_or_else(|_| "web/dist".into());
    let listener = tokio::net::TcpListener::bind(SocketAddr::new(host, port)).await?;

    println!("霧潮航線 · http://{}", listener.local_addr()?);
    let app = api_routes(Matches::default()).fallback_service(ServeDir::new(web_dist));
    axum::serve(listener, app).await?;
    Ok(())
}

async fn create_match(
    State(matches): State<Matches>,
    input: Result<Option<Json<CreateMatch>>, JsonRejection>,
) -> ApiResult<(StatusCode, Json<Arc<Snapshot>>)> {
    let input = input?;
    let now = Instant::now();
    let mut matches = matches.lock().await;
    matches
        .retain(|_, entry| now.saturating_duration_since(entry.last_activity) < MATCH_IDLE_LIMIT);
    if matches.len() >= MAX_MATCHES {
        return Err(ApiError(
            StatusCode::SERVICE_UNAVAILABLE,
            "目前對局已滿，請稍後再試。".into(),
        ));
    }

    let id = Uuid::new_v4();
    let seed = input
        .and_then(|Json(input)| input.seed)
        .unwrap_or(id.as_u128() as u32);
    let game = Game::new(seed);
    let snapshot = Arc::new(Snapshot {
        id,
        seed,
        view: game.view(),
        history: Vec::new(),
    });
    let (snapshots, _) = watch::channel(Arc::clone(&snapshot));
    matches.insert(
        id,
        Match {
            game,
            seed,
            snapshots,
            last_activity: now,
        },
    );
    Ok((StatusCode::CREATED, Json(snapshot)))
}

async fn get_match(
    State(matches): State<Matches>,
    Path(id): Path<String>,
) -> ApiResult<Json<Arc<Snapshot>>> {
    let id = Uuid::parse_str(&id).map_err(|_| ApiError::match_missing())?;
    let mut matches = matches.lock().await;
    let entry = matches.get_mut(&id).ok_or_else(ApiError::match_missing)?;
    entry.last_activity = Instant::now();
    let snapshot = Arc::clone(&entry.snapshots.borrow());
    Ok(Json(snapshot))
}

async fn update_match(
    State(matches): State<Matches>,
    Path(id): Path<String>,
    input: Result<Json<UpdateMatch>, JsonRejection>,
) -> ApiResult<Json<Arc<Snapshot>>> {
    let id = Uuid::parse_str(&id).map_err(|_| ApiError::match_missing())?;
    let Json(input) = input?;
    apply_action(&matches, id, input).await.map(Json)
}

async fn apply_action(matches: &Matches, id: Uuid, input: UpdateMatch) -> ApiResult<Arc<Snapshot>> {
    let mut matches = matches.lock().await;
    let entry = matches.get_mut(&id).ok_or_else(ApiError::match_missing)?;
    if u64::from(entry.snapshots.borrow().view.revision) != input.revision {
        return Err(ApiError(StatusCode::CONFLICT, "對局狀態已變更。".into()));
    }
    entry
        .game
        .apply(input.action.clone())
        .map_err(|message| ApiError(StatusCode::UNPROCESSABLE_ENTITY, message))?;

    let mut history = entry.snapshots.borrow().history.clone();
    history.push(input.action);
    let snapshot = Arc::new(Snapshot {
        id,
        seed: entry.seed,
        view: entry.game.view(),
        history,
    });
    entry.last_activity = Instant::now();
    entry.snapshots.send_replace(Arc::clone(&snapshot));
    Ok(snapshot)
}

async fn upgrade_match_socket(
    State(matches): State<Matches>,
    Path(id): Path<String>,
    upgrade: WebSocketUpgrade,
) -> ApiResult<Response> {
    let id = Uuid::parse_str(&id).map_err(|_| ApiError::match_missing())?;
    let receiver = {
        let mut matches = matches.lock().await;
        let entry = matches.get_mut(&id).ok_or_else(ApiError::match_missing)?;
        entry.last_activity = Instant::now();
        entry.snapshots.subscribe()
    };
    Ok(upgrade
        .max_message_size(MAX_INPUT_BYTES)
        .on_upgrade(move |socket| observe_match(socket, receiver, matches, id)))
}

async fn observe_match(
    mut socket: WebSocket,
    mut snapshots: watch::Receiver<Arc<Snapshot>>,
    matches: Matches,
    id: Uuid,
) {
    let initial = Arc::clone(&snapshots.borrow_and_update());
    if send_json(&mut socket, &initial).await.is_err() {
        return;
    }

    loop {
        tokio::select! {
            change = snapshots.changed() => {
                if change.is_err() {
                    break;
                }
                let snapshot = Arc::clone(&snapshots.borrow_and_update());
                if send_json(&mut socket, &snapshot).await.is_err() {
                    break;
                }
            }
            incoming = socket.recv() => {
                let response = match incoming {
                    Some(Ok(Message::Text(command))) => match serde_json::from_str(&command) {
                        Ok(input) => apply_action(&matches, id, input).await.err(),
                        Err(_) => Some(ApiError(StatusCode::UNPROCESSABLE_ENTITY, "無法讀取操作。".into())),
                    },
                    Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                    _ => None,
                };
                if let Some(ApiError(status, message)) = response {
                    let error = serde_json::json!({ "error": message, "status": status.as_u16() });
                    if send_json(&mut socket, &error).await.is_err() {
                        break;
                    }
                }
            }
        }
    }
}

async fn send_json(socket: &mut WebSocket, value: &impl Serialize) -> Result<(), ()> {
    let text = serde_json::to_string(value).map_err(|_| ())?;
    socket
        .send(Message::Text(text.into()))
        .await
        .map_err(|_| ())
}
