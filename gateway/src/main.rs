use anyhow::Result;
use tracing::{info, Level};
use tracing_subscriber;

// Block 1 modules — all using OSS lego block crates, no custom crypto
mod fpe;          // NIST FF1 Format-Preserving Encryption (fpe crate — Apache-2.0)
mod geo_router;   // ASN-aware geographic routing (maxminddb crate — MIT)
mod parser;       // SQL AST inspection (sqlparser crate — Apache-2.0)
mod proxy;        // L7 proxy (pgwire crate — MIT)
mod tokenization; // IP pseudonymization (ipcrypt-rs crate — MIT)
mod tls;          // TLS on both ends (rustls crate — Apache-2.0/MIT)

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_max_level(Level::INFO)
        .init();

    info!("╔══════════════════════════════════════════════════════════╗");
    info!("║   SovraDB — Block 1: Sovereign Gateway                   ║");
    info!("║   L7 PostgreSQL Proxy with FPE Tokenization               ║");
    info!("╚══════════════════════════════════════════════════════════╝");

    // The gateway listens on 6432 (standard PgBouncer/proxy port).
    // Clients connect here; the proxy routes to :5432 (US) or :5433 (EU).
    proxy::start_proxy("0.0.0.0:6432").await?;

    Ok(())
}
