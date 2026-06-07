#!/bin/bash
set -e

# MaxMind requires a license key for the free tier downloads.
# Pass it as an environment variable: MAXMIND_LICENSE_KEY

if [ -z "$MAXMIND_LICENSE_KEY" ]; then
    echo "Error: MAXMIND_LICENSE_KEY environment variable is not set."
    echo "Please sign up for a free MaxMind account, generate a license key, and set it."
    echo "Example: export MAXMIND_LICENSE_KEY='your_key_here'"
    exit 1
fi

# Determine the absolute path to the data directory based on the script location
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="$(cd "$SCRIPT_DIR/../data" && pwd)"

echo "Downloading GeoLite2 databases to $DATA_DIR..."

echo "Downloading GeoLite2-City database..."
curl -L -o "$DATA_DIR/GeoLite2-City.tar.gz" "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-City&license_key=$MAXMIND_LICENSE_KEY&suffix=tar.gz"

echo "Downloading GeoLite2-ASN database..."
curl -L -o "$DATA_DIR/GeoLite2-ASN.tar.gz" "https://download.maxmind.com/app/geoip_download?edition_id=GeoLite2-ASN&license_key=$MAXMIND_LICENSE_KEY&suffix=tar.gz"

echo "Extracting databases..."
# MaxMind packages them in a directory inside the tarball, we strip the first component
tar -xzf "$DATA_DIR/GeoLite2-City.tar.gz" -C "$DATA_DIR" --strip-components=1 --wildcards "*.mmdb"
tar -xzf "$DATA_DIR/GeoLite2-ASN.tar.gz" -C "$DATA_DIR" --strip-components=1 --wildcards "*.mmdb"

echo "Cleaning up tarballs..."
rm "$DATA_DIR/GeoLite2-City.tar.gz" "$DATA_DIR/GeoLite2-ASN.tar.gz"

echo "Done! GeoLite2 databases are ready:"
ls -lh "$DATA_DIR"/*.mmdb
