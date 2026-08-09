use anyhow::{bail, Context, Result};
use futures_util::{SinkExt, StreamExt};
use reqwest::StatusCode;
use std::{env, time::Duration};
use tokio::time::timeout;
use tokio_tungstenite::{connect_async, tungstenite::Message};
use url::Url;

#[derive(Clone, Copy, Debug)]
struct Service {
    env_name: &'static str,
    label: &'static str,
    health_path: &'static str,
}

const SERVICES: &[Service] = &[
    Service {
        env_name: "HHM_MASH_URL",
        label: "Mash web",
        health_path: "/health",
    },
    Service {
        env_name: "HHM_LEPTOS_URL",
        label: "Leptos web",
        health_path: "/health",
    },
    Service {
        env_name: "HHM_DIOXUS_URL",
        label: "Dioxus web",
        health_path: "/health",
    },
    Service {
        env_name: "HHM_API_URL",
        label: "API",
        health_path: "/health",
    },
];

fn configured(name: &str) -> Option<String> {
    env::var(name)
        .ok()
        .map(|value| value.trim().trim_end_matches('/').to_owned())
        .filter(|value| !value.is_empty())
}

fn endpoint_url(base: &str, path: &str) -> Result<Url> {
    let mut url = Url::parse(base).with_context(|| format!("invalid service URL: {base}"))?;
    match url.scheme() {
        "http" | "https" => {}
        scheme => bail!("unsupported HTTP URL scheme: {scheme}"),
    }
    url.set_path(path);
    url.set_query(None);
    url.set_fragment(None);
    Ok(url)
}

fn websocket_url(api_base: &str) -> Result<Url> {
    let mut url = Url::parse(api_base).context("HHM_API_URL is not a valid URL")?;
    let websocket_scheme = match url.scheme() {
        "http" => "ws",
        "https" => "wss",
        "ws" => "ws",
        "wss" => "wss",
        scheme => bail!("unsupported API URL scheme: {scheme}"),
    };
    url.set_scheme(websocket_scheme)
        .map_err(|_| anyhow::anyhow!("could not convert API URL to WebSocket URL"))?;
    url.set_path("/ws");
    url.set_query(None);
    url.set_fragment(None);
    Ok(url)
}

async fn check_http(client: &reqwest::Client, service: Service, base: &str) -> Result<()> {
    let url = endpoint_url(base, service.health_path)?;
    let response = client
        .get(url.clone())
        .send()
        .await
        .with_context(|| format!("{} request failed", service.label))?;

    if response.status() != StatusCode::OK {
        bail!(
            "{} returned {} from {}",
            service.label,
            response.status(),
            url
        );
    }

    println!("ok: {} ({})", service.label, url);
    Ok(())
}

async fn check_websocket(api_base: &str) -> Result<()> {
    let url = websocket_url(api_base)?;
    let (mut stream, response) = timeout(Duration::from_secs(10), connect_async(url.as_str()))
        .await
        .context("WebSocket connect timeout")??;

    if response.status().as_u16() != 101 {
        bail!(
            "WebSocket upgrade returned {} from {}",
            response.status(),
            url
        );
    }

    stream
        .send(Message::Ping(Vec::new()))
        .await
        .context("WebSocket ping failed")?;

    let frame = timeout(Duration::from_secs(5), stream.next())
        .await
        .context("WebSocket response timeout")?
        .context("WebSocket closed before a response frame")??;

    match frame {
        Message::Pong(_) | Message::Text(_) | Message::Binary(_) | Message::Frame(_) => {}
        Message::Ping(payload) => stream
            .send(Message::Pong(payload))
            .await
            .context("WebSocket pong failed")?,
        Message::Close(frame) => bail!("WebSocket closed during smoke check: {frame:?}"),
    }

    stream.close(None).await.context("WebSocket close failed")?;
    println!("ok: API WebSocket upgrade and frame exchange ({url})");
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .context("could not build HTTP client")?;

    let mut configured_count = 0usize;
    for service in SERVICES {
        if let Some(base) = configured(service.env_name) {
            configured_count += 1;
            check_http(&client, *service, &base).await?;
        }
    }

    if let Some(api_base) = configured("HHM_API_URL") {
        check_websocket(&api_base).await?;
    }

    if configured_count == 0 {
        println!(
            "No live endpoint variables were supplied; compile-time and unit-test validation succeeded."
        );
    }

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn service_contract_includes_all_frontends_and_api() {
        assert_eq!(SERVICES.len(), 4);
        assert!(SERVICES
            .iter()
            .any(|service| service.env_name == "HHM_API_URL"));
    }

    #[test]
    fn websocket_url_converts_http_and_discards_request_metadata() {
        let url = websocket_url("https://api.example.test/base?token=redacted#fragment")
            .expect("valid URL");
        assert_eq!(url.as_str(), "wss://api.example.test/ws");
    }

    #[test]
    fn websocket_url_rejects_non_network_schemes() {
        assert!(websocket_url("file:///tmp/socket").is_err());
    }

    #[test]
    fn endpoint_url_replaces_base_path() {
        let url = endpoint_url("http://127.0.0.1:8080/base", "/health").expect("valid URL");
        assert_eq!(url.as_str(), "http://127.0.0.1:8080/health");
    }
}
