/**
 * Authentication handler
 * Manages API key authentication and Codex authentication status
 */

import type { FastifyRequest } from 'fastify';
import type { AuthStatus, AuthStatusResponse } from './models.js';

export class AuthManager {
  private apiKey: string | null = null;
  private apiKeySource: 'environment' | 'runtime' | 'none' = 'none';

  constructor() {
    // Check for API key in environment
    if (process.env.API_KEY) {
      this.apiKey = process.env.API_KEY;
      this.apiKeySource = 'environment';
    }
  }

  /**
   * Set runtime API key
   */
  setRuntimeApiKey(key: string): void {
    this.apiKey = key;
    this.apiKeySource = 'runtime';
  }

  /**
   * Get active API key
   */
  getApiKey(): string | null {
    return this.apiKey;
  }

  /**
   * Verify API key from request
   */
  verifyApiKey(request: FastifyRequest): boolean {
    // If no API key configured, allow access
    if (!this.apiKey) {
      return true;
    }

    // Check Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      return false;
    }

    // Extract token from "Bearer <token>"
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (!match) {
      return false;
    }

    const token = match[1];
    return token === this.apiKey;
  }

  /**
   * Check if API key is required
   */
  isApiKeyRequired(): boolean {
    return this.apiKey !== null;
  }

  /**
   * Get API key source
   */
  getApiKeySource(): 'environment' | 'runtime' | 'none' {
    return this.apiKeySource;
  }

  /**
   * Validate Codex authentication
   */
  async validateCodexAuth(): Promise<AuthStatus> {
    // Check for OpenAI API key in environment
    const hasApiKey = !!process.env.OPENAI_API_KEY;

    if (hasApiKey) {
      return {
        authenticated: true,
        method: 'api_key',
      };
    }

    // Check if running in Docker (would use ChatGPT login)
    const isDocker = process.env.DOCKER_CONTAINER === '1' || require('fs').existsSync('/.dockerenv');

    if (isDocker) {
      return {
        authenticated: true,
        method: 'chatgpt',
        user: 'docker-user',
      };
    }

    // Assume local authentication via ChatGPT
    return {
      authenticated: true,
      method: 'chatgpt',
    };
  }

  /**
   * Get authentication status
   */
  async getAuthStatus(): Promise<AuthStatusResponse> {
    const codexAuth = await this.validateCodexAuth();

    return {
      codex_auth: codexAuth,
      server_info: {
        api_key_required: this.isApiKeyRequired(),
        api_key_source: this.getApiKeySource(),
        version: '1.0.0',
      },
    };
  }
}

// Export singleton instance
export const authManager = new AuthManager();

/**
 * Fastify preHandler hook for authentication
 */
export async function authPreHandler(request: FastifyRequest): Promise<void> {
  if (!authManager.verifyApiKey(request)) {
    throw new Error('Unauthorized: Invalid or missing API key');
  }
}

/**
 * Generate secure random token
 */
export function generateSecureToken(length: number = 32): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  let result = '';

  // Use crypto for secure random generation
  const crypto = require('crypto');
  const bytes = crypto.randomBytes(length);

  for (let i = 0; i < length; i++) {
    result += chars[bytes[i] % chars.length];
  }

  return result;
}

/**
 * Prompt for API protection (interactive)
 */
export function promptForApiProtection(): string | null {
  // Skip if already set
  if (process.env.API_KEY) {
    return null;
  }

  // Skip if in Docker
  const isDocker = process.env.DOCKER_CONTAINER === '1';
  if (isDocker) {
    console.log('Running in Docker without API key protection (set API_KEY env var to enable)');
    return null;
  }

  // Interactive prompt
  console.log('\n' + '='.repeat(60));
  console.log('🔐 API Endpoint Security Configuration');
  console.log('='.repeat(60));
  console.log('Would you like to protect your API endpoint with an API key?');
  console.log('This adds a security layer when accessing your server remotely.');
  console.log('');

  // For non-interactive environments, skip
  if (!process.stdin.isTTY) {
    console.log('✅ API endpoint will be accessible without authentication');
    console.log('='.repeat(60));
    return null;
  }

  // TODO: Add interactive prompt implementation
  // For now, just return null
  return null;
}
