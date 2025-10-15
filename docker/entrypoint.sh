#!/bin/bash
set -e

echo "Starting Codex-Claude Wrapper Docker Container..."

# Create VNC password directory
mkdir -p /root/.vnc

# Validate and set VNC password
if [ -z "${VNC_PASSWORD}" ]; then
    echo "ERROR: VNC_PASSWORD environment variable is not set!"
    exit 1
fi

if [ ! -f /root/.vnc/passwd ]; then
    echo "Setting VNC password..."
    x11vnc -storepasswd "${VNC_PASSWORD}" /root/.vnc/passwd
fi

# Create config directories if they don't exist
mkdir -p /config/codex /config/api /data

# Set up environment
export CODEX_HOME=/config/codex
export HOME=/root
export DOCKER_CONTAINER=1

# Set authentication method
if [ -n "${OPENAI_API_KEY}" ]; then
    echo "Using OpenAI API key authentication"
    export OPENAI_API_KEY="${OPENAI_API_KEY}"
else
    echo "Using ChatGPT account authentication (login via browser)"
fi

# Configure API settings
if [ -n "${API_KEY}" ]; then
    export API_KEY="${API_KEY}"
    echo "API key protection enabled"
fi

# Set defaults
if [ -z "${CORS_ORIGINS}" ]; then
    export CORS_ORIGINS='["*"]'
fi

if [ -z "${LOG_LEVEL}" ]; then
    export LOG_LEVEL="info"
fi

if [ -z "${CODEX_NETWORK_ACCESS}" ]; then
    export CODEX_NETWORK_ACCESS="true"
fi

# Copy Codex config if needed
mkdir -p /root/.codex
if [ -f "/app/.codex/config.toml" ]; then
    cp /app/.codex/config.toml /root/.codex/config.toml
    echo "Codex config copied (network access: ${CODEX_NETWORK_ACCESS})"
fi

# Copy auth file if it exists in persistent storage
if [ -f "/config/codex/auth.json" ]; then
    echo "Restoring Codex authentication from persistent storage..."
    cp /config/codex/auth.json /root/.codex/auth.json
fi

# Configure git
git config --global init.defaultBranch main
git config --global user.email "codex@wrapper.local"
git config --global user.name "Codex Wrapper"
git config --global safe.directory '*'
echo "Git configured with safe.directory='*'"

# Initialize /data directory as trusted git repository
cd /data
if [ ! -d ".git" ]; then
    echo "Initializing /data as git repository..."
    git init
    echo "Git repository initialized in /data"
fi

# Start supervisor to manage all services
echo "Starting services..."
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
