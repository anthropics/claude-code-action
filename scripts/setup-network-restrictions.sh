#!/bin/bash

# Setup Network Restrictions with Squid Proxy
# This script sets up a Squid proxy to restrict network access to whitelisted domains only.

set -e

# Check if experimental_allowed_domains is provided
if [ -z "$EXPERIMENTAL_ALLOWED_DOMAINS" ]; then
  echo "ERROR: EXPERIMENTAL_ALLOWED_DOMAINS environment variable is required"
  exit 1
fi

# Check required environment variables
if [ -z "$RUNNER_TEMP" ]; then
  echo "ERROR: RUNNER_TEMP environment variable is required"
  exit 1
fi

if [ -z "$GITHUB_ENV" ]; then
  echo "ERROR: GITHUB_ENV environment variable is required"
  exit 1
fi

echo "Setting up network restrictions with Squid proxy..."

SQUID_START_TIME=$(date +%s.%N)

# Create whitelist file
echo "$EXPERIMENTAL_ALLOWED_DOMAINS" > $RUNNER_TEMP/whitelist.txt

# Ensure each domain has proper format
# If domain doesn't start with a dot and isn't an IP, add the dot for subdomain matching
mv $RUNNER_TEMP/whitelist.txt $RUNNER_TEMP/whitelist.txt.orig
while IFS= read -r domain; do
  if [ -n "$domain" ]; then
    # Trim whitespace
    domain=$(echo "$domain" | xargs)
    # If it's not empty and doesn't start with a dot, add one
    if [[ "$domain" != .* ]] && [[ ! "$domain" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo ".$domain" >> $RUNNER_TEMP/whitelist.txt
    else
      echo "$domain" >> $RUNNER_TEMP/whitelist.txt
    fi
  fi
done < $RUNNER_TEMP/whitelist.txt.orig

# Create Squid config with whitelist
echo "http_port 3128" > $RUNNER_TEMP/squid.conf
echo "" >> $RUNNER_TEMP/squid.conf
echo "# Define ACLs" >> $RUNNER_TEMP/squid.conf
echo "acl whitelist dstdomain \"/etc/squid/whitelist.txt\"" >> $RUNNER_TEMP/squid.conf
echo "acl localnet src 127.0.0.1/32" >> $RUNNER_TEMP/squid.conf
echo "acl localnet src 172.17.0.0/16" >> $RUNNER_TEMP/squid.conf
echo "acl SSL_ports port 443" >> $RUNNER_TEMP/squid.conf
echo "acl Safe_ports port 80" >> $RUNNER_TEMP/squid.conf
echo "acl Safe_ports port 443" >> $RUNNER_TEMP/squid.conf
echo "acl CONNECT method CONNECT" >> $RUNNER_TEMP/squid.conf
echo "" >> $RUNNER_TEMP/squid.conf
echo "# Deny requests to certain unsafe ports" >> $RUNNER_TEMP/squid.conf
echo "http_access deny !Safe_ports" >> $RUNNER_TEMP/squid.conf
echo "" >> $RUNNER_TEMP/squid.conf
echo "# Only allow CONNECT to SSL ports" >> $RUNNER_TEMP/squid.conf
echo "http_access deny CONNECT !SSL_ports" >> $RUNNER_TEMP/squid.conf
echo "" >> $RUNNER_TEMP/squid.conf
echo "# Allow localhost" >> $RUNNER_TEMP/squid.conf
echo "http_access allow localhost" >> $RUNNER_TEMP/squid.conf
echo "" >> $RUNNER_TEMP/squid.conf
echo "# Allow localnet access to whitelisted domains" >> $RUNNER_TEMP/squid.conf
echo "http_access allow localnet whitelist" >> $RUNNER_TEMP/squid.conf
echo "" >> $RUNNER_TEMP/squid.conf
echo "# Deny everything else" >> $RUNNER_TEMP/squid.conf
echo "http_access deny all" >> $RUNNER_TEMP/squid.conf

echo "Starting Squid proxy..."
# First, remove any existing container
sudo docker rm -f squid-proxy 2>/dev/null || true

# Ensure whitelist file is not empty (Squid fails with empty files)
if [ ! -s "$RUNNER_TEMP/whitelist.txt" ]; then
  echo "WARNING: Whitelist file is empty, adding a dummy entry"
  echo ".example.com" >> $RUNNER_TEMP/whitelist.txt
fi

# Use sudo to prevent Claude from stopping the container
CONTAINER_ID=$(sudo docker run -d \
  --name squid-proxy \
  -p 127.0.0.1:3128:3128 \
  -v $RUNNER_TEMP/squid.conf:/etc/squid/squid.conf:ro \
  -v $RUNNER_TEMP/whitelist.txt:/etc/squid/whitelist.txt:ro \
  ubuntu/squid:latest 2>&1) || {
  echo "ERROR: Failed to start Squid container"
  exit 1
}

# Wait for proxy to be ready (usually < 1 second)
READY=false
for i in {1..30}; do
  if nc -z 127.0.0.1 3128 2>/dev/null; then
    TOTAL_TIME=$(echo "scale=3; $(date +%s.%N) - $SQUID_START_TIME" | bc)
    echo "Squid proxy ready in ${TOTAL_TIME}s"
    READY=true
    break
  fi
  sleep 0.1
done

if [ "$READY" != "true" ]; then
  echo "ERROR: Squid proxy failed to start within 3 seconds"
  echo "Container logs:"
  sudo docker logs squid-proxy 2>&1 || true
  echo "Container status:"
  sudo docker ps -a | grep squid-proxy || true
  exit 1
fi

# Set proxy environment variables
echo "http_proxy=http://127.0.0.1:3128" >> $GITHUB_ENV
echo "https_proxy=http://127.0.0.1:3128" >> $GITHUB_ENV
echo "HTTP_PROXY=http://127.0.0.1:3128" >> $GITHUB_ENV
echo "HTTPS_PROXY=http://127.0.0.1:3128" >> $GITHUB_ENV

echo "Network restrictions setup completed successfully"