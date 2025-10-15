/**
 * Claude Code API-compatible models for Codex wrapper
 */

// Message types
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  name?: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  type: 'function';
  function: FunctionCall;
}

export interface FunctionCall {
  name: string;
  arguments: string; // JSON string
}

// Chat completion request
export interface ChatCompletionRequest {
  model: string;
  messages: Message[];
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  stop?: string | string[];
  max_tokens?: number;
  presence_penalty?: number;
  frequency_penalty?: number;
  logit_bias?: Record<string, number>;
  user?: string;

  // Claude Code extensions
  session_id?: string;
  enable_tools?: boolean;
  tools?: Tool[];
  tool_choice?: 'none' | 'auto' | 'required' | { type: 'function'; function: { name: string } };
}

export interface Tool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters?: Record<string, any>;
  };
}

// Chat completion response
export interface ChatCompletionResponse {
  id: string;
  object: 'chat.completion';
  created: number;
  model: string;
  choices: Choice[];
  usage: Usage;
  system_fingerprint?: string | null;
}

export interface Choice {
  index: number;
  message: Message;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  logprobs?: any | null;
}

export interface Usage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// Streaming response
export interface ChatCompletionStreamResponse {
  id: string;
  object: 'chat.completion.chunk';
  created: number;
  model: string;
  choices: StreamChoice[];
  usage?: Usage;
}

export interface StreamChoice {
  index: number;
  delta: Partial<Message>;
  finish_reason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | null;
  logprobs?: any | null;
}

// Session management
export interface SessionInfo {
  session_id: string;
  created_at: string;
  last_active: string;
  message_count: number;
  expires_at: string;
}

export interface SessionListResponse {
  sessions: SessionInfo[];
  total: number;
}

// Error response
export interface ErrorResponse {
  error: {
    message: string;
    type: string;
    code?: string;
    details?: any;
  };
}

// Model info
export interface ModelInfo {
  id: string;
  object: 'model';
  owned_by: string;
  created?: number;
}

// Health check
export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  service: string;
  version?: string;
  codex_version?: string;
}

// Authentication status
export interface AuthStatus {
  authenticated: boolean;
  method: 'chatgpt' | 'api_key' | 'none';
  user?: string;
  errors?: string[];
}

export interface AuthStatusResponse {
  codex_auth: AuthStatus;
  server_info: {
    api_key_required: boolean;
    api_key_source: 'environment' | 'runtime' | 'none';
    version: string;
  };
}
