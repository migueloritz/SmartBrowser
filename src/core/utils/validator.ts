import Joi from 'joi';
import { ValidationError, SecurityError } from '@/types';

class Validator {
  private readonly maxInputLength = 10000;
  private readonly urlPattern = /^https?:\/\/[^\s$.?#].[^\s]*$/;
  private readonly dangerousPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /data:text\/html/gi,
    /eval\s*\(/gi,
    /document\.write/gi,
    /window\.location/gi,
    /\.innerHTML\s*=/gi
  ];

  private readonly blockedDomains = new Set([
    'malicious-site.com',
    'phishing-site.com',
    // Add more blocked domains as needed
  ]);

  // Schema definitions
  private readonly schemas = {
    userGoal: Joi.object({
      text: Joi.string().max(this.maxInputLength).required(),
      priority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium')
    }),

    url: Joi.string().uri({ scheme: ['http', 'https'] }).required(),

    taskPayload: Joi.object({
      url: Joi.string().uri({ scheme: ['http', 'https'] }).optional(),
      query: Joi.string().max(1000).optional(),
      content: Joi.string().max(50000).optional(),
      options: Joi.object().optional()
    }),

    userPreferences: Joi.object({
      theme: Joi.string().valid('light', 'dark').default('light'),
      language: Joi.string().length(2).default('en'),
      notifications: Joi.boolean().default(true),
      autoSummarize: Joi.boolean().default(false),
      defaultPriority: Joi.string().valid('low', 'medium', 'high', 'critical').default('medium')
    })
  };

  public validateUserGoal(goal: any): any {
    const { error, value } = this.schemas.userGoal.validate(goal);
    if (error) {
      throw new ValidationError(`Invalid user goal: ${error.details[0]?.message}`);
    }

    // Check for dangerous content
    this.checkForMaliciousContent(value.text);
    
    return {
      ...value,
      text: this.sanitizeString(value.text)
    };
  }

  public validateUrl(url: string): string {
    const { error } = this.schemas.url.validate(url);
    if (error) {
      throw new ValidationError(`Invalid URL: ${error.details[0]?.message}`);
    }

    // Check against blocklist
    const hostname = new URL(url).hostname.toLowerCase();
    if (this.isBlockedDomain(hostname)) {
      throw new SecurityError(`Domain ${hostname} is blocked`);
    }

    return url;
  }

  public validateTaskPayload(payload: any): any {
    const { error, value } = this.schemas.taskPayload.validate(payload);
    if (error) {
      throw new ValidationError(`Invalid task payload: ${error.details[0]?.message}`);
    }

    // Validate URL if present
    if (value.url) {
      value.url = this.validateUrl(value.url);
    }

    // Sanitize string fields
    if (value.query) {
      value.query = this.sanitizeString(value.query);
    }
    if (value.content) {
      value.content = this.sanitizeString(value.content);
    }

    return value;
  }

  public validateUserPreferences(preferences: any): any {
    const { error, value } = this.schemas.userPreferences.validate(preferences);
    if (error) {
      throw new ValidationError(`Invalid user preferences: ${error.details[0]?.message}`);
    }
    return value;
  }

  public validateClaudeResponse(response: string): boolean {
    if (!response || typeof response !== 'string') {
      return false;
    }

    // Check for suspicious patterns
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(response)) {
        return false;
      }
    }

    return true;
  }

  public sanitizeString(input: string): string {
    if (!input || typeof input !== 'string') {
      return '';
    }

    return input
      .replace(/[<>]/g, '') // Remove angle brackets
      .replace(/javascript:/gi, '') // Remove javascript protocols
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .trim()
      .substring(0, this.maxInputLength);
  }

  public validateEmail(email: string): boolean {
    const emailSchema = Joi.string().email().required();
    const { error } = emailSchema.validate(email);
    return !error;
  }

  public validatePassword(password: string): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long');
    }
    if (!/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }
    if (!/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }
    if (!/\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }
    if (!/[!@#$%^&*(),.?":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  private checkForMaliciousContent(input: string): void {
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(input)) {
        throw new SecurityError('Input contains potentially dangerous content');
      }
    }
  }

  private isBlockedDomain(hostname: string): boolean {
    return this.blockedDomains.has(hostname.toLowerCase());
  }

  public isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
  }

  public validatePagination(page?: number, limit?: number): { page: number; limit: number } {
    const validatedPage = Math.max(1, page || 1);
    const validatedLimit = Math.min(100, Math.max(1, limit || 10));
    
    return {
      page: validatedPage,
      limit: validatedLimit
    };
  }

  public addBlockedDomain(domain: string): void {
    this.blockedDomains.add(domain.toLowerCase());
  }

  public removeBlockedDomain(domain: string): void {
    this.blockedDomains.delete(domain.toLowerCase());
  }

  public getBlockedDomains(): string[] {
    return Array.from(this.blockedDomains);
  }
}

export const validator = new Validator();
export default validator;