#!/bin/bash
set -e

# In the Postgres docker image, this script runs as the 'postgres' user.
# We create the tablespace directories inside /var/lib/postgresql so the 
# postgres user natively has permission to write here, avoiding root volume issues.

echo "Creating physical tablespace directories for EU and US data..."

mkdir -p /var/lib/postgresql/data_eu
mkdir -p /var/lib/postgresql/data_us

echo "Tablespace directories created."
