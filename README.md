# Codex-Claude Wrapper

A **Claude Code API-compatible wrapper** for OpenAI Codex, allowing you to use Codex with Claude Code-compatible applications and clients.

## Overview

This wrapper makes OpenAI Codex CLI speak the Claude Code API format, enabling seamless integration with applications designed for Claude Code. It's the reverse of the Claude-OpenAI wrapper - instead of wrapping Claude to speak OpenAI's API, this wraps Codex to speak Claude's API.

## Features

- **Claude Code API Compatible**: Full support for Claude Code API endpoints
- **OpenAI Codex Integration**: Built on the official `@openai/codex-sdk`
- **Streaming & Non-Streaming**: Support for both response types
- **Session Management**: Thread/session continuity across requests
- **Docker Deployment**: Complete containerized setup with desktop GUI
- **Authentication**: Multiple auth methods (ChatGPT account, API key)
- **Tool Support**: Enable/disable Codex tools per request
- **TypeScript**: Fully typed with modern TypeScript

## Architecture

```
┌─────────────────────────────────────────┐
│   Claude Code Compatible Application    │
│   (expects Claude Code API format)      │
└────────────────┬────────────────────────┘
                 │
                 │ Claude Code API Format
                 │
┌────────────────▼────────────────────────┐
│     Codex-Claude Wrapper (FastifyAPI Server)         │
│  - Message Adapter                       │
│  - Session Manager                       │
│  - Auth Handler                          │
└────────────────┬────────────────────────┘
                 │
                 │ Codex SDK Format
                 │
┌────────────────▼────────────────────────┐
│     @openai/codex-sdk                    │
│     (OpenAI Codex CLI)                   │
└──────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

1. **Node.js 18+**: Required for the server and Codex CLI
2. **OpenAI Codex CLI**: Install globally
   ```bash
   npm install -g @openai/codex
   ```
3. **Authentication**: Either ChatGPT account or OpenAI API key

### Local Development

```bash
# Clone the repository
git clone <your-repo-url>
cd codex-claude-wrapper

# Install dependencies
npm install

# Copy environment file
cp .env.example .env
# Edit .env with your configuration

# Build TypeScript
npm run build

# Start the server
npm start

# Or run in development mode with auto-reload
npm run dev
```

The server will start on `http://localhost:8000`

### Docker Deployment

```bash
# Create .env file
cp .env.example .env

# IMPORTANT: Set a secure VNC password
echo "VNC_PASSWORD=$(openssl rand -base64 12)" >> .env

# Optional: Add OpenAI API key
echo "OPENAI_API_KEY=your-api-key-here" >> .env

# Build and start
docker-compose up -d

# View logs
docker-compose logs -f
```

**Access Points:**
- API Server: `http://localhost:8001`
- Desktop GUI (for authentication): `http://localhost:6081` (use VNC password)

## API Endpoints

### Core Endpoints

#### `POST /v1/chat/completions`
Main chat completions endpoint (Claude Code compatible)

**Request:**
```json
{
  "model": "gpt-4o",
  "messages": [
    {"role": "user", "content": "Hello!"}
  ],
  "stream": false,
  "session_id": "optional-session-id",
  "enable_tools": false
}
```

**Response:**
```json
{
  "id": "chatcmpl-xxx",
  "object": "chat.completion",
  "created": 1234567890,
  "model": "gpt-4o",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Hello! How can I help you?"
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "completion_tokens": 8,
    "total_tokens": 18
  }
}
```

#### `GET /v1/models`
List available Codex models

#### `GET /health`
Health check endpoint

#### `GET /v1/auth/status`
Check authentication status

### Session Management

#### `GET /v1/sessions`
List all active sessions

#### `GET /v1/sessions/:sessionId`
Get session details

#### `DELETE /v1/sessions/:sessionId`
Delete a session

#### `GET /v1/sessions/stats`
Get session statistics

#### `GET /v1/tools`
List all available tools/functions

## Tools & Capabilities

The wrapper provides access to Codex's powerful tool capabilities through the Claude Code API format. Tools are disabled by default for speed, but can be enabled per request.

### Available Tools

#### File Operations
1. **read_file** - Read file contents
2. **write_file** - Write content to files (create or overwrite)
3. **edit_file** - Edit files by replacing text
4. **list_directory** - List directory contents
5. **search_files** - Search for files by name pattern (glob)
6. **search_in_files** - Search for text within files (grep)

#### System Operations
7. **run_command** - Execute bash/shell commands

#### Web Operations (requires network access)
8. **web_search** - Search the web for information
9. **fetch_url** - Fetch content from URLs (HTTP requests)

