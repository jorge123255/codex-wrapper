/**
 * Tool Registry
 * Defines all available tools that Codex can use
 */

import type { Tool } from './models.js';

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  codex_native?: boolean; // Whether this tool is natively supported by Codex
}

/**
 * Registry of all available tools
 */
export class ToolRegistry {
  private tools: Map<string, ToolDefinition> = new Map();

  constructor() {
    this.registerDefaultTools();
  }

  /**
   * Register all default tools
   */
  private registerDefaultTools(): void {
    // File operations
    this.register({
      name: 'read_file',
      description: 'Read the contents of a file',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The path to the file to read (relative or absolute)',
          },
        },
        required: ['path'],
      },
      codex_native: true,
    });

    this.register({
      name: 'write_file',
      description: 'Write content to a file (creates or overwrites)',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The path to the file to write',
          },
          content: {
            type: 'string',
            description: 'The content to write to the file',
          },
        },
        required: ['path', 'content'],
      },
      codex_native: true,
    });

    this.register({
      name: 'edit_file',
      description: 'Edit a file by replacing text',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The path to the file to edit',
          },
          old_text: {
            type: 'string',
            description: 'The text to replace',
          },
          new_text: {
            type: 'string',
            description: 'The new text',
          },
        },
        required: ['path', 'old_text', 'new_text'],
      },
      codex_native: true,
    });

    this.register({
      name: 'run_command',
      description: 'Execute a bash/shell command',
      parameters: {
        type: 'object',
        properties: {
          command: {
            type: 'string',
            description: 'The command to execute',
          },
          cwd: {
            type: 'string',
            description: 'Working directory for the command (optional)',
          },
        },
        required: ['command'],
      },
      codex_native: true,
    });

    this.register({
      name: 'list_directory',
      description: 'List contents of a directory',
      parameters: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description: 'The directory path to list (defaults to current directory)',
          },
          recursive: {
            type: 'boolean',
            description: 'Whether to list recursively',
          },
        },
        required: [],
      },
      codex_native: true,
    });

    this.register({
      name: 'search_files',
      description: 'Search for files by name pattern (glob)',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Glob pattern (e.g., "*.ts", "**/*.json")',
          },
          path: {
            type: 'string',
            description: 'Directory to search in (optional)',
          },
        },
        required: ['pattern'],
      },
      codex_native: true,
    });

    this.register({
      name: 'search_in_files',
      description: 'Search for text within files (grep)',
      parameters: {
        type: 'object',
        properties: {
          pattern: {
            type: 'string',
            description: 'Text or regex pattern to search for',
          },
          path: {
            type: 'string',
            description: 'File or directory to search in (optional)',
          },
          file_pattern: {
            type: 'string',
            description: 'File pattern to filter (e.g., "*.ts")',
          },
        },
        required: ['pattern'],
      },
      codex_native: true,
    });

    // Web tools (require network access to be enabled)
    this.register({
      name: 'web_search',
      description: 'Search the web for information',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Search query',
          },
          num_results: {
            type: 'number',
            description: 'Number of results to return (default: 5)',
          },
        },
        required: ['query'],
      },
      codex_native: true, // Codex can use curl/wget when network is enabled
    });

    this.register({
      name: 'fetch_url',
      description: 'Fetch content from a URL',
      parameters: {
        type: 'object',
        properties: {
          url: {
            type: 'string',
            description: 'URL to fetch',
          },
          method: {
            type: 'string',
            description: 'HTTP method (GET, POST, etc.)',
            enum: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
          },
          headers: {
            type: 'object',
            description: 'HTTP headers (optional)',
          },
          body: {
            type: 'string',
            description: 'Request body (optional)',
          },
        },
        required: ['url'],
      },
      codex_native: true, // Codex can use curl when network is enabled
    });
  }

  /**
   * Register a tool
   */
  register(tool: ToolDefinition): void {
    this.tools.set(tool.name, tool);
  }

  /**
   * Get a tool by name
   */
  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  /**
   * Get all tools
   */
  getAll(): ToolDefinition[] {
    return Array.from(this.tools.values());
  }

  /**
   * Get tool names
   */
  getNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Format tools for OpenAI function calling format
   */
  formatForOpenAI(): Tool[] {
    return this.getAll().map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }

  /**
   * Check if a tool is natively supported by Codex
   */
  isNative(name: string): boolean {
    return this.tools.get(name)?.codex_native || false;
  }
}

// Export singleton instance
export const toolRegistry = new ToolRegistry();
