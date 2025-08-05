// Core Types
export interface UserGoal {
  id: string;
  userId: string;
  text: string;
  intent: GoalIntent;
  entities: GoalEntity[];
  priority: 'low' | 'medium' | 'high' | 'critical';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}

export interface GoalIntent {
  type: 'search' | 'booking' | 'shopping' | 'social' | 'summarize' | 'navigate';
  confidence: number;
  parameters: Record<string, string | number | boolean>;
}

export interface GoalEntity {
  type: 'location' | 'date' | 'product' | 'person' | 'organization';
  value: string;
  confidence: number;
  start: number;
  end: number;
}

// Browser Types
export interface BrowserContext {
  id: string;
  userId: string;
  sessionId: string;
  created: Date;
  lastUsed: Date;
  pageCount: number;
  memoryUsage: number;
}

export interface PageContent {
  url: string;
  title: string;
  text: string;
  html: string;
  metadata: PageMetadata;
  extractedAt: Date;
  extractorUsed: string;
}

export interface PageMetadata {
  author?: string;
  publishDate?: Date;
  description?: string;
  keywords?: string[];
  language?: string;
  readingTime?: number;
  wordCount?: number;
}

// Content Types
export interface ContentSummary {
  id: string;
  url: string;
  title: string;
  summary: string;
  keyPoints: string[];
  entities: ContentEntity[];
  sentiment: 'positive' | 'neutral' | 'negative';
  relevanceScore: number;
  createdAt: Date;
}

export interface ContentEntity {
  type: 'person' | 'organization' | 'location' | 'event' | 'product';
  name: string;
  confidence: number;
  mentions: number;
}

// Task Types
export interface Task {
  id: string;
  type: TaskType;
  userId: string;
  goalId: string;
  payload: TaskPayload;
  status: TaskStatus;
  priority: TaskPriority;
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  error?: string;
}

export type TaskType = 
  | 'navigate'
  | 'extract_content'
  | 'summarize'
  | 'search'
  | 'book_hotel'
  | 'find_product'
  | 'send_email';

export type TaskStatus = 
  | 'pending'
  | 'processing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type TaskPriority = 'low' | 'medium' | 'high' | 'critical';

export interface TaskPayload {
  url?: string;
  query?: string;
  content?: string;
  options?: Record<string, unknown>;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: Record<string, unknown>;
  executionTime: number;
}

// Claude API Types
export interface ClaudeRequest {
  model: string;
  max_tokens: number;
  messages: ClaudeMessage[];
  system?: string;
  temperature?: number;
  top_p?: number;
  stop_sequences?: string[];
}

export interface ClaudeMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ClaudeResponse {
  id: string;
  type: string;
  role: string;
  content: ClaudeContent[];
  model: string;
  stop_reason: string;
  stop_sequence?: string;
  usage: ClaudeUsage;
}

export interface ClaudeContent {
  type: 'text';
  text: string;
}

export interface ClaudeUsage {
  input_tokens: number;
  output_tokens: number;
}

// Authentication Types
export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: Date;
  lastLoginAt: Date;
  preferences: UserPreferences;
}

export interface UserPreferences {
  theme: 'light' | 'dark';
  language: string;
  notifications: boolean;
  autoSummarize: boolean;
  defaultPriority: TaskPriority;
}

export interface OAuthToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
  provider: 'gmail' | 'calendar' | 'linkedin';
}

// API Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: Date | string;
}

export interface PaginatedResponse<T = unknown> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

// Configuration Types
export interface AppConfig {
  port: number;
  nodeEnv: string;
  claudeApiKey: string;
  claudeModel: string;
  redisUrl: string;
  jwtSecret: string;
  encryptionKey: string;
  browserTimeout: number;
  browserMaxContexts: number;
  browserHeadless: boolean;
  logLevel: string;
  logFile: string;
}

// Error Types
export class SmartBrowserError extends Error {
  public code: string;
  public statusCode: number;
  public isOperational: boolean;

  constructor(
    message: string,
    code: string = 'UNKNOWN_ERROR',
    statusCode: number = 500,
    isOperational: boolean = true
  ) {
    super(message);
    this.name = 'SmartBrowserError';
    this.code = code;
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends SmartBrowserError {
  constructor(message: string) {
    super(message, 'VALIDATION_ERROR', 400);
  }
}

export class AuthenticationError extends SmartBrowserError {
  constructor(message: string) {
    super(message, 'AUTHENTICATION_ERROR', 401);
  }
}

export class AuthorizationError extends SmartBrowserError {
  constructor(message: string) {
    super(message, 'AUTHORIZATION_ERROR', 403);
  }
}

export class SecurityError extends SmartBrowserError {
  constructor(message: string) {
    super(message, 'SECURITY_ERROR', 400);
  }
}

export class NotFoundError extends SmartBrowserError {
  constructor(message: string) {
    super(message, 'NOT_FOUND_ERROR', 404);
  }
}

export class RateLimitError extends SmartBrowserError {
  constructor(message: string) {
    super(message, 'RATE_LIMIT_ERROR', 429);
  }
}

export class BrowserError extends SmartBrowserError {
  constructor(message: string) {
    super(message, 'BROWSER_ERROR', 500);
  }
}

export class ClaudeAPIError extends SmartBrowserError {
  constructor(message: string) {
    super(message, 'CLAUDE_API_ERROR', 502);
  }
}

export class ContentExtractionError extends SmartBrowserError {
  constructor(message: string) {
    super(message, 'CONTENT_EXTRACTION_ERROR', 500);
  }
}