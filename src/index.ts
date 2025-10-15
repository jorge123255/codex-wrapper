/**
 * Codex-Claude Wrapper
 * Claude Code API-compatible wrapper for OpenAI Codex
 */

import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { CodexClient } from './codex-client.js';
import { MessageAdapter } from './message-adapter.js';
import { sessionManager, SessionManager } from './session-manager.js';
import { authManager, authPreHandler, promptForApiProtection, generateSecureToken } from './auth.js';
import { toolHandler, ToolHandler } from './tool-handler.js';
import { toolRegistry } from './tools.js';
import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionStreamResponse,
  ErrorResponse,
  HealthResponse,
  ModelInfo,
  SessionInfo,
  SessionListResponse,
  Choice,
  Usage,
  StreamChoice,
} from './models.js';

// Load environment configuration
const PORT = parseInt(process.env.PORT || '8000', 10);
const HOST = process.env.HOST || '0.0.0.0';
const LOG_LEVEL = (process.env.LOG_LEVEL || 'info') as 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace';
const CORS_ORIGINS = JSON.parse(process.env.CORS_ORIGINS || '["*"]');
const MAX_TIMEOUT = parseInt(process.env.MAX_TIMEOUT || '600000', 10);

// Available models (Codex can use any OpenAI model)
const AVAILABLE_MODELS = [
  'gpt-4o',
  'gpt-4o-mini',
  'gpt-4-turbo',
  'gpt-4',
  'gpt-3.5-turbo',
  'o1',
  'gpt-5-codex',
  'gpt-5',
  'o1-mini',
  'o3-mini',
];

// Create Fastify instance
const fastify = Fastify({
  logger: {
    level: LOG_LEVEL,
    transport:
      LOG_LEVEL === 'debug'
        ? {
            target: 'pino-pretty',
            options: {
              colorize: true,
              translateTime: 'HH:MM:ss Z',
              ignore: 'pid,hostname',
            },
          }
        : undefined,
  },
});

// Initialize Codex client with network access enabled
const ENABLE_NETWORK = process.env.CODEX_NETWORK_ACCESS !== 'false'; // Enable by default
const codexClient = new CodexClient({
  cwd: process.env.CODEX_CWD,
  timeout: MAX_TIMEOUT,
  logger: fastify.log,
  networkAccess: ENABLE_NETWORK,
});

// Initialize session manager
const sessManager = new SessionManager({
  ttl: 3600000, // 1 hour
  logger: fastify.log,
});

// Initialize tool handler
const toolHdlr = new ToolHandler(fastify.log);

// Register CORS
await fastify.register(cors, {
  origin: CORS_ORIGINS,
  credentials: true,
});

// Helper: Create error response
function createErrorResponse(message: string, type: string = 'api_error', code?: string): ErrorResponse {
  return {
    error: {
      message,
      type,
      code,
    },
  };
}

// Helper: Generate request ID
function generateRequestId(): string {
  return `chatcmpl-${Math.random().toString(36).substring(2, 15)}`;
}

/**
 * POST /v1/chat/completions
 * Main chat completions endpoint (Claude Code compatible)
 */
