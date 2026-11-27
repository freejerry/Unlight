use std::path::Path;
use std::time::Duration;

use rusqlite::{params, Connection, OptionalExtension, TransactionBehavior};
use serde::Serialize;
use uuid::Uuid;

const SEARCH_DURATION_MS: u64 = 8_000;

pub(crate) struct Store(Connection);

#[derive(Debug, Serialize)]
pub(crate) struct Search {
    id: String,
    status: Status,
    find_at_ms: u64,
    server_now_ms: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<SearchResult>,
}

#[derive(Debug, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
enum Status {
    Pending,
    Ready,
}

#[derive(Debug, Serialize)]
struct SearchResult {
    id: String,
}

impl Store {
    pub(crate) fn open(path: &Path) -> rusqlite::Result<Self> {
        let connection = Connection::open(path)?;
        connection.busy_timeout(Duration::from_secs(5))?;
        connection.execute_batch(
            "CREATE TABLE IF NOT EXISTS searches (
                id TEXT PRIMARY KEY NOT NULL,
                find_at_ms INTEGER NOT NULL,
                ready INTEGER NOT NULL DEFAULT 0 CHECK (ready IN (0, 1))
            );",
        )?;
        Ok(Self(connection))
    }

    pub(crate) fn access(
        &mut self,
        id: Uuid,
        now_ms: u64,
        create: bool,
    ) -> rusqlite::Result<Option<Search>> {
        let id = id.to_string();
        let transaction = self
            .0
            .transaction_with_behavior(TransactionBehavior::Immediate)?;

        if create {
            let find_at_ms = now_ms.saturating_add(SEARCH_DURATION_MS);
            transaction.execute(
                "INSERT INTO searches (id, find_at_ms) VALUES (?1, ?2)
                 ON CONFLICT(id) DO NOTHING",
                params![id, find_at_ms],
            )?;
        }

        let existing = transaction
            .query_row(
                "SELECT find_at_ms, ready FROM searches WHERE id = ?1",
                [&id],
                |row| Ok((row.get::<_, u64>(0)?, row.get::<_, bool>(1)?)),
            )
            .optional()?;
        let Some((find_at_ms, was_ready)) = existing else {
            return Ok(None);
        };

        let ready = was_ready || now_ms >= find_at_ms;
        if ready && !was_ready {
            transaction.execute("UPDATE searches SET ready = 1 WHERE id = ?1", [&id])?;
        }
        transaction.commit()?;

        let (status, result) = if ready {
            (
                Status::Ready,
                Some(SearchResult {
                    id: format!("result-{id}"),
                }),
            )
        } else {
            (Status::Pending, None)
        };

        Ok(Some(Search {
            id,
            status,
            find_at_ms,
            server_now_ms: now_ms,
            result,
        }))
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, Barrier};

    use super::*;

    const ID: Uuid = Uuid::from_u128(1);
    const START_MS: u64 = 10_000;

    #[test]
    fn deadline_boundary_and_reopen_keep_same_result() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("searches.sqlite3");
        let mut store = Store::open(&path).unwrap();
        assert!(store.access(ID, START_MS, false).unwrap().is_none());

        let initial = store.access(ID, START_MS, true).unwrap().unwrap();
        let deadline = initial.find_at_ms;
        assert_eq!(deadline, START_MS + SEARCH_DURATION_MS);
        assert_eq!(initial.status, Status::Pending);
        assert!(initial.result.is_none());

        let duplicate = store.access(ID, deadline - 1, true).unwrap().unwrap();
        assert_eq!(duplicate.find_at_ms, deadline);
        assert_eq!(duplicate.server_now_ms, deadline - 1);
        assert_eq!(duplicate.status, Status::Pending);
        assert!(duplicate.result.is_none());
        drop(store);

        let mut store = Store::open(&path).unwrap();
        let ready = store.access(ID, deadline, false).unwrap().unwrap();
        assert_eq!(ready.status, Status::Ready);
        assert_eq!(ready.server_now_ms, deadline);
        let result_id = ready.result.unwrap().id;
        drop(store);

        let mut store = Store::open(&path).unwrap();
        let reopened = store.access(ID, START_MS - 1, true).unwrap().unwrap();
        assert_eq!(reopened.find_at_ms, deadline);
        assert_eq!(reopened.server_now_ms, START_MS - 1);
        assert_eq!(reopened.status, Status::Ready);
        assert_eq!(reopened.result.unwrap().id, result_id);
    }

    #[test]
    fn concurrent_creates_in_independent_connections_share_one_deadline() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("searches.sqlite3");
        let mut first = Store::open(&path).unwrap();
        let mut second = Store::open(&path).unwrap();
        let barrier = Arc::new(Barrier::new(2));
        let worker_barrier = Arc::clone(&barrier);
        let worker = std::thread::spawn(move || {
            worker_barrier.wait();
            second.access(ID, START_MS + 1, true).unwrap().unwrap()
        });

        barrier.wait();
        let snapshot = first.access(ID, START_MS, true).unwrap().unwrap();
        let other = worker.join().unwrap();
        assert_eq!(snapshot.find_at_ms, other.find_at_ms);
        assert_eq!(snapshot.status, Status::Pending);
        assert_eq!(other.status, Status::Pending);
        let count: u32 = first
            .0
            .query_row("SELECT COUNT(*) FROM searches", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }
}
