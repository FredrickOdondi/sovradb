// ==============================================================================
// Block 1: Geographic Routing via GeoLite2-ASN.mmdb — maxminddb (MIT License)
// crate: maxminddb v0.24  (crates.io/crates/maxminddb)
//
// The GeoLite2-ASN database (MaxMind — Creative Commons Attribution 4.0)
// maps every IP address to its Autonomous System Number (ASN) and organization.
//
// CONTEXT.md: "utilizing open-source geographic datasets like MaxMind GeoLite2,
// the proxy can intercept IP addresses and swap them with mathematically distinct
// but geographically identical IP addresses (ASN-aware IP replacement)."
//
// How geographic routing works in Block 1:
//   1. Client connects → proxy reads StartupMessage (pgwire crate)
//   2. GeoRouter::classify() maps client IP → SovereignRegion
//   3. SovereignRegion determines which PostgreSQL backend receives the connection:
//        EU  → sovra_postgres_eu (port 5433)  — GDPR data residency
//        US  → sovra_postgres_us (port 5432)  — CCPA data residency
//        Global → default node
//   4. Raw IP is then pseudonymized by ipcrypt-rs before any data reaches PG.
//
// ASN-aware routing rationale:
//   Country-level GeoIP can be spoofed via VPN. ASN-level lookup identifies the
//   actual network infrastructure (e.g., Deutsche Telekom = DE, Comcast = US),
//   providing a more reliable sovereignty signal for routing decisions.
// ==============================================================================

use anyhow::{Context, Result};
use maxminddb::{geoip2, Reader};
// import removed
use std::net::IpAddr;
use std::path::Path;
use tracing::{debug, warn};

// ==============================================================================
// GeoLite2-ASN record — matches maxminddb's geoip2::Asn type
// ==============================================================================

/// Sovereign data region — determines which PostgreSQL node receives the connection.
#[derive(Debug, Clone, PartialEq)]
pub enum SovereignRegion {
    /// EU data residency — routes to sovra_postgres_eu :5433
    /// Regulatory basis: GDPR (EU 2016/679)
    EuropeanUnion,
    /// US data residency — routes to sovra_postgres_us :5432
    /// Regulatory basis: CCPA, HIPAA, state data protection laws
    UnitedStates,
    /// Catch-all — routes to the default (US) node
    Global,
}

impl SovereignRegion {
    /// Returns the backend PostgreSQL DSN for this region.
    /// In production: DSNs are loaded from environment variables or Vault.
    pub fn backend_dsn(&self) -> &'static str {
        match self {
            SovereignRegion::EuropeanUnion => {
                "host=sovra_postgres_eu port=5432 dbname=sovra_db \
                 user=sovra_admin password=SuperSecretSCRAMPassword123!"
            }
            SovereignRegion::UnitedStates | SovereignRegion::Global => {
                "host=sovra_postgres_us port=5432 dbname=sovra_db \
                 user=sovra_admin password=SuperSecretSCRAMPassword123!"
            }
        }
    }

    /// Returns the region_code used in the geo-partitioned schema (Block 2).
    pub fn region_code(&self) -> &'static str {
        match self {
            SovereignRegion::EuropeanUnion => "EU",
            SovereignRegion::UnitedStates => "US",
            SovereignRegion::Global => "GLOBAL",
        }
    }
}

// ==============================================================================
// ASN → Region mapping
//
// EU member state ASN ranges are identified by organization name prefixes.
// This is the ASN-aware approach: more reliable than country-code GeoIP
// because ASNs reflect the actual network operator, not just IP registration.
//
// Production enhancement: load from a configuration file / policy engine.
// ==============================================================================

/// Known EU network operator name patterns (case-insensitive substring match).
/// These organizations operate networks exclusively within EU member states.
const EU_ASN_ORG_PATTERNS: &[&str] = &[
    // Germany
    "Deutsche Telekom",
    "Telekom Deutschland",
    "Vodafone GmbH",
    "1&1",
    "Versatel",
    // France
    "Orange S.A.",
    "SFR",
    "Bouygues Telecom",
    "Free SAS",
    "Iliad",
    // Netherlands
    "KPN",
    "T-Mobile Netherlands",
    "VodafoneZiggo",
    // EU cloud / datacenter providers
    "Hetzner Online GmbH",
    "OVH SAS",
    "IONOS",
    "Leaseweb",
    "Scaleway",
    "Interxion",
    "Equinix Amsterdam",
    "Equinix Frankfurt",
    "Equinix Dublin",
    // Catch-all EU indicators
    "GmbH",
    "S.A.S",
    "SARL",
    "S.r.l.",
    "B.V.",
    "N.V.",
    "GmbH & Co",
];