fastify.post<{ Body: ChatCompletionRequest }>(
  '/v1/chat/completions',
  {
    preHandler: authPreHandler,
  },
  async (request, reply) => {
    try {
      const body = request.body;

      // Validate request
      const validation = MessageAdapter.validateMessages(body.messages);
      if (!validation.valid) {
        reply.code(400);
        return createErrorResponse(validation.error || 'Invalid messages', 'invalid_request_error');
      }

      // Process messages with session management
      const [allMessages, actualSessionId] = sessManager.processMessages(body.messages, body.session_id);

      // Convert messages to Codex prompt
      const [prompt, systemPrompt] = MessageAdapter.messagesToPrompt(allMessages);

      if (!prompt) {
        reply.code(400);
        return createErrorResponse('No valid prompt in messages', 'invalid_request_error');
      }

      // Get thread ID if using sessions
      const threadId = actualSessionId ? sessManager.getThreadId(actualSessionId) : undefined;

      // Determine if tools should be enabled
      const toolsEnabled = toolHdlr.shouldEnableTools(body);

      // Get tool configuration
      const [allowedTools, disallowedTools] = toolHdlr.getToolConfig(body);

      // Inject tool context if tools are provided
      let processedMessages = allMessages;
      if (body.tools && body.tools.length > 0) {
        processedMessages = toolHdlr.injectToolContext(allMessages, body.tools);
      }

      // Generate request ID
      const requestId = generateRequestId();

      // Handle streaming
      if (body.stream) {
        reply.raw.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          Connection: 'keep-alive',
        });

        // Stream response
        try {
          for await (const event of codexClient.runCompletionStreaming(prompt, {
            threadId,
            maxTurns: toolsEnabled ? 10 : 1,
            systemPrompt,
            enableTools: toolsEnabled,
            approvalMode: toolsEnabled ? 'auto-edit' : undefined,
          })) {
            if (event.type === 'content' && event.content) {
              const chunk: ChatCompletionStreamResponse = {
                id: requestId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: body.model,
                choices: [
                  {
                    index: 0,
                    delta: { role: 'assistant', content: event.content },
                    finish_reason: null,
                    logprobs: null,
                  },
                ],
              };

              reply.raw.write(`data: ${JSON.stringify(chunk)}\n\n`);
            } else if (event.type === 'complete') {
              // Send final chunk
              const finalChunk: ChatCompletionStreamResponse = {
                id: requestId,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model: body.model,
                choices: [
                  {
                    index: 0,
                    delta: {},
                    finish_reason: event.finish_reason || 'stop',
                    logprobs: null,
                  },
                ],
                usage: event.usage,
              };

              reply.raw.write(`data: ${JSON.stringify(finalChunk)}\n\n`);
              reply.raw.write('data: [DONE]\n\n');

              // Update session with thread ID
              if (actualSessionId && event.thread_id) {
                sessManager.setThreadId(actualSessionId, event.thread_id);
              }
            } else if (event.type === 'error') {
              throw new Error(event.error || 'Unknown error');
            }
          }

          reply.raw.end();
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          reply.raw.write(`data: ${JSON.stringify({ error: { message: errorMessage } })}\n\n`);
          reply.raw.end();
        }

        return reply;
      }

      // Non-streaming response
      const result = await codexClient.runCompletion(prompt, {
        threadId,
        maxTurns: toolsEnabled ? 10 : 1,
        systemPrompt,
        enableTools: toolsEnabled,
        approvalMode: toolsEnabled ? 'auto-edit' : undefined,
      });

      // Check for tool calls in response
      let toolCalls: any = undefined;
      let finishReason: 'stop' | 'tool_calls' = result.finish_reason === 'tool_calls' ? 'tool_calls' : 'stop';

      // Extract tool calls if tools were enabled
      if (toolsEnabled && result.content) {
        const extractedCalls = toolHdlr.extractToolCalls({
          role: 'assistant',
          content: result.content,
        });

        if (extractedCalls && extractedCalls.length > 0) {
          toolCalls = extractedCalls;
          finishReason = 'tool_calls';
        }
      }

      // Update session with thread ID and assistant response
      if (actualSessionId && result.thread_id) {
        sessManager.setThreadId(actualSessionId, result.thread_id);
        sessManager.addAssistantResponse(actualSessionId, {
          role: 'assistant',
          content: result.content,
        });
      }

      // Estimate tokens
      const promptTokens = MessageAdapter.estimateTokens(prompt);
      const completionTokens = MessageAdapter.estimateTokens(result.content);

      // Create response
      const response: ChatCompletionResponse = {
        id: requestId,
        object: 'chat.completion',
        created: Math.floor(Date.now() / 1000),
        model: body.model,
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: toolCalls ? null : result.content,
              tool_calls: toolCalls,
            },
            finish_reason: finishReason,
            logprobs: null,
          },
        ],
        usage: result.usage || {
          prompt_tokens: promptTokens,
          completion_tokens: completionTokens,
          total_tokens: promptTokens + completionTokens,
        },
        system_fingerprint: null,
      };

      return response;
    } catch (error) {
      fastify.log.error({ error }, 'Chat completion error');
      reply.code(500);
      return createErrorResponse(
        error instanceof Error ? error.message : 'Internal server error',
        'api_error'
      );
    }
  }
);

/**
 * GET /v1/models
 * List available models
 */
