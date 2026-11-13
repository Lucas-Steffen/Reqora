//! A raw HTTP/1.1 server on 127.0.0.1 for the send tests: each connection gets
//! the bytes `respond` builds from the request it read.

use std::sync::Arc;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

/// The request as text: head and body.
pub struct Received {
    pub head: String,
    pub body: String,
}

impl Received {
    /// The first value of a header, by lowercase name.
    pub fn header(&self, name: &str) -> Option<&str> {
        self.head.lines().skip(1).find_map(|line| {
            let (key, value) = line.split_once(':')?;
            key.trim().eq_ignore_ascii_case(name).then(|| value.trim())
        })
    }

    pub fn target(&self) -> &str {
        self.head.split(' ').nth(1).unwrap_or_default()
    }
}

/// `HTTP/1.1 <status>` with the headers, a content-length and the body.
pub fn response(status: &str, headers: &[(&str, &str)], body: &[u8]) -> Vec<u8> {
    let mut out = format!("HTTP/1.1 {status}\r\nconnection: close\r\ncontent-length: {}\r\n", body.len());
    for (name, value) in headers {
        out.push_str(&format!("{name}: {value}\r\n"));
    }
    out.push_str("\r\n");
    let mut bytes = out.into_bytes();
    bytes.extend_from_slice(body);
    bytes
}

/// Serves until the test ends; returns `http://127.0.0.1:<port>`.
pub async fn serve(respond: impl Fn(Received) -> Vec<u8> + Send + Sync + 'static) -> String {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let address = listener.local_addr().unwrap();
    let respond = Arc::new(respond);
    tokio::spawn(async move {
        while let Ok((mut socket, _)) = listener.accept().await {
            let respond = respond.clone();
            tokio::spawn(async move {
                let Some(received) = read_request(&mut socket).await else { return };
                let _ = socket.write_all(&respond(received)).await;
                let _ = socket.shutdown().await;
            });
        }
    });
    format!("http://{address}")
}

pub async fn read_request(socket: &mut tokio::net::TcpStream) -> Option<Received> {
    let mut buffer = Vec::new();
    let mut chunk = [0u8; 8192];
    let head_end = loop {
        if let Some(end) = buffer.windows(4).position(|window| window == b"\r\n\r\n") {
            break end;
        }
        let read = socket.read(&mut chunk).await.ok()?;
        if read == 0 {
            return None;
        }
        buffer.extend_from_slice(&chunk[..read]);
    };
    let head = String::from_utf8_lossy(&buffer[..head_end]).into_owned();
    let mut received = Received { head, body: String::new() };
    let mut body = buffer[head_end + 4..].to_vec();
    let chunked = received.header("transfer-encoding").is_some_and(|value| value.eq_ignore_ascii_case("chunked"));
    let length: usize = received.header("content-length").and_then(|value| value.parse().ok()).unwrap_or(0);
    loop {
        let complete = if chunked { body.ends_with(b"0\r\n\r\n") } else { body.len() >= length };
        if complete {
            break;
        }
        let read = socket.read(&mut chunk).await.ok()?;
        if read == 0 {
            break;
        }
        body.extend_from_slice(&chunk[..read]);
    }
    received.body = String::from_utf8_lossy(&body).into_owned();
    Some(received)
}
