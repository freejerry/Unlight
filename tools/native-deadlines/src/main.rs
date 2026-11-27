use std::error::Error;
use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

const DEFAULT_PORT: u16 = 4356;
const USAGE: &str = "Usage: native-deadlines --db PATH [--port PORT] (loopback, default 4356)";

#[tokio::main]
async fn main() -> Result<(), Box<dyn Error>> {
    let Some(config) = Config::parse()? else {
        println!("{USAGE}");
        return Ok(());
    };

    let app = native_deadlines::router(&config.db, unix_now_ms)?;
    let listener = tokio::net::TcpListener::bind((Ipv4Addr::LOCALHOST, config.port)).await?;
    println!(
        "Native deadlines listening at http://{}",
        listener.local_addr()?
    );
    axum::serve(listener, app).await?;
    Ok(())
}

fn unix_now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

struct Config {
    db: PathBuf,
    port: u16,
}

impl Config {
    fn parse() -> Result<Option<Self>, Box<dyn Error>> {
        let mut db = None;
        let mut port = None;
        let mut arguments = std::env::args_os().skip(1);
        while let Some(flag) = arguments.next() {
            match flag.to_str() {
                Some("--db") if db.is_none() => {
                    let path = arguments.next().ok_or("--db requires a path")?;
                    if path.is_empty() || path.as_encoded_bytes().starts_with(b"--") {
                        return Err("--db requires a path".into());
                    }
                    db = Some(PathBuf::from(path));
                }
                Some("--port") if port.is_none() => {
                    let value = arguments.next().ok_or("--port requires a port number")?;
                    port = Some(
                        value
                            .to_str()
                            .ok_or("Invalid port number")?
                            .parse::<u16>()?,
                    );
                }
                Some("--help" | "-h") => return Ok(None),
                _ => return Err(USAGE.into()),
            }
        }

        Ok(Some(Self {
            db: db.ok_or(USAGE)?,
            port: port.unwrap_or(DEFAULT_PORT),
        }))
    }
}
