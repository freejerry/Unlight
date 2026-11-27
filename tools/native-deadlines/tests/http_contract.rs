use native_deadlines::router;
use rusqlite::Connection;
use serde_json::{json, Value};
use std::net::SocketAddr;
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::oneshot;
use tokio::task::JoinHandle;
use tokio::time::{sleep, timeout};

const FIRST: &str = "12345678-1234-4abc-8def-123456789abc";
const SECOND: &str = "abcdefab-cdef-4abc-8def-abcdefabcdef";
const UNKNOWN: &str = "fedcbafe-dcba-4abc-8def-fedcbafedcba";
const DELAY_MS: u64 = 8_000;
const IO_TIMEOUT: Duration = Duration::from_secs(5);

struct Server {
    address: SocketAddr,
    shutdown: oneshot::Sender<()>,
    worker: JoinHandle<()>,
}

impl Server {
    async fn start(database: &Path, clock: &Arc<AtomicU64>) -> Self {
        let clock = Arc::clone(clock);
        Self::start_with_clock(database, move || clock.load(Ordering::SeqCst)).await
    }

    async fn start_with_clock(
        database: &Path,
        clock: impl Fn() -> u64 + Send + Sync + 'static,
    ) -> Self {
        let app = router(database, clock).expect("open test database");
        let listener = TcpListener::bind(("127.0.0.1", 0)).await.expect("listen");
        let address = listener.local_addr().expect("bound address");
        let (shutdown, stopped) = oneshot::channel();
        let worker = tokio::spawn(async move {
            axum::serve(listener, app)
                .with_graceful_shutdown(async {
                    let _ = stopped.await;
                })
                .await
                .expect("serve test router");
        });
        Self {
            address,
            shutdown,
            worker,
        }
    }

    async fn send(&self, method: &str, id: &str, body: &str) -> TcpStream {
        timeout(IO_TIMEOUT, async {
            let mut stream = TcpStream::connect(self.address).await.expect("connect");
            let request = format!(
                "{method} /api/searches/{id} HTTP/1.1\r\nHost: 127.0.0.1\r\n\
                 Connection: close\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{body}",
                body.len()
            );
            stream
                .write_all(request.as_bytes())
                .await
                .expect("write request");
            stream
        })
        .await
        .expect("send HTTP request before timeout")
    }

    async fn request(&self, method: &str, id: &str) -> Response {
        Self::read_response(self.send(method, id, "").await).await
    }

    async fn query(&self, body: &Value) -> Response {
        self.query_body(&body.to_string()).await
    }

    async fn query_body(&self, body: &str) -> Response {
        Self::read_response(self.send("POST", "query", body).await).await
    }

    async fn read_response(mut stream: TcpStream) -> Response {
        let mut data = String::new();
        timeout(IO_TIMEOUT, stream.read_to_string(&mut data))
            .await
            .expect("receive HTTP response before timeout")
            .expect("read response");
        let (head, body) = data.split_once("\r\n\r\n").expect("HTTP headers");
        let status = head
            .split_whitespace()
            .nth(1)
            .expect("status code")
            .parse()
            .expect("numeric status");
        let no_store = head.lines().skip(1).any(|line| {
            line.split_once(':').is_some_and(|(name, value)| {
                name.eq_ignore_ascii_case("cache-control")
                    && value.trim().eq_ignore_ascii_case("no-store")
            })
        });
        Response {
            status,
            no_store,
            body: body.to_owned(),
        }
    }

    async fn stop(self) {
        self.shutdown.send(()).expect("server still running");
        timeout(IO_TIMEOUT, self.worker)
            .await
            .expect("server shut down before timeout")
            .expect("server shut down cleanly");
    }
}

struct Response {
    status: u16,
    no_store: bool,
    body: String,
}

impl Response {
    fn json(self, status: u16) -> Value {
        assert_eq!(self.status, status, "{}", self.body);
        assert!(self.no_store, "search response must not be cached");
        serde_json::from_str(&self.body).expect("search JSON response")
    }

