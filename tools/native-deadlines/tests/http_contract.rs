use native_deadlines::router;
use serde_json::Value;
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
        let app =
            router(database, move || clock.load(Ordering::SeqCst)).expect("open test database");
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

    async fn send(&self, method: &str, id: &str) -> TcpStream {
        timeout(IO_TIMEOUT, async {
            let mut stream = TcpStream::connect(self.address).await.expect("connect");
            let request = format!(
                "{method} /api/searches/{id} HTTP/1.1\r\nHost: 127.0.0.1\r\n\
                 Connection: close\r\nContent-Length: 0\r\n\r\n"
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
        let mut stream = self.send(method, id).await;
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
    fn search(self, id: &str, find_at_ms: u64, server_now_ms: u64) -> Value {
        assert_eq!(self.status, 200, "{}", self.body);
        assert!(self.no_store, "search response must not be cached");
        let value: Value = serde_json::from_str(&self.body).expect("search JSON response");
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
    let unread = server.send("PUT", FIRST).await;
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
