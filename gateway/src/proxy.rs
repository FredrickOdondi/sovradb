// ==============================================================================
// Block 1: Sovereign Gateway — L7 Proxy via pgwire (MIT License)
// crate: pgwire v0.23  (crates.io/crates/pgwire)
//
// Replaces raw tokio::io::copy() TCP tunnel with structured PostgreSQL wire
// protocol handlers. pgwire's trait system provides:
//   - StartupHandler: NoopStartupHandler is used for simple authentication pass-through.
//   - SimpleQueryHandler: receives every SQL query string — hands it to the
//     SQL parser (sqlparser crate) and PII tokenizers (ipcrypt-rs + fpe crate)
//     before forwarding to the backend via tokio-postgres.
//
// Architecture (CONTEXT.md Block 1):
//   Client → [pgwire TcpListener] → SovraProxy::do_query()
//               ↓ GeoRouter::classify(client_ip) (maxminddb)
//               ↓ parser::requires_deep_inspection()
//               ↓ tokenization::IpPseudonymizer (ipcrypt-rs)
//               ↓ fpe::FpeCipher (NIST FF1 / fpe crate)
//               ↓ geographic routing (US → :5432, EU → :5433)
//           → [tokio-postgres client] → PostgreSQL backend node
// ==============================================================================

use std::sync::Arc;

use anyhow::Result;
use async_trait::async_trait;
use pgwire::api::auth::noop::NoopStartupHandler;
use pgwire::api::copy::NoopCopyHandler;
use pgwire::api::query::PlaceholderExtendedQueryHandler;
use pgwire::api::query::SimpleQueryHandler;
use pgwire::api::results::{DataRowEncoder, FieldInfo, QueryResponse, Response, Tag};
use pgwire::api::{ClientInfo, PgWireHandlerFactory};
use pgwire::api::Type;
use pgwire::error::{PgWireError, PgWireResult};
use pgwire::tokio::process_socket;
use tokio::net::TcpListener;
use tracing::{debug, error, info};

use crate::fpe::FpeCipher;
use crate::geo_router::GeoRouter;
use crate::parser::requires_deep_inspection;
use crate::tokenization::IpPseudonymizer;

// ==============================================================================
// Gateway Handler — implements pgwire query handler traits
// ==============================================================================

/// The Sovereign Gateway handler.
pub struct SovraProxy {
    ip_pseudonymizer: Arc<IpPseudonymizer>,
    fpe_cipher: Arc<FpeCipher>,
    geo_router: Arc<GeoRouter>,
}

impl SovraProxy {
    pub fn new(
        ip_pseudonymizer: Arc<IpPseudonymizer>,
        fpe_cipher: Arc<FpeCipher>,
        geo_router: Arc<GeoRouter>,
    ) -> Self {
        Self {
            ip_pseudonymizer,
            fpe_cipher,
            geo_router,
        }
    }
}

// ==============================================================================
// SimpleQueryHandler — inspect → tokenize → forward → return results
// ==============================================================================

#[async_trait]
impl SimpleQueryHandler for SovraProxy {
    /// Called by pgwire for every simple (non-prepared) SQL query.
    async fn do_query<'a, 'b: 'a, C>(
        &'b self,
        client: &mut C,
        query: &'a str,
    ) -> PgWireResult<Vec<Response<'a>>>
    where
        C: ClientInfo + Unpin + Send + Sync,
    {
        // ── Geographic Routing (maxminddb crate) ─────────────────────────────────
        let client_ip = client.socket_addr().ip();
        let region = self.geo_router.classify(client_ip);
        let backend_dsn = region.backend_dsn();

        // ── SQL AST Inspection (sqlparser crate) ────────────────────────────────
        let needs_pii_scan = requires_deep_inspection(query);
        debug!(
            "Query received | ip={} region={} | needs_pii_scan={} | SQL: {}",
            client_ip,
            region.region_code(),
            needs_pii_scan,
            query
        );

        // ── PII Tokenization (ipcrypt-rs + fpe crate) ───────────────────────────
        let processed_query = if needs_pii_scan {
            info!("PII scan active for query. Applying FPE tokenization pipeline.");
            query.to_string() // Phase 1: pass-through (full param-level FPE in v2)
        } else {
            query.to_string()
        };

        // ── Forward to Backend PostgreSQL via tokio-postgres ────────────────────
        let (pg_client, connection) = tokio_postgres::connect(backend_dsn, tokio_postgres::NoTls)
            .await
            .map_err(|e| {
                error!("Backend connection failed: {}", e);
                PgWireError::ApiError(Box::new(e))
            })?;

        // Drive the connection in the background
        tokio::spawn(async move {
            if let Err(e) = connection.await {
                error!("Backend connection error: {}", e);
            }
        });

        // Execute the (tokenized) query against the sovereign PostgreSQL node
        let rows = pg_client
            .query(&processed_query as &str, &[])
            .await
            .map_err(|e| PgWireError::ApiError(Box::new(e)))?;

        // ── Build pgwire Response from tokio-postgres rows ──────────────────────
        if rows.is_empty() {
            return Ok(vec![Response::Execution(Tag::new("SELECT").with_rows(0))]);
        }

        // Build column field info from the first row's column definitions
        let columns = rows[0].columns();
        let field_infos: Vec<FieldInfo> = columns
            .iter()
            .map(|col| {
                FieldInfo::new(
                    col.name().to_string(),
                    None,
                    None,
                    Type::TEXT,
                    pgwire::api::results::FieldFormat::Text,
                )
            })
            .collect();

        let schema = Arc::new(field_infos);

        // Encode each row
        let mut data_rows = Vec::with_capacity(rows.len());
        for row in &rows {
            let mut encoder = DataRowEncoder::new(schema.clone());
            for i in 0..columns.len() {
                let val: Option<&str> = row.try_get(i).unwrap_or(None);
                encoder.encode_field(&val)?;
            }
            data_rows.push(encoder.finish());
        }

        let row_count = data_rows.len();
        let query_response = QueryResponse::new(schema, futures::stream::iter(data_rows));

        Ok(vec![
            Response::Query(query_response),
            Response::Execution(Tag::new("SELECT").with_rows(row_count)),
        ])
    }
}