    fn search(self, id: &str, find_at_ms: u64, server_now_ms: u64) -> Value {
        let value = self.json(200);
        assert_eq!(value["id"], id);
        assert_eq!(value["find_at_ms"], find_at_ms);
        assert_eq!(value["server_now_ms"], server_now_ms);
        value
    }
}

fn pending(search: Value) {
    assert_eq!(search["status"], "pending");
    assert!(
        search.get("result").is_none(),
        "pending response exposes result: {search}"
    );
}

fn ready(search: Value, id: &str) -> Value {
    assert_eq!(search["status"], "ready");
    assert_eq!(search["result"]["id"], format!("result-{id}"));
    search["result"].clone()
}

#[tokio::test]
async fn put_retry_after_unread_response_preserves_the_first_deadline() {
    let directory = tempfile::tempdir().expect("temporary database directory");
    let database = directory.path().join("searches.sqlite");
    let start = 100_000;
    let clock = Arc::new(AtomicU64::new(start));
    let server = Server::start(&database, &clock).await;
    let missing = server.request("GET", FIRST).await;
    assert_eq!(missing.status, 404);
    assert!(
        missing.no_store,
        "a cached 404 could outlive search creation"
    );
    let invalid = server.request("PUT", "invalid-id").await;
    assert_eq!(invalid.status, 400);
    assert!(invalid.no_store);

    // Send the entire PUT but leave its response unread. A separate GET observes the commit.
    let unread = server.send("PUT", FIRST, "").await;
    let recorded = timeout(IO_TIMEOUT, async {
        loop {
            let attempt = server.request("GET", FIRST).await;
            if attempt.status != 404 {
                break attempt;
            }
            sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .expect("server committed the unread PUT");
    drop(unread);
    let deadline = start + DELAY_MS;
    pending(recorded.search(FIRST, deadline, start));

    let retry_at = start + 1_500;
    clock.store(retry_at, Ordering::SeqCst);
    let retry = server.request("PUT", &FIRST.to_ascii_uppercase()).await;
    pending(retry.search(FIRST, deadline, retry_at));
    pending(
        server
            .request("GET", FIRST)
            .await
            .search(FIRST, deadline, retry_at),
    );
    server.stop().await;
}

#[tokio::test]
async fn searches_complete_in_deadline_order_with_equality_included() {
    let directory = tempfile::tempdir().expect("temporary database directory");
    let database = directory.path().join("searches.sqlite");
    let start = 100_000;
    let clock = Arc::new(AtomicU64::new(start));
    let server = Server::start(&database, &clock).await;
    let first_deadline = start + DELAY_MS;
    pending(
        server
            .request("PUT", FIRST)
            .await
            .search(FIRST, first_deadline, start),
    );

    let second_start = start + 250;
    let second_deadline = second_start + DELAY_MS;
    clock.store(second_start, Ordering::SeqCst);
    pending(
        server
            .request("PUT", SECOND)
            .await
            .search(SECOND, second_deadline, second_start),
    );

    clock.store(first_deadline - 1, Ordering::SeqCst);
    pending(
        server
            .request("GET", FIRST)
            .await
            .search(FIRST, first_deadline, first_deadline - 1),
    );
    clock.store(first_deadline, Ordering::SeqCst);
    ready(
        server
            .request("GET", FIRST)
            .await
            .search(FIRST, first_deadline, first_deadline),
        FIRST,
    );
    pending(
        server
            .request("GET", SECOND)
            .await
            .search(SECOND, second_deadline, first_deadline),
    );

    clock.store(second_deadline - 1, Ordering::SeqCst);
    pending(server.request("GET", SECOND).await.search(
        SECOND,
        second_deadline,
        second_deadline - 1,
    ));
    clock.store(second_deadline, Ordering::SeqCst);
    ready(
        server
            .request("GET", SECOND)
            .await
            .search(SECOND, second_deadline, second_deadline),
        SECOND,
    );
    server.stop().await;
}

#[tokio::test]
async fn completed_result_survives_database_reopen_and_clock_rollback() {
    let directory = tempfile::tempdir().expect("temporary database directory");
    let database = directory.path().join("searches.sqlite");
    let start = 100_000;
    let clock = Arc::new(AtomicU64::new(start));
    let server = Server::start(&database, &clock).await;
    let deadline = start + DELAY_MS;
    pending(
        server
            .request("PUT", FIRST)
            .await
            .search(FIRST, deadline, start),
    );

    clock.store(deadline, Ordering::SeqCst);
    let finished = ready(
        server
            .request("GET", FIRST)
            .await
            .search(FIRST, deadline, deadline),
        FIRST,
    );
    server.stop().await;

    clock.store(start, Ordering::SeqCst);
    let restarted = Server::start(&database, &clock).await;
    let reopened = ready(
        restarted
            .request("GET", FIRST)
            .await
            .search(FIRST, deadline, start),
        FIRST,
    );
    assert_eq!(reopened, finished);
    let replayed = ready(
        restarted
            .request("PUT", FIRST)
            .await
            .search(FIRST, deadline, start),
        FIRST,
    );
    assert_eq!(replayed, finished);
    restarted.stop().await;
}

fn expected_search(id: &str, find_at_ms: u64, now: u64, completed: bool) -> Value {
    let status = if completed { "ready" } else { "pending" };
    let mut search = json!({
        "id": id, "status": status, "find_at_ms": find_at_ms, "server_now_ms": now,
    });
    if completed {
        search["result"] = json!({ "id": format!("result-{id}") });
    }
    search
}

#[tokio::test]
async fn batch_query_preserves_requested_order_and_uses_one_deadline_clock_sample() {
    let directory = tempfile::tempdir().expect("temporary database directory");
    let database = directory.path().join("searches.sqlite");
    let start = 100_000;
    let clock = Arc::new(AtomicU64::new(start));
    let ticking = Arc::clone(&clock);
    let server =
        Server::start_with_clock(&database, move || ticking.fetch_add(1, Ordering::SeqCst)).await;

    let first_deadline = start + DELAY_MS;
    let second_start = start + 250;
    let second_deadline = second_start + DELAY_MS;
    pending(
        server
            .request("PUT", FIRST)
            .await
            .search(FIRST, first_deadline, start),
    );
    clock.store(second_start, Ordering::SeqCst);
    pending(
        server
            .request("PUT", SECOND)
            .await
            .search(SECOND, second_deadline, second_start),
    );

    let query = json!({ "ids": [SECOND.to_ascii_uppercase(), UNKNOWN.to_owned(), FIRST.to_owned(), SECOND.to_owned(), FIRST.to_ascii_uppercase()] });
    for (now, first_ready, second_ready) in [
        (first_deadline - 1, false, false),
        (first_deadline, true, false),
        (second_deadline - 1, true, false),
        (second_deadline, true, true),
    ] {
        clock.store(now, Ordering::SeqCst);
        let actual = server.query(&query).await.json(200);
        assert_eq!(
            actual,
            json!({ "searches": [
            expected_search(SECOND, second_deadline, now, second_ready),
            expected_search(FIRST, first_deadline, now, first_ready),
        ] })
        );
        assert_eq!(
            clock.load(Ordering::SeqCst),
            now + 1,
            "batch sampled its clock more than once"
        );
    }
    assert_eq!(server.request("GET", UNKNOWN).await.status, 404);

    let all_known = server
        .query(&json!({ "ids": vec![FIRST; 16] }))
        .await
        .json(200);
    assert_eq!(all_known["searches"].as_array().expect("results").len(), 1);
    assert_eq!(
        server.query(&json!({ "ids": [] })).await.json(200),
        json!({ "searches": [] })
    );
    server.stop().await;
}

#[tokio::test]
async fn batch_query_rejects_invalid_input_without_completing_or_creating_a_search() {
    let directory = tempfile::tempdir().expect("temporary database directory");
    let database = directory.path().join("searches.sqlite");
    let start = 100_000;
    let clock = Arc::new(AtomicU64::new(start));
    let server = Server::start(&database, &clock).await;
    let deadline = start + DELAY_MS;
    pending(
        server
            .request("PUT", FIRST)
            .await
            .search(FIRST, deadline, start),
    );

    let too_many = json!({ "ids": vec![FIRST; 17] }).to_string();
    let invalid_uuid = json!({ "ids": [FIRST, UNKNOWN, "not-a-uuid"] }).to_string();
    let invalid_type = json!({ "ids": [FIRST, 0] }).to_string();
    for body in [
        invalid_uuid.as_str(),
        too_many.as_str(),
        invalid_type.as_str(),
        "{\"ids\":",
        "{}",
    ] {
        clock.store(deadline, Ordering::SeqCst);
        let error = server.query_body(body).await.json(400);
        assert!(error["error"]
            .as_str()
            .is_some_and(|message| !message.is_empty()));
        // Roll the clock back to detect whether the rejected batch marked the valid ID ready.
        clock.store(deadline - 1, Ordering::SeqCst);
        pending(
            server
                .request("GET", FIRST)
                .await
                .search(FIRST, deadline, deadline - 1),
        );
        assert_eq!(server.request("GET", UNKNOWN).await.status, 404);
    }
    for method in ["GET", "PUT"] {
        assert!(server.request(method, "query").await.json(400)["error"].is_string());
    }
    server.stop().await;
}

#[tokio::test]
async fn batch_query_reopens_the_previous_sqlite_schema_without_migration() {
    let directory = tempfile::tempdir().expect("temporary database directory");
    let database = directory.path().join("searches.sqlite");
    let schema_cookie;
    let deadline = 110_000;
    {
        let previous = Connection::open(&database).expect("create pre-batch SQLite fixture");
        // This is the schema shipped with the single-search HTTP endpoints.
        previous
            .execute_batch(
                "CREATE TABLE searches (
                id TEXT PRIMARY KEY NOT NULL,
                find_at_ms INTEGER NOT NULL,
                ready INTEGER NOT NULL DEFAULT 0 CHECK (ready IN (0, 1))
            );",
            )
            .expect("create the previous schema");
        let seed = "INSERT INTO searches (id, find_at_ms, ready) VALUES (?1, ?2, ?3)";
        previous
            .execute(seed, (FIRST, deadline, true))
            .expect("seed finished search");
        previous
            .execute(seed, (SECOND, deadline, false))
            .expect("seed pending search");
        schema_cookie = previous
            .query_row("PRAGMA schema_version", [], |row| row.get::<_, u32>(0))
            .expect("capture schema cookie before reopening");
    }

    let now = deadline - 1;
    let clock = Arc::new(AtomicU64::new(now));
    let server = Server::start(&database, &clock).await;
    let request = json!({ "ids": [SECOND, UNKNOWN, FIRST] });
    assert_eq!(
        server.query(&request).await.json(200),
        json!({ "searches": [
        expected_search(SECOND, deadline, now, false),
        expected_search(FIRST, deadline, now, true),
    ] })
    );
    clock.store(deadline, Ordering::SeqCst);
    assert_eq!(
        server.query(&request).await.json(200),
        json!({ "searches": [
        expected_search(SECOND, deadline, deadline, true),
        expected_search(FIRST, deadline, deadline, true),
    ] })
    );
    server.stop().await;

    let persisted = Connection::open(&database).expect("reopen verified database");
    let current_cookie = persisted
        .query_row("PRAGMA schema_version", [], |row| row.get::<_, u32>(0))
        .expect("read schema cookie after batch requests");
    assert_eq!(
        current_cookie, schema_cookie,
        "batch upgraded the SQLite schema"
    );
    let ready_count = persisted
        .query_row("SELECT COUNT(*) FROM searches WHERE ready = 1", [], |row| {
            row.get::<_, u32>(0)
        })
        .expect("count persisted ready searches");
    let count = persisted
        .query_row("SELECT COUNT(*) FROM searches", [], |row| {
            row.get::<_, u32>(0)
        })
        .expect("count searches after unknown IDs were queried");
    assert_eq!((ready_count, count), (2, 2));
}
