#!/bin/bash
# Generate secrets for Coolify deployment

echo "=== Wormhole Deployment Secrets ==="
echo ""
echo "JWT_SECRET (min 32 chars, recommended 64+):"
openssl rand -hex 32
echo ""
echo "ENCRYPTION_KEY (must be exactly 64 hex chars):"
openssl rand -hex 32
echo ""
echo "=== Copy these values to Coolify environment variables ==="