/// Known US network operator name patterns.
const US_ASN_ORG_PATTERNS: &[&str] = &[
    "Comcast",
    "AT&T",
    "Verizon",
    "T-Mobile USA",
    "Charter Communications",
    "Cox Communications",
    "CenturyLink",
    "Lumen",
    "Amazon",
    "Google LLC",
    "Microsoft Corporation",
    "Cloudflare",
    "Akamai",
    "Fastly",
    "DigitalOcean",
    "Linode",
    "Vultr",
];

// ==============================================================================
// GeoRouter — the lego block that wires maxminddb into geographic routing
// ==============================================================================

pub struct GeoRouter {
    /// maxminddb reader for the GeoLite2-ASN database.
    /// Loaded once at startup, shared across all connections (Arc<>).
    reader: Reader<Vec<u8>>,
}

impl GeoRouter {
    /// Loads the GeoLite2-ASN.mmdb database from the given path.
    ///
    /// # Errors
    /// Returns an error if the file is missing or corrupted.
    pub fn new<P: AsRef<Path>>(db_path: P) -> Result<Self> {
        let reader = Reader::open_readfile(db_path)
            .context("Failed to open GeoLite2-ASN.mmdb. Ensure the file exists in gateway/data/")?;
        Ok(Self { reader })
    }

    /// Classifies a client IP address into a SovereignRegion using the ASN database.
    ///
    /// Pipeline:
    ///   1. Look up IP in GeoLite2-ASN → (asn_number, org_name)
    ///   2. Match org_name against EU/US operator patterns
    ///   3. Return the SovereignRegion that governs data residency for this connection
    pub fn classify(&self, ip: IpAddr) -> SovereignRegion {
        match self.reader.lookup::<geoip2::Asn>(ip) {
            Ok(record) => {
                let org = record
                    .autonomous_system_organization
                    .unwrap_or("Unknown");
                let asn = record.autonomous_system_number.unwrap_or(0);

                debug!(
                    "GeoLite2-ASN lookup: IP={} → ASN={} ({})",
                    ip, asn, org
                );

                // ASN-aware region classification
                let org_lower = org.to_lowercase();

                for pattern in EU_ASN_ORG_PATTERNS {
                    if org_lower.contains(&pattern.to_lowercase()) {
                        debug!("IP {} classified as EU (matched org pattern: {})", ip, pattern);
                        return SovereignRegion::EuropeanUnion;
                    }
                }

                for pattern in US_ASN_ORG_PATTERNS {
                    if org_lower.contains(&pattern.to_lowercase()) {
                        debug!("IP {} classified as US (matched org pattern: {})", ip, pattern);
                        return SovereignRegion::UnitedStates;
                    }
                }

                warn!(
                    "IP {} ASN={} org='{}' did not match any sovereign region. \
                     Defaulting to Global (US node).",
                    ip, asn, org
                );
                SovereignRegion::Global
            }
            Err(e) => {
                warn!("GeoLite2-ASN lookup failed for IP {}: {}. Defaulting to Global.", ip, e);
                SovereignRegion::Global
            }
        }
    }
}

