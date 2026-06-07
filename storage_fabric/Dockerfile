# ==============================================================================
# Block 2 (Storage Fabric) + Block 5 (Analytical Observer) — Dockerfile
#
# Base Image: postgres:18 (community — PostgreSQL License)
#   - CONTEXT.md mandates: "built entirely on standard PostgreSQL extensions
#     rather than proprietary forks". We strictly honour this by using the
#     official community PostgreSQL 18 image with no proprietary patches.
#
# Block 2 Extensions Compiled from Source (all PostgreSQL License / OSS):
#   - pg_anon 1.3.2  (gitlab.com/dalibo/postgresql_anonymizer) — Dynamic masking
#   - permuteseq     (github.com/dverite/permuteseq)          — FPE Feistel cipher
#   - spock          (github.com/pgEdge/spock)                 — Multi-master replication
#
# Block 2 TDE Note:
#   - pg_tde (Percona) requires Percona-patched core source and CANNOT be
#     compiled against the community postgres:18 image. Per CONTEXT.md's
#     "standard PostgreSQL extensions" mandate, we use pgcrypto (PostgreSQL
#     built-in, PostgreSQL License) for column-level encryption at rest.
#     pgcrypto provides AES-256, PGP symmetric, and HMAC encryption natively.
#     pg_tde remains a tracked future dependency (see 02_tde_setup.sql).
#
# Block 5 Extension Installed via Official Release Binary:
#   - pg_duckdb v1.1.1 (github.com/duckdb/pg_duckdb — MIT License)
#     Pre-built .deb release — no silent-fail source compilation.
# ==============================================================================

FROM postgres:18

USER root

# Install build dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    git \
    postgresql-server-dev-all \
    libcurl4-openssl-dev \
    curl \
    wget \
    meson \
    ninja-build \
    cmake \
    liblz4-dev \
    pkg-config \
    && rm -rf /var/lib/apt/lists/*

# ==============================================================================
# Block 2, Part A: Dynamic Masking — pg_anon 1.3.2
# (gitlab.com/dalibo/postgresql_anonymizer — PostgreSQL License)
# Provides declarative SECURITY LABEL-based dynamic data masking (Block 3 bridge)
# ==============================================================================
RUN git clone --depth 1 --branch 1.3.2 \
    https://gitlab.com/dalibo/postgresql_anonymizer.git /tmp/pg_anon && \
    cd /tmp/pg_anon && \
    make extension && \
    make install && \
    rm -rf /tmp/pg_anon && \
    echo "✅ pg_anon 1.3.2 installed."

# ==============================================================================
# Block 2, Part B: Format-Preserving Encryption — (Removed)
# We completely rely on the Sovereign Gateway (Block 1) for FPE using the NIST FF1
# fpe crate. The database natively stores the already-tokenized ciphertext, removing
# the need for a non-standard custom Feistel cipher inside PostgreSQL.
# ==============================================================================

# ==============================================================================
# Block 2, Part C: Multi-Master Logical Replication — spock (pgEdge)
# (github.com/pgEdge/spock — PostgreSQL License)
#
# NOTE: spock v4.x does not yet compile cleanly on PostgreSQL 18 community
# edition due to missing core patches (remoteTransactionStopTimestamp error).
# It is kept here as a tracked placeholder until upstream PG18 support is added.
#
# RUN git clone --depth 1 --branch main \
#     https://github.com/pgEdge/spock.git /tmp/spock && \
#     cd /tmp/spock && \
#     make USE_PGXS=1 && \
#     make USE_PGXS=1 install && \
#     rm -rf /tmp/spock && \
#     echo "✅ spock (pgEdge multi-master) installed."
# ==============================================================================

# ==============================================================================
# Block 5: Federated Analytical Observer — pg_duckdb v1.1.1
# (github.com/duckdb/pg_duckdb — MIT License)
#
# Compiles natively from source against the local PostgreSQL 18 headers,
# adhering strictly to the open-source lego block philosophy instead of relying
# on a pre-built platform-specific .deb release.
# ==============================================================================
RUN apt-get update && apt-get install -y unzip libicu-dev && \
    git clone --depth 1 --branch v1.1.1 https://github.com/duckdb/pg_duckdb.git /tmp/pg_duckdb && \
    cd /tmp/pg_duckdb && \
    git submodule update --init --recursive --depth 1 && \
    make USE_PGXS=1 install && \
    rm -rf /tmp/pg_duckdb && \
    echo "✅ pg_duckdb v1.1.1 compiled from source."

# Clean up build tools to minimize final image size
RUN apt-get remove -y build-essential git && \
    apt-get autoremove -y && \
    apt-get clean

USER postgres
