# SovraDB: The Composable Sovereign Data Platform

![SovraDB Architecture](https://img.shields.io/badge/Architecture-Distributed_Postgres-orange)
![Compliance](https://img.shields.io/badge/Compliance-GDPR_|_HIPAA-blue)
![Status](https://img.shields.io/badge/Status-Active_Development-brightgreen)

SovraDB is an enterprise-grade database architecture designed to definitively resolve the modern engineering trilemma: **Global Data Residency**, **Local-First Synchronization**, and **Multi-Tenant Isolation**.

By treating database infrastructure like composable "Lego blocks," SovraDB stitches together the most powerful open-source primitives (PostgreSQL 18, Envoy proxies, YugabyteDB principles, embedded DuckDB) into a unified, zero-trust platform.

---

## 🏗️ Core Architectural Blocks

The platform is structured around six massive pillars:

### 1. The Sovereign Gateway (L7 Proxy)
An intelligent entry point that acts as a router and dynamic firewall. It parses incoming queries, determines geographic regulatory requirements based on ASN geo-location, and actively intercepts and tokenizes sensitive PII *before* it hits the database.

### 2. The Distributed Storage Fabric (Geo-Partitioned Postgres)
Data is physically pinned to specific global regions (e.g., `US-East`, `EU-Central`, `AF-South`) using PostgreSQL declarative partitioning. Security at rest is mathematically guaranteed through Transparent Data Encryption (TDE).

### 3. Cryptographic Obfuscation Engine (FPE)
A native Postgres engine utilizing Format-Preserving Encryption (FPE) and dynamic data masking via `pg_anon`. This ensures sensitive data is locked down while preserving original string lengths and structural formats, preventing legacy systems and indexing from breaking.

### 4. Edge Sync Catalyst
Bridging the sovereign Postgres storage to offline-capable local WASM SQLite databases on user devices. Powered by logical decoding and multiplexed WebSockets, data is pushed to the edge instantly. Crucially, the replication stream is heavily masked *before* it leaves the server to prevent regulatory compliance breaches on untrusted edge devices.

### 5. Federated Analytical Observer (Embedded DuckDB)
Moving raw data to a centralized data lake violates digital sovereignty. SovraDB solves this by embedding `pg_duckdb` natively. Vectorized, columnar analytical queries are pushed down to local partitioned nodes, and only highly aggregated, anonymized metrics are returned to the central observer.

### 6. Temporal Control Plane (Git for Data)
A "Git-like" version control workflow for your database utilizing zero-copy, copy-on-write mechanisms. Developers can instantly branch production data for testing and execute `FOR SYSTEM_TIME AS OF` time-travel queries to instantly roll back corrupted data.

---

## 📂 Repository Structure

- `/frontend_workbench`: The React/Next.js visual control plane and Admin Dashboard.
- `/gateway`: The Rust-based L7 Proxy and contextual tokenization engine.
- `/storage_fabric`: Infrastructure configuration for the Geo-Partitioned PostgreSQL clusters.
- `/control_plane`: SQL definitions for Temporal Tables, schema isolation, and RLS.
- `/obfuscation_engine`: Configurations and logic for Format-Preserving Encryption.
- `/analytics_observer`: SQL configuration for DuckDB federated analytics.

---

## 🚀 Getting Started

To spin up the local development environment and the Next.js Frontend Workbench:

```bash
# 1. Start the distributed backend fabric
cd storage_fabric
docker-compose up -d

# 2. Start the L7 Sovereign Gateway
cd ../gateway
cargo run

# 3. Launch the Frontend Workbench Control Plane
cd ../frontend_workbench
npm install
npm run dev
```

The Admin Dashboard will be available at `http://localhost:3000/admin`.

---

## 🛡️ Security Posture
SovraDB inherently assumes a zero-trust model. It neutralizes threats at the physical memory level, ensuring that even in the event of a compromised edge device, stolen laptop, or hijacked dashboard, absolutely no actionable plaintext data is exposed to the attacker.
