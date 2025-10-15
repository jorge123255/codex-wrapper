# Dockerfile for Codex-Claude Wrapper with GUI support
FROM ubuntu:22.04

# Prevent interactive prompts during installation
ENV DEBIAN_FRONTEND=noninteractive
ENV TZ=UTC

# Install base packages
RUN apt-get update && apt-get install -y \
    # X11 and desktop environment
    xvfb \
    x11vnc \
    xfce4 \
    xfce4-terminal \
    dbus-x11 \
    # VNC and noVNC
    novnc \
    websockify \
    # Node.js and development tools
    curl \
    wget \
    git \
    nano \
    htop \
    ca-certificates \
    gnupg \
    # For add-apt-repository command
    software-properties-common \
    # Process management
    supervisor \
    # Dependencies for browser automation
    libgtk-3-0 \
    libgbm-dev \
    libnss3 \
    libxss1 \
    libasound2 \
    # Browser alternatives
    chromium-browser \
    # Clean up
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Firefox via Mozilla PPA
RUN add-apt-repository -y ppa:mozillateam/ppa && \
    echo 'Package: *\nPin: release o=LP-PPA-mozillateam\nPin-Priority: 1001' | tee /etc/apt/preferences.d/mozilla-firefox && \
    apt-get update && \
    apt-get install -y firefox && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install Node.js 20 from NodeSource
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && \
    apt-get install -y nodejs && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Install Codex CLI globally
RUN npm install -g @openai/codex

# Set up working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY tsconfig.json ./

# Install dependencies
RUN npm install

# Copy application source
COPY src ./src

# Copy Codex config
COPY .codex ./.codex

# Build TypeScript
RUN npm run build

# Copy Docker-specific files
COPY docker/supervisord.conf /etc/supervisor/conf.d/supervisord.conf
COPY docker/entrypoint.sh /app/entrypoint.sh

# Make scripts executable
RUN chmod +x /app/entrypoint.sh

# Create necessary directories
RUN mkdir -p /config/codex /config/api /data /var/log/supervisor

# Configure noVNC
RUN ln -s /usr/share/novnc/vnc.html /usr/share/novnc/index.html

# Set up environment variables
ENV DISPLAY=:1
ENV RESOLUTION=1920x1080x24
ENV VNC_PASSWORD=changeme
ENV NOVNC_PORT=6080
ENV API_PORT=8000
ENV DOCKER_CONTAINER=1

# Expose ports
EXPOSE 8000 6080

# Set entrypoint
ENTRYPOINT ["/app/entrypoint.sh"]

# Initialize /app as a git repository for Codex trust
RUN cd /app && \
    git config --global init.defaultBranch main && \
    git config --global user.email "codex@wrapper.local" && \
    git config --global user.name "Codex Wrapper" && \
    git config --global safe.directory '*' && \
    git init && \
    echo "Git repository initialized in /app"
