/**
 * Codex SDK client wrapper
 * Wraps @openai/codex-sdk with Claude Code-compatible interface
 */

import { Codex } from '@openai/codex-sdk';
import type { Message } from './models.js';
import type { FastifyBaseLogger } from 'fastify';

export interface CodexOptions {
  cwd?: string;
  timeout?: number;
  logger?: FastifyBaseLogger;
  approvalMode?: 'suggest' | 'auto-edit' | 'full-auto';
  networkAccess?: boolean;
}

export interface CodexResponse {
  content: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  thread_id?: string;
  finish_reason: 'stop' | 'length' | 'tool_calls' | null;
}

export interface StreamEvent {
  type: 'content' | 'usage' | 'complete' | 'error';
  content?: string;
  usage?: CodexResponse['usage'];
  thread_id?: string;
  finish_reason?: CodexResponse['finish_reason'];
  error?: string;
}

export class CodexClient {
  private codex: Codex;
  private cwd: string;
  private timeout: number;
  private logger?: FastifyBaseLogger;
  private networkAccess: boolean;

  constructor(options: CodexOptions = {}) {
    this.codex = new Codex();
    this.cwd = options.cwd || process.cwd();
    this.timeout = options.timeout || 600000;
    this.logger = options.logger;
    this.networkAccess = options.networkAccess !== undefined ? options.networkAccess : true;
  }

  /**
   * Verify Codex SDK is working and authenticated
   */
  async verify(): Promise<boolean> {
    try {
      this.logger?.info('Verifying Codex SDK...');
      
      const thread = this.codex.startThread({ workdir: this.cwd } as any);
      const result = await thread.run('Say "hello"');
      
      this.logger?.info('Codex SDK verified successfully');
      return true;
    } catch (error) {
      this.logger?.error({ error }, 'Codex SDK verification failed');
      return false;
    }
  }

  /**
   * Run a completion (non-streaming)
   */
  async runCompletion(
    prompt: string,
    options: {
      threadId?: string;
      maxTurns?: number;
      systemPrompt?: string;
      approvalMode?: 'suggest' | 'auto-edit' | 'full-auto';
      enableTools?: boolean;
    } = {}
  ): Promise<CodexResponse> {
    try {
      this.logger?.debug({ prompt, options }, 'Running Codex completion');

      // Start or resume thread with working directory
      const thread = options.threadId
        ? this.codex.resumeThread(options.threadId)
        : this.codex.startThread({ workdir: this.cwd } as any);

      // Prepend system prompt if provided
      const finalPrompt = options.systemPrompt
        ? `${options.systemPrompt}\n\n${prompt}`
        : prompt;

      // Run the completion
      const result = await thread.run(finalPrompt);

      // Extract content from result
      let content = '';
      if (typeof result === 'string') {
        content = result;
      } else if (result && typeof result === 'object') {
        content = JSON.stringify(result);
      }

      this.logger?.debug({ content }, 'Codex completion finished');

      return {
        content,
        usage: undefined,
        thread_id: (thread as any).id || undefined,
        finish_reason: 'stop',
      };
    } catch (error) {
      this.logger?.error({ error }, 'Codex completion failed');
      throw error;
    }
  }

  /**
   * Run a completion with streaming
   */
  async *runCompletionStreaming(
    prompt: string,
    options: {
      threadId?: string;
      maxTurns?: number;
      systemPrompt?: string;
      approvalMode?: 'suggest' | 'auto-edit' | 'full-auto';
      enableTools?: boolean;
    } = {}
  ): AsyncGenerator<StreamEvent> {
    try {
      this.logger?.debug({ prompt, options }, 'Running Codex streaming completion');

      // Start or resume thread with working directory
      const thread = options.threadId
        ? this.codex.resumeThread(options.threadId)
        : this.codex.startThread({ workdir: this.cwd } as any);

      // Prepend system prompt if provided
      const finalPrompt = options.systemPrompt
        ? `${options.systemPrompt}\n\n${prompt}`
        : prompt;

      // Run with streaming
      const { events } = await thread.runStreamed(finalPrompt);

      let totalUsage: StreamEvent['usage'];
      const threadId = (thread as any).id || undefined;

      // Process streaming events
      for await (const event of events) {
        this.logger?.debug({ event: event.type }, 'Received Codex event');

        switch (event.type) {
          case 'item.completed':
            if ('item' in event && event.item) {
              const item = event.item as any;

              if (item.type === 'text' && item.text) {
                yield {
                  type: 'content',
                  content: item.text,
                  thread_id: threadId,
                };
              } else if (item.type === 'message' && item.content) {
                const content = Array.isArray(item.content)
                  ? item.content.map((c: any) => c.text || '').join('')
                  : item.content;

                if (content) {
                  yield {
                    type: 'content',
                    content,
                    thread_id: threadId,
                  };
                }
              }
            }
            break;

          case 'turn.completed':
            if ('usage' in event && event.usage) {
              const usage = event.usage as any;
              totalUsage = {
                prompt_tokens: usage.inputTokens || 0,
                completion_tokens: usage.outputTokens || 0,
                total_tokens: (usage.inputTokens || 0) + (usage.outputTokens || 0),
              };

              yield {
                type: 'usage',
                usage: totalUsage,
                thread_id: threadId,
              };
            }
            break;

          case 'error':
            yield {
              type: 'error',
              error: 'error' in event ? String(event.error) : 'Unknown error',
              thread_id: threadId,
            };
            break;
        }
      }

      // Send completion event
      yield {
        type: 'complete',
        thread_id: threadId,
        finish_reason: 'stop',
        usage: totalUsage,
      };

      this.logger?.debug('Codex streaming completion finished');
    } catch (error) {
      this.logger?.error({ error }, 'Codex streaming completion failed');
      yield {
        type: 'error',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get thread/session ID from Codex
   */
  getThreadId(threadId?: string): string {
    if (threadId) {
      return threadId;
    }
    const thread = this.codex.startThread({ workdir: this.cwd } as any);
    return (thread as any).id || 'unknown';
  }
}
