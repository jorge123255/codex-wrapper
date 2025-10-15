/**
 * Session Manager
 * Maps Claude Code sessions to Codex threads
 */

import type { Message, SessionInfo } from './models.js';
import type { FastifyBaseLogger } from 'fastify';

interface Session {
  sessionId: string;
  threadId: string;
  messages: Message[];
  createdAt: Date;
  lastActive: Date;
  messageCount: number;
}

export class SessionManager {
  private sessions: Map<string, Session> = new Map();
  private defaultTTL: number = 3600000; // 1 hour in milliseconds
  private cleanupInterval: NodeJS.Timeout | null = null;
  private logger?: FastifyBaseLogger;

  constructor(options: { ttl?: number; logger?: FastifyBaseLogger } = {}) {
    if (options.ttl) {
      this.defaultTTL = options.ttl;
    }
    this.logger = options.logger;
  }

  /**
   * Start cleanup task to remove expired sessions
   */
  startCleanup(intervalMinutes: number = 30): void {
    this.logger?.info(`Starting session cleanup task (every ${intervalMinutes} minutes)`);

    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Stop cleanup task
   */
  stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
      this.logger?.info('Session cleanup task stopped');
    }
  }

  /**
   * Process messages with session management
   * Returns [allMessages, actualSessionId]
   */
  processMessages(messages: Message[], sessionId?: string): [Message[], string | undefined] {
    if (!sessionId) {
      // No session - return messages as-is
      return [messages, undefined];
    }

    // Get or create session
    let session = this.sessions.get(sessionId);

    if (!session) {
      // Create new session
      session = {
        sessionId,
        threadId: '', // Will be set when first used with Codex
        messages: [],
        createdAt: new Date(),
        lastActive: new Date(),
        messageCount: 0,
      };
      this.sessions.set(sessionId, session);
      this.logger?.debug({ sessionId }, 'Created new session');
    }

    // Update last active time
    session.lastActive = new Date();

    // Add new messages to session history
    for (const message of messages) {
      if (message.role !== 'system') {
        // Don't store system messages in history
        session.messages.push(message);
        session.messageCount++;
      }
    }

    // Return all messages (history + new)
    return [session.messages, sessionId];
  }

  /**
   * Add assistant response to session
   */
  addAssistantResponse(sessionId: string, message: Message): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.messages.push(message);
      session.messageCount++;
      session.lastActive = new Date();
      this.logger?.debug({ sessionId }, 'Added assistant response to session');
    }
  }

  /**
   * Get thread ID for a session
   */
  getThreadId(sessionId: string): string | undefined {
    const session = this.sessions.get(sessionId);
    return session?.threadId;
  }

  /**
   * Set thread ID for a session
   */
  setThreadId(sessionId: string, threadId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.threadId = threadId;
      this.logger?.debug({ sessionId, threadId }, 'Set thread ID for session');
    }
  }

  /**
   * Get session info
   */
  getSession(sessionId: string): Session | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * List all sessions
   */
  listSessions(): SessionInfo[] {
    const sessions: SessionInfo[] = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      sessions.push({
        session_id: sessionId,
        created_at: session.createdAt.toISOString(),
        last_active: session.lastActive.toISOString(),
        message_count: session.messageCount,
        expires_at: new Date(session.lastActive.getTime() + this.defaultTTL).toISOString(),
      });
    }

    return sessions;
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId);
    if (deleted) {
      this.logger?.info({ sessionId }, 'Deleted session');
    }
    return deleted;
  }

  /**
   * Clean up expired sessions
   */
  private cleanup(): void {
    const now = Date.now();
    let deletedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      const expiresAt = session.lastActive.getTime() + this.defaultTTL;

      if (now > expiresAt) {
        this.sessions.delete(sessionId);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      this.logger?.info({ deletedCount }, 'Cleaned up expired sessions');
    }
  }

  /**
   * Get session statistics
   */
  getStats(): {
    activeSessions: number;
    totalMessages: number;
    oldestSession: string | null;
    newestSession: string | null;
  } {
    let totalMessages = 0;
    let oldestSession: Session | null = null;
    let newestSession: Session | null = null;

    for (const session of this.sessions.values()) {
      totalMessages += session.messageCount;

      if (!oldestSession || session.createdAt < oldestSession.createdAt) {
        oldestSession = session;
      }

      if (!newestSession || session.createdAt > newestSession.createdAt) {
        newestSession = session;
      }
    }

    return {
      activeSessions: this.sessions.size,
      totalMessages,
      oldestSession: oldestSession?.createdAt.toISOString() || null,
      newestSession: newestSession?.createdAt.toISOString() || null,
    };
  }

  /**
   * Clear all sessions (for testing)
   */
  clear(): void {
    this.sessions.clear();
    this.logger?.info('Cleared all sessions');
  }
}

// Export singleton instance
export const sessionManager = new SessionManager();
