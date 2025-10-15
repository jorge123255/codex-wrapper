/**
 * Message adapter
 * Converts between Claude Code message format and Codex prompts
 */

import type { Message } from './models.js';

export class MessageAdapter {
  /**
   * Convert Claude Code messages to Codex prompt format
   * Returns [prompt, systemPrompt] tuple
   */
  static messagesToPrompt(messages: Message[]): [string, string | undefined] {
    const systemMessages: string[] = [];
    const conversationMessages: string[] = [];

    for (const message of messages) {
      if (message.role === 'system') {
        // Collect system messages
        if (message.content) {
          systemMessages.push(message.content);
        }
      } else if (message.role === 'user') {
        // User messages
        const prefix = message.name ? `${message.name}: ` : '';
        conversationMessages.push(`User: ${prefix}${message.content || ''}`);
      } else if (message.role === 'assistant') {
        // Assistant messages
        if (message.content) {
          conversationMessages.push(`Assistant: ${message.content}`);
        }

        // Handle tool calls
        if (message.tool_calls && message.tool_calls.length > 0) {
          const toolCallsStr = message.tool_calls
            .map((tc) => `Tool call: ${tc.function.name}(${tc.function.arguments})`)
            .join('\n');
          conversationMessages.push(`Assistant: ${toolCallsStr}`);
        }
      } else if (message.role === 'tool') {
        // Tool response messages
        conversationMessages.push(`Tool result: ${message.content || ''}`);
      }
    }

    // Combine system messages
    const systemPrompt = systemMessages.length > 0 ? systemMessages.join('\n\n') : undefined;

    // Combine conversation messages
    const prompt = conversationMessages.join('\n\n');

    return [prompt, systemPrompt];
  }

  /**
   * Estimate token count (rough approximation)
   * Uses the same logic as Claude wrapper: ~4 characters per token
   */
  static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Filter content for unsupported features
   * (e.g., images, complex content types)
   */
  static filterContent(content: string): string {
    // For now, just return as-is
    // In the future, we might need to filter out specific patterns
    return content;
  }

  /**
   * Extract the last user message from a list of messages
   * Useful for extracting the current prompt
   */
  static getLastUserMessage(messages: Message[]): string | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user' && messages[i].content) {
        return messages[i].content;
      }
    }
    return null;
  }

  /**
   * Build a conversation history string
   * Useful for maintaining context
   */
  static buildConversationHistory(messages: Message[]): string {
    const parts: string[] = [];

    for (const message of messages) {
      switch (message.role) {
        case 'system':
          if (message.content) {
            parts.push(`[System]: ${message.content}`);
          }
          break;
        case 'user':
          if (message.content) {
            const prefix = message.name ? `[${message.name}]` : '[User]';
            parts.push(`${prefix}: ${message.content}`);
          }
          break;
        case 'assistant':
          if (message.content) {
            parts.push(`[Assistant]: ${message.content}`);
          }
          if (message.tool_calls) {
            for (const toolCall of message.tool_calls) {
              parts.push(`[Tool Call]: ${toolCall.function.name}(${toolCall.function.arguments})`);
            }
          }
          break;
        case 'tool':
          if (message.content) {
            parts.push(`[Tool Result]: ${message.content}`);
          }
          break;
      }
    }

    return parts.join('\n\n');
  }

  /**
   * Split messages into history and current prompt
   * Returns [historyMessages, currentMessage]
   */
  static splitMessages(messages: Message[]): [Message[], Message | null] {
    if (messages.length === 0) {
      return [[], null];
    }

    // Get all messages except the last one as history
    const history = messages.slice(0, -1);
    const current = messages[messages.length - 1];

    return [history, current];
  }

  /**
   * Validate messages array
   * Ensures messages follow Claude Code format requirements
   */
  static validateMessages(messages: Message[]): { valid: boolean; error?: string } {
    if (!Array.isArray(messages) || messages.length === 0) {
      return { valid: false, error: 'Messages must be a non-empty array' };
    }

    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];

      // Check required fields
      if (!message.role) {
        return { valid: false, error: `Message at index ${i} missing required field: role` };
      }

      // Check valid roles
      if (!['system', 'user', 'assistant', 'tool'].includes(message.role)) {
        return { valid: false, error: `Message at index ${i} has invalid role: ${message.role}` };
      }

      // Content required for user messages
      if (message.role === 'user' && !message.content) {
        return { valid: false, error: `User message at index ${i} missing content` };
      }
    }

    return { valid: true };
  }
}