### Tool Modes

Codex operates in different approval modes that control tool execution:

- **suggest** (default when disabled): Codex suggests actions but requires approval
- **auto-edit**: Automatically reads and edits files, asks before running commands
- **full-auto**: Fully autonomous (reads, writes, runs commands without asking)

### Enabling Tools

#### Method 1: Simple Enable Flag

```json
{
  "model": "gpt-4o",
  "messages": [{"role": "user", "content": "Read README.md and summarize it"}],
  "enable_tools": true
}
```

#### Method 2: OpenAI Function Calling Format

```json
{
  "model": "gpt-4o",
  "messages": [{"role": "user", "content": "Read the package.json file"}],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "read_file",
        "description": "Read file contents",
        "parameters": {
          "type": "object",
          "properties": {
            "path": {"type": "string", "description": "File path"}
          },
          "required": ["path"]
        }
      }
    }
  ],
  "tool_choice": "auto"
}
```

#### Method 3: Specific Tools

```json
{
  "model": "gpt-4o",
  "messages": [{"role": "user", "content": "List all TypeScript files"}],
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "search_files",
        "parameters": {
          "type": "object",
          "properties": {
            "pattern": {"type": "string"}
          }
        }
      }
    }
  ]
}
```

### Tool Usage Examples

```bash
# Enable all tools
curl -X POST http://localhost:8001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Read package.json and list its dependencies"}],
    "enable_tools": true
  }'

# Use specific tool (function calling)
curl -X POST http://localhost:8001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Find all .ts files in src/"}],
    "tools": [
      {
        "type": "function",
        "function": {
          "name": "search_files",
          "parameters": {
            "type": "object",
            "properties": {
              "pattern": {"type": "string"},
              "path": {"type": "string"}
            }
          }
        }
      }
    ]
  }'

# List available tools
curl http://localhost:8001/v1/tools
```

### Tool Response Format

When Codex uses tools, the response includes `tool_calls`:

```json
{
  "id": "chatcmpl-xxx",
  "choices": [{
    "message": {
      "role": "assistant",
      "content": null,
      "tool_calls": [{
        "id": "call_abc123",
        "type": "function",
        "function": {
          "name": "read_file",
          "arguments": "{\"path\": \"package.json\"}"
        }
      }]
    },
    "finish_reason": "tool_calls"
  }]
}
```

### Network Access

**Network access is ENABLED by default** in this wrapper to support web search and URL fetching.

#### Enabling/Disabling Network

```bash
# Disable network access
export CODEX_NETWORK_ACCESS=false
npm start

# Or in .env file
CODEX_NETWORK_ACCESS=false
```

#### Web Tool Examples

```bash
# Web search
curl -X POST http://localhost:8001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Search the web for latest TypeScript features"}],
    "tools": [{"type": "function", "function": {"name": "web_search"}}],
    "enable_tools": true
  }'

# Fetch URL
curl -X POST http://localhost:8001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Fetch https://api.github.com/repos/openai/codex"}],
    "tools": [{"type": "function", "function": {"name": "fetch_url"}}],
    "enable_tools": true
  }'
```

### Security & Sandboxing

Codex runs in a controlled sandbox environment:
- **Network enabled**: Allows web search and HTTP requests (can be disabled)
- **Directory confined**: File operations restricted to working directory
- **Approval modes**: Control what Codex can do without asking
- **Workspace isolation**: Cannot access files outside the workspace

## Usage Examples

### Using curl

```bash
# Basic chat completion
curl -X POST http://localhost:8001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "What is 2+2?"}]
  }'

# With session continuity
curl -X POST http://localhost:8001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "Remember: my name is Alice"}],
    "session_id": "my-session"
  }'

# Continue conversation
curl -X POST http://localhost:8001/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [{"role": "user", "content": "What is my name?"}],
    "session_id": "my-session"
  }'
```

### Using as Claude Code Backend

You can use this wrapper with any Claude Code-compatible application:

```typescript
// Configure your Claude Code client
const client = new ClaudeCodeClient({
  baseUrl: "http://localhost:8001/v1",
  apiKey: "your-api-key-if-enabled"
});

// Now use it as if it were Claude Code
const response = await client.chat.completions.create({
  model: "gpt-4o",
  messages: [{ role: "user", content: "Hello!" }]
});
```

## Configuration

### Environment Variables