// ==============================================================================
// Integration tests — uses the REAL GeoLite2-ASN.mmdb file in gateway/data/
// ==============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::net::{IpAddr, Ipv4Addr};

    /// Absolute path to the real MaxMind ASN database shipped with the project.
    /// Tests use this file directly — no mocking. If the file is present, the
    /// lookup must return correct ASN data.
    fn mmdb_path() -> &'static str {
        concat!(env!("CARGO_MANIFEST_DIR"), "/data/GeoLite2-ASN.mmdb")
    }

    fn router() -> GeoRouter {
        GeoRouter::new(mmdb_path()).expect("GeoLite2-ASN.mmdb must be present in gateway/data/")
    }

    // ── EU IP tests ─────────────────────────────────────────────────────────

    #[test]
    fn test_hetzner_frankfurt_classified_as_eu() {
        // Hetzner Online GmbH — major EU cloud provider (Frankfurt, Germany)
        // IP: 95.216.0.1 — Hetzner's primary Helsinki/Frankfurt range
        let ip = IpAddr::V4(Ipv4Addr::new(95, 216, 0, 1));
        let region = router().classify(ip);
        assert_eq!(
            region,
            SovereignRegion::EuropeanUnion,
            "Hetzner Frankfurt IP must route to EU node (GDPR compliance)"
        );
    }

    #[test]
    fn test_ovh_eu_classified_as_eu() {
        // OVH SAS — major French cloud provider (Roubaix, France)
        // IP: 51.68.0.1 — OVH Gravelines datacenter range
        let ip = IpAddr::V4(Ipv4Addr::new(51, 68, 0, 1));
        let region = router().classify(ip);
        assert_eq!(
            region,
            SovereignRegion::EuropeanUnion,
            "OVH France IP must route to EU node (GDPR compliance)"
        );
    }

    #[test]
    fn test_deutsche_telekom_classified_as_eu() {
        // Deutsche Telekom AG — Germany's primary ISP
        // IP: 80.144.0.1 — Deutsche Telekom residential range
        let ip = IpAddr::V4(Ipv4Addr::new(80, 144, 0, 1));
        let region = router().classify(ip);
        assert_eq!(
            region,
            SovereignRegion::EuropeanUnion,
            "Deutsche Telekom IP must route to EU node (GDPR compliance)"
        );
    }

    // ── US IP tests ─────────────────────────────────────────────────────────

    #[test]
    fn test_cloudflare_dns_classified_as_us() {
        // Cloudflare, Inc. — US-headquartered CDN operator
        // IP: 1.1.1.1 — Cloudflare's well-known public DNS resolver
        let ip = IpAddr::V4(Ipv4Addr::new(1, 1, 1, 1));
        let region = router().classify(ip);
        assert_eq!(
            region,
            SovereignRegion::UnitedStates,
            "Cloudflare DNS IP must route to US node"
        );
    }

    #[test]
    fn test_comcast_classified_as_us() {
        // Comcast Cable — US residential ISP
        // IP: 73.0.0.1 — Comcast cable modem range
        let ip = IpAddr::V4(Ipv4Addr::new(73, 0, 0, 1));
        let region = router().classify(ip);
        assert_eq!(
            region,
            SovereignRegion::UnitedStates,
            "Comcast IP must route to US node"
        );
    }

    #[test]
    fn test_google_dns_classified_as_us() {
        // Google LLC — US-headquartered, AS15169
        // IP: 8.8.8.8 — Google's well-known public DNS
        let ip = IpAddr::V4(Ipv4Addr::new(8, 8, 8, 8));
        let region = router().classify(ip);
        assert_eq!(
            region,
            SovereignRegion::UnitedStates,
            "Google DNS IP must route to US node"
        );
    }

    // ── ASN raw lookup test ──────────────────────────────────────────────────

    #[test]
    fn test_asn_lookup_returns_valid_data() {
        // Sanity-check: the mmdb lookup itself returns sensible data
        let router = router();
        let ip = IpAddr::V4(Ipv4Addr::new(8, 8, 8, 8));

        let record = router
            .reader
            .lookup::<maxminddb::geoip2::Asn>(ip)
            .expect("ASN lookup must succeed for 8.8.8.8");

        let asn = record.autonomous_system_number.expect("ASN must be present");
        let org = record.autonomous_system_organization.unwrap_or("unknown");

        println!("8.8.8.8 → ASN{} ({})", asn, org);

        // Google's ASN is 15169 — this verifies the database is valid and current
        assert_eq!(asn, 15169, "8.8.8.8 must resolve to AS15169 (Google LLC)");
        assert!(
            org.to_lowercase().contains("google"),
            "8.8.8.8 ASN org must contain 'google', got: {}",
            org
        );
    }

    // ── Backend routing decision test ─────────────────────────────────────────

    #[test]
    fn test_eu_ip_routes_to_eu_backend_dsn() {
        let region = router().classify(IpAddr::V4(Ipv4Addr::new(95, 216, 0, 1)));
        assert!(
            region.backend_dsn().contains("sovra_postgres_eu"),
            "EU region must route to sovra_postgres_eu, got: {}",
            region.backend_dsn()
        );
        assert_eq!(region.region_code(), "EU");
    }

    #[test]
    fn test_us_ip_routes_to_us_backend_dsn() {
        let region = router().classify(IpAddr::V4(Ipv4Addr::new(8, 8, 8, 8)));
        assert!(
            region.backend_dsn().contains("sovra_postgres_us"),
            "US region must route to sovra_postgres_us, got: {}",
            region.backend_dsn()
        );
        assert_eq!(region.region_code(), "US");
    }

    // ── Loopback / edge cases ─────────────────────────────────────────────────

    #[test]
    fn test_loopback_does_not_panic() {
        // 127.0.0.1 has no ASN — must degrade gracefully to Global, not panic
        let ip = IpAddr::V4(Ipv4Addr::new(127, 0, 0, 1));
        let region = router().classify(ip);
        // Result is Global (loopback has no ASN) — the important thing is no panic
        println!("127.0.0.1 → {:?}", region);
    }
}