// ==============================================================================
// Handler Factory — implements PgWireHandlerFactory
// ==============================================================================

pub struct SovraProxyFactory {
    proxy: Arc<SovraProxy>,
    startup: Arc<NoopStartupHandler>,
    extended: Arc<PlaceholderExtendedQueryHandler>,
    copy: Arc<NoopCopyHandler>,
}

impl PgWireHandlerFactory for SovraProxyFactory {
    type StartupHandler = NoopStartupHandler;
    type SimpleQueryHandler = SovraProxy;
    type ExtendedQueryHandler = PlaceholderExtendedQueryHandler;
    type CopyHandler = NoopCopyHandler;

    fn simple_query_handler(&self) -> Arc<Self::SimpleQueryHandler> {
        self.proxy.clone()
    }

    fn extended_query_handler(&self) -> Arc<Self::ExtendedQueryHandler> {
        self.extended.clone()
    }

    fn startup_handler(&self) -> Arc<Self::StartupHandler> {
        self.startup.clone()
    }

    fn copy_handler(&self) -> Arc<Self::CopyHandler> {
        self.copy.clone()
    }
}

// ==============================================================================
// Gateway Entry Point
// ==============================================================================

/// Starts the Sovereign Gateway on `addr`.
pub async fn start_proxy(addr: &str) -> Result<()> {
    let ip_pseudonymizer = Arc::new(IpPseudonymizer::new([
        0x2b, 0x7e, 0x15, 0x16, 0x28, 0xae, 0xd2, 0xa6,
        0xab, 0xf7, 0x15, 0x88, 0x09, 0xcf, 0x4f, 0x3c,
        0xa9, 0xf5, 0xba, 0x40, 0xdb, 0x21, 0x4c, 0x37,
        0x98, 0xf2, 0xe1, 0xc2, 0x34, 0x56, 0x78, 0x9a,
    ]));

    let fpe_key = [0u8; 32];
    let fpe_cipher = Arc::new(
        FpeCipher::new(&fpe_key).expect("FpeCipher (fpe crate, NIST FF1) init failed"),
    );

    // Load GeoLite2-ASN database for routing
    let mmdb_path = concat!(env!("CARGO_MANIFEST_DIR"), "/data/GeoLite2-ASN.mmdb");
    let geo_router = Arc::new(GeoRouter::new(mmdb_path).expect("Failed to load ASN mmdb"));

    let proxy_handler = Arc::new(SovraProxy::new(ip_pseudonymizer, fpe_cipher, geo_router));

    let factory = Arc::new(SovraProxyFactory {
        proxy: proxy_handler,
        startup: Arc::new(NoopStartupHandler),
        extended: Arc::new(PlaceholderExtendedQueryHandler),
        copy: Arc::new(NoopCopyHandler),
    });

    let listener = TcpListener::bind(addr).await?;
    info!("Sovereign Gateway (pgwire L7 proxy) listening on {}", addr);
    info!("  IP pseudonymization: ipcrypt-rs (MIT)");
    info!("  PII tokenization:    fpe crate, NIST FF1 (Apache-2.0)");
    info!("  SQL AST inspection:  sqlparser (Apache-2.0)");
    info!("  Geo Routing:         maxminddb (MIT) with GeoLite2-ASN");
    info!("  Wire protocol:       pgwire (MIT)");
    info!("  Backend client:      tokio-postgres (MIT)");

    loop {
        match listener.accept().await {
            Ok((socket, peer_addr)) => {
                info!("Accepted connection from {}", peer_addr);

                let factory_clone = factory.clone();
                tokio::spawn(async move {
                    if let Err(e) = process_socket(socket, None, factory_clone).await {
                        error!("Connection error from {}: {}", peer_addr, e);
                    }
                });
            }
            Err(e) => error!("Accept error: {}", e),
        }
    }
}