```bash
# Server Configuration
PORT=8000                    # API server port
HOST=0.0.0.0                # Listen address
LOG_LEVEL=info              # Logging level (debug, info, warn, error)

# Security
API_KEY=                    # Optional API key for authentication
VNC_PASSWORD=changeme       # VNC password (Docker only)

# OpenAI Codex
OPENAI_API_KEY=             # OpenAI API key (alternative to ChatGPT login)

# Server Settings
CORS_ORIGINS=["*"]          # CORS allowed origins
MAX_TIMEOUT=600000          # Request timeout (ms)
CODEX_CWD=                  # Working directory for Codex

# Codex Configuration
CODEX_NETWORK_ACCESS=true   # Enable network access (default: true)
```

## Supported Models

The wrapper supports all OpenAI models available through Codex:

- `gpt-5-codex` ⭐ NEW (Optimized for coding tasks with many tools)
- `gpt-5` ⭐ NEW (Broad world knowledge with strong general reasoning)
- `gpt-4o` (Recommended)
- `gpt-4o-mini`
- `gpt-4-turbo`
- `gpt-4`
- `gpt-3.5-turbo`
- `o1`
- `o1-mini`
- `o3-mini`

## Authentication

### Method 1: OpenAI API Key (Recommended)

```bash
export OPENAI_API_KEY=your-openai-api-key
npm start
```

### Method 2: ChatGPT Account (Docker)

1. Start the Docker container
2. Access the desktop at `http://localhost:6081`
3. Enter your VNC password
4. Codex will prompt for ChatGPT login in the browser
5. Complete authentication
6. API server starts automatically

### API Key Protection

To protect your API endpoints:

```bash
# Generate a secure key
export API_KEY=$(openssl rand -base64 24)

# Start server
npm start

# Use in requests
curl -H "Authorization: Bearer $API_KEY" http://localhost:8001/v1/models
```

## Docker Details

### Building

```bash
docker-compose build
```

### Running

```bash
# Start in background
docker-compose up -d

# View logs
docker-compose logs -f codex-claude-wrapper

# Stop
docker-compose down
```

### Volumes

- `codex_auth`: Codex authentication data
- `api_config`: API configuration
- `user_data`: User projects/data
- `logs`: Application logs

## Development

### Project Structure

```
codex-claude-wrapper/
├── src/
│   ├── index.ts           # Main server
│   ├── codex-client.ts    # Codex SDK wrapper
│   ├── message-adapter.ts # Message format converter
│   ├── session-manager.ts # Session/thread management
│   ├── auth.ts            # Authentication handler
│   └── models.ts          # TypeScript interfaces
├── docker/
│   ├── Dockerfile
│   ├── entrypoint.sh
│   └── supervisord.conf
├── package.json
├── tsconfig.json
└── docker-compose.yml
```

### Adding Features

1. **Add new endpoint**: Edit `src/index.ts`
2. **Modify message format**: Edit `src/message-adapter.ts`
3. **Enhance Codex integration**: Edit `src/codex-client.ts`
4. **Update models**: Edit `src/models.ts`

### Building

```bash
# Build TypeScript
npm run build

# Watch mode
npm run dev
```

## Troubleshooting

### Codex CLI not found

```bash
# Verify installation
which codex
codex --version

# Reinstall
npm install -g @openai/codex
```

### Authentication errors

```bash
# Test Codex CLI directly
codex --help

# Check authentication
codex auth status

# Re-authenticate
codex auth login
```

### Docker issues

```bash
# Check container status
docker-compose ps

# View logs
docker-compose logs codex-claude-wrapper

# Restart
docker-compose restart

# Rebuild
docker-compose up -d --build
```

## Comparison with Claude Wrapper

| Feature | Claude Wrapper | Codex Wrapper |
|---------|---------------|---------------|
| **Direction** | Claude → OpenAI API | Codex → Claude API |
| **Language** | Python | TypeScript |
| **Framework** | FastAPI | Fastify |
| **SDK** | claude-code-sdk (Python) | @openai/codex-sdk (TypeScript) |
| **Models** | Claude models | OpenAI models |
| **CLI Tool** | Claude Code (Node.js) | Codex (Rust) |
| **Tools** | 7 tools | 9 tools (includes web) |
| **Network Access** | Yes | **Yes (enabled by default)** |
| **Web Search** | ✅ | ✅ |
| **URL Fetching** | ✅ | ✅ |

## License

MIT

## Contributing

Contributions welcome! Please open an issue or submit a pull request.

## Credits

- Built on [@openai/codex-sdk](https://www.npmjs.com/package/@openai/codex-sdk)
- Inspired by [Claude Code OpenAI Wrapper](https://github.com/jorge123255/claude-code-openai-wrapper)