fastify.get('/v1/models', async (request, reply) => {
  const models: ModelInfo[] = AVAILABLE_MODELS.map((id) => ({
    id,
    object: 'model',
    owned_by: 'openai',
    created: Math.floor(Date.now() / 1000),
  }));

  return {
    object: 'list',
    data: models,
  };
});

/**
 * GET /v1/tools
 * List available tools/functions
 */
fastify.get('/v1/tools', async (request, reply) => {
  return {
    object: 'list',
    data: toolRegistry.formatForOpenAI(),
  };
});

/**
 * GET /health
 * Health check endpoint
 */
fastify.get('/health', async (request, reply) => {
  const response: HealthResponse = {
    status: 'healthy',
    service: 'codex-claude-wrapper',
    version: '1.0.0',
  };

  return response;
});

/**
 * GET /v1/auth/status
 * Authentication status
 */
fastify.get('/v1/auth/status', async (request, reply) => {
  return await authManager.getAuthStatus();
});

/**
 * GET /v1/sessions
 * List all sessions
 */
fastify.get(
  '/v1/sessions',
  {
    preHandler: authPreHandler,
  },
  async (request, reply) => {
    const sessions = sessManager.listSessions();
    const response: SessionListResponse = {
      sessions,
      total: sessions.length,
    };
    return response;
  }
);

/**
 * GET /v1/sessions/:sessionId
 * Get session details
 */
fastify.get<{ Params: { sessionId: string } }>(
  '/v1/sessions/:sessionId',
  {
    preHandler: authPreHandler,
  },
  async (request, reply) => {
    const session = sessManager.getSession(request.params.sessionId);

    if (!session) {
      reply.code(404);
      return createErrorResponse('Session not found', 'not_found_error');
    }

    return {
      session_id: session.sessionId,
      thread_id: session.threadId,
      created_at: session.createdAt.toISOString(),
      last_active: session.lastActive.toISOString(),
      message_count: session.messageCount,
      messages: session.messages,
    };
  }
);

/**
 * DELETE /v1/sessions/:sessionId
 * Delete a session
 */
fastify.delete<{ Params: { sessionId: string } }>(
  '/v1/sessions/:sessionId',
  {
    preHandler: authPreHandler,
  },
  async (request, reply) => {
    const deleted = sessManager.deleteSession(request.params.sessionId);

    if (!deleted) {
      reply.code(404);
      return createErrorResponse('Session not found', 'not_found_error');
    }

    return {
      message: `Session ${request.params.sessionId} deleted successfully`,
    };
  }
);

/**
 * GET /v1/sessions/stats
 * Get session statistics
 */
fastify.get(
  '/v1/sessions/stats',
  {
    preHandler: authPreHandler,
  },
  async (request, reply) => {
    return sessManager.getStats();
  }
);

// Startup
async function start() {
  try {
    // Handle API protection
    const runtimeKey = promptForApiProtection();
    if (runtimeKey) {
      authManager.setRuntimeApiKey(runtimeKey);
      fastify.log.info('API key protection enabled');
    }

    // Verify Codex SDK
    fastify.log.info('Verifying Codex SDK...');
    const verified = await codexClient.verify();

    if (verified) {
      fastify.log.info('✅ Codex SDK verified successfully');
    } else {
      fastify.log.warn('⚠️  Codex SDK verification failed - requests may fail');
    }

    // Start session cleanup
    sessManager.startCleanup(30); // Every 30 minutes

    // Start server
    await fastify.listen({ port: PORT, host: HOST });

    fastify.log.info(`
╔═══════════════════════════════════════════════════════════════╗
║                                                                ║
║  🚀 Codex-Claude Wrapper Server Started                       ║
║                                                                ║
║  📍 Server URL: http://${HOST}:${PORT}                         ║
║  📝 API Docs:   http://${HOST}:${PORT}/v1/models              ║
║  🔐 Auth:       ${authManager.isApiKeyRequired() ? 'Required' : 'Not Required'}                               ║
║                                                                ║
╚═══════════════════════════════════════════════════════════════╝
    `);
  } catch (error) {
    fastify.log.error(error);
    process.exit(1);
  }
}

// Handle shutdown
process.on('SIGINT', async () => {
  fastify.log.info('Shutting down...');
  sessManager.stopCleanup();
  await fastify.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  fastify.log.info('Shutting down...');
  sessManager.stopCleanup();
  await fastify.close();
  process.exit(0);
});

// Start the server
start();
