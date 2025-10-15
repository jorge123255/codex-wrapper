/**
 * Tool Handler
 * Handles tool enabling/disabling and tool call extraction
 */

import type { Tool, ToolCall, Message } from './models.js';
import { toolRegistry } from './tools.js';
import type { FastifyBaseLogger } from 'fastify';

export interface ToolConfig {
  enabled: boolean;
  allowed?: string[];
  disallowed?: string[];
}

export class ToolHandler {
  private logger?: FastifyBaseLogger;

  constructor(logger?: FastifyBaseLogger) {
    this.logger = logger;
  }

  /**
   * Determine if tools should be enabled based on request
   */
  shouldEnableTools(request: any): boolean {
    // Explicitly enabled via enable_tools flag
    if (request.enable_tools === true) {
      return true;
    }

    // Tools provided in OpenAI format
    if (request.tools && Array.isArray(request.tools) && request.tools.length > 0) {
      return true;
    }

    // Legacy functions format
    if (request.functions && Array.isArray(request.functions) && request.functions.length > 0) {
      return true;
    }

    // Default: disabled for speed
    return false;
  }

  /**
   * Get tool configuration from request
   * Returns [allowed_tools, disallowed_tools]
   */
  getToolConfig(request: any): [string[] | undefined, string[] | undefined] {
    const toolsEnabled = this.shouldEnableTools(request);

    if (!toolsEnabled) {
      // Disable all tools
      const allTools = toolRegistry.getNames();
      return [undefined, allTools];
    }

    // Check for specific tools requested
    if (request.tools && Array.isArray(request.tools)) {
      // Extract tool names from OpenAI format
      const requestedTools = request.tools
        .filter((t: any) => t.type === 'function')
        .map((t: any) => t.function?.name)
        .filter(Boolean);

      if (requestedTools.length > 0) {
        this.logger?.debug({ requestedTools }, 'Specific tools requested');
        return [requestedTools, undefined];
      }
    }

    // Check for tool_choice
    if (request.tool_choice) {
      if (request.tool_choice === 'none') {
        // Disable all tools
        const allTools = toolRegistry.getNames();
        return [undefined, allTools];
      } else if (
        typeof request.tool_choice === 'object' &&
        request.tool_choice.type === 'function'
      ) {
        // Specific function required
        const toolName = request.tool_choice.function?.name;
        if (toolName) {
          return [[toolName], undefined];
        }
      }
    }

    // Default: all tools enabled
    this.logger?.debug('All tools enabled');
    return [undefined, undefined];
  }

  /**
   * Inject tool context into messages
   * Adds tool descriptions to help Codex understand available tools
   */
  injectToolContext(messages: Message[], tools: Tool[]): Message[] {
    if (!tools || tools.length === 0) {
      return messages;
    }

    // Create a system message describing available tools
    const toolDescriptions = tools
      .map((tool) => {
        const params = tool.function.parameters
          ? JSON.stringify(tool.function.parameters)
          : '{}';
        return `- ${tool.function.name}: ${tool.function.description || 'No description'}\n  Parameters: ${params}`;
      })
      .join('\n\n');

    const toolContext = `You have access to the following tools:\n\n${toolDescriptions}\n\nWhen you need to use a tool, clearly indicate which tool and what parameters you're using.`;

    // Check if there's already a system message
    const hasSystemMessage = messages.some((m) => m.role === 'system');

    if (hasSystemMessage) {
      // Append to existing system message
      return messages.map((msg) =>
        msg.role === 'system'
          ? { ...msg, content: `${msg.content}\n\n${toolContext}` }
          : msg
      );
    } else {
      // Add new system message at the beginning
      return [{ role: 'system', content: toolContext }, ...messages];
    }
  }

  /**
   * Extract tool calls from Codex response
   * Codex doesn't natively output OpenAI function calling format,
   * so we need to parse its response text for tool usage
   */
  extractToolCalls(message: Message): ToolCall[] | undefined {
    if (!message.content) {
      return undefined;
    }

    const toolCalls: ToolCall[] = [];
    const content = message.content;

    // Try to detect tool usage patterns in Codex output
    // This is a simple heuristic - Codex might output tool usage differently

    // Pattern 1: Explicit function call format
    // Example: "read_file({\"path\": \"example.ts\"})"
    const functionCallPattern = /(\w+)\((\{[^}]+\})\)/g;
    let match;

    while ((match = functionCallPattern.exec(content)) !== null) {
      const [, functionName, argsStr] = match;

      // Check if this is a registered tool
      if (toolRegistry.get(functionName)) {
        try {
          const args = JSON.parse(argsStr);

          toolCalls.push({
            id: `call_${Math.random().toString(36).substr(2, 9)}`,
            type: 'function',
            function: {
              name: functionName,
              arguments: JSON.stringify(args),
            },
          });
        } catch (e) {
          // Invalid JSON, skip
          this.logger?.debug({ functionName, argsStr }, 'Failed to parse tool call arguments');
        }
      }
    }

    // Pattern 2: Markdown code blocks with tool annotations
    // Example: ```read_file\n{"path": "example.ts"}\n```
    const codeBlockPattern = /```(\w+)\n(\{[\s\S]*?\})\n```/g;

    while ((match = codeBlockPattern.exec(content)) !== null) {
      const [, functionName, argsStr] = match;

      if (toolRegistry.get(functionName)) {
        try {
          const args = JSON.parse(argsStr);

          toolCalls.push({
            id: `call_${Math.random().toString(36).substr(2, 9)}`,
            type: 'function',
            function: {
              name: functionName,
              arguments: JSON.stringify(args),
            },
          });
        } catch (e) {
          this.logger?.debug({ functionName, argsStr }, 'Failed to parse tool call from code block');
        }
      }
    }

    return toolCalls.length > 0 ? toolCalls : undefined;
  }

  /**
   * Format tool result for Codex
   * Converts tool execution result back to text format for Codex
   */
  formatToolResult(toolName: string, result: any): string {
    return `Tool: ${toolName}\nResult:\n${typeof result === 'string' ? result : JSON.stringify(result, null, 2)}`;
  }
}

// Export singleton instance
export const toolHandler = new ToolHandler();
