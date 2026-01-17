#!/bin/bash

# ContractShield License Key Generator
# Generates RSA key pair for license signing

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SECRETS_DIR="$SCRIPT_DIR/../../.secrets"

echo "ContractShield License Key Generator"
echo "====================================="
echo ""

# Create secrets directory
mkdir -p "$SECRETS_DIR"

# Check if keys already exist
if [ -f "$SECRETS_DIR/private.pem" ]; then
    echo "WARNING: Private key already exists at $SECRETS_DIR/private.pem"
    read -p "Overwrite? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
fi

# Generate RSA 2048 key pair
echo "Generating RSA 2048 key pair..."
openssl genrsa -out "$SECRETS_DIR/private.pem" 2048 2>/dev/null
openssl rsa -in "$SECRETS_DIR/private.pem" -pubout -out "$SECRETS_DIR/public.pem" 2>/dev/null

# Set permissions
chmod 600 "$SECRETS_DIR/private.pem"
chmod 644 "$SECRETS_DIR/public.pem"

echo ""
echo "Keys generated successfully!"
echo ""
echo "  Private key: $SECRETS_DIR/private.pem"
echo "  Public key:  $SECRETS_DIR/public.pem"
echo ""
echo "IMPORTANT:"
echo "  - NEVER commit private.pem to version control!"
echo "  - Copy public.pem content to packages/license/src/verify.ts"
echo ""
echo "Public key content:"
echo "-------------------"
cat "$SECRETS_DIR/public.pem"
echo ""
