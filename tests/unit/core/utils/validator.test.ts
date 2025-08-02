import { jest } from '@jest/globals';
import { validator } from '../../../../src/core/utils/validator';
import { ValidationError, SecurityError } from '../../../../src/types';

describe('Validator', () => {
  // Using the shared instance directly

  beforeEach(() => {
    // Reset any mocks if needed
  });

  describe('validateUserGoal', () => {
    it('should validate and sanitize a valid user goal', () => {
      const goal = {
        text: 'find hotels in Paris',
        priority: 'medium'
      };

      const result = validator.validateUserGoal(goal);

      expect(result.text).toBe('find hotels in Paris');
      expect(result.priority).toBe('medium');
    });

    it('should apply default priority if not provided', () => {
      const goal = {
        text: 'find restaurants nearby'
      };

      const result = validator.validateUserGoal(goal);

      expect(result.priority).toBe('medium');
    });

    it('should reject goals that are too long', () => {
      const goal = {
        text: 'very long goal text '.repeat(1000), // Exceeds max length
        priority: 'high'
      };

      expect(() => validator.validateUserGoal(goal)).toThrow(ValidationError);
    });

    it('should reject malicious content in goals', () => {
      const maliciousGoals = [
        { text: 'find hotels <script>alert("xss")</script> in Paris' },
        { text: 'search for javascript:alert("malicious")' },
        { text: 'book hotel onload=stealData()' },
        { text: 'find data:text/html,<script>hack()</script>' }
      ];

      for (const goal of maliciousGoals) {
        expect(() => validator.validateUserGoal(goal)).toThrow(SecurityError);
      }
    });

    it('should sanitize harmful content from goals', () => {
      const goal = {
        text: 'find hotels <b>in Paris</b> with <script>good</script> ratings'
      };

      const result = validator.validateUserGoal(goal);

      expect(result.text).not.toContain('<script>');
      expect(result.text).not.toContain('<b>');
      expect(result.text).toContain('in Paris');
      expect(result.text).toContain('ratings');
    });

    it('should reject invalid priority values', () => {
      const goal = {
        text: 'find hotels',
        priority: 'invalid-priority'
      };

      expect(() => validator.validateUserGoal(goal)).toThrow(ValidationError);
    });

    it('should handle missing text field', () => {
      const goal = {
        priority: 'high'
      };

      expect(() => validator.validateUserGoal(goal)).toThrow(ValidationError);
    });
  });

  describe('validateUrl', () => {
    it('should validate legitimate URLs', () => {
      const validUrls = [
        'https://example.com',
        'http://test.com/path?query=value',
        'https://subdomain.example.com:8080/path#fragment'
      ];

      for (const url of validUrls) {
        expect(() => validator.validateUrl(url)).not.toThrow();
        expect(validator.validateUrl(url)).toBe(url);
      }
    });

    it('should reject invalid URL formats', () => {
      const invalidUrls = [
        'not-a-url',
        'ftp://example.com',
        'javascript:alert("xss")',
        'data:text/html,<script>alert("xss")</script>',
        'file:///etc/passwd',
        ''
      ];

      for (const url of invalidUrls) {
        expect(() => validator.validateUrl(url)).toThrow(ValidationError);
      }
    });

    it('should reject blocked domains', () => {
      validator.addBlockedDomain('malicious-site.com');
      
      expect(() => validator.validateUrl('https://malicious-site.com/page')).toThrow(SecurityError);
    });

    it('should handle domain blocking case-insensitively', () => {
      validator.addBlockedDomain('BLOCKED-SITE.COM');
      
      expect(() => validator.validateUrl('https://blocked-site.com/page')).toThrow(SecurityError);
      expect(() => validator.validateUrl('https://BLOCKED-SITE.COM/page')).toThrow(SecurityError);
    });

    it('should manage blocked domains list', () => {
      validator.addBlockedDomain('test1.com');
      validator.addBlockedDomain('test2.com');
      
      let blocked = validator.getBlockedDomains();
      expect(blocked).toContain('test1.com');
      expect(blocked).toContain('test2.com');
      
      validator.removeBlockedDomain('test1.com');
      blocked = validator.getBlockedDomains();
      expect(blocked).not.toContain('test1.com');
      expect(blocked).toContain('test2.com');
    });
  });

  describe('validateTaskPayload', () => {
    it('should validate a complete task payload', () => {
      const payload = {
        url: 'https://example.com',
        query: 'search query',
        content: 'some content',
        options: { limit: 10 }
      };

      const result = validator.validateTaskPayload(payload);

      expect(result.url).toBe('https://example.com');
      expect(result.query).toBe('search query');
      expect(result.content).toBe('some content');
      expect(result.options.limit).toBe(10);
    });

    it('should validate payload with only some fields', () => {
      const payload = {
        query: 'search query'
      };

      const result = validator.validateTaskPayload(payload);

      expect(result.query).toBe('search query');
      expect(result.url).toBeUndefined();
      expect(result.content).toBeUndefined();
    });

    it('should sanitize string fields in payload', () => {
      const payload = {
        query: 'search <script>alert("xss")</script> query',
        content: 'content with <malicious>tags</malicious>'
      };

      const result = validator.validateTaskPayload(payload);

      expect(result.query).not.toContain('<script>');
      expect(result.query).toContain('search');
      expect(result.query).toContain('query');
      expect(result.content).not.toContain('<malicious>');
    });

    it('should reject payloads with invalid URLs', () => {
      const payload = {
        url: 'not-a-valid-url',
        query: 'search query'
      };

      expect(() => validator.validateTaskPayload(payload)).toThrow(ValidationError);
    });

    it('should reject payloads with oversized content', () => {
      const payload = {
        query: 'x'.repeat(2000), // Exceeds max query length
      };

      expect(() => validator.validateTaskPayload(payload)).toThrow(ValidationError);
    });
  });

  describe('validateUserPreferences', () => {
    it('should validate complete user preferences', () => {
      const preferences = {
        theme: 'dark',
        language: 'en',
        notifications: true,
        autoSummarize: false,
        defaultPriority: 'high'
      };

      const result = validator.validateUserPreferences(preferences);

      expect(result.theme).toBe('dark');
      expect(result.language).toBe('en');
      expect(result.notifications).toBe(true);
      expect(result.autoSummarize).toBe(false);
      expect(result.defaultPriority).toBe('high');
    });

    it('should apply default values for missing preferences', () => {
      const preferences = {
        theme: 'light'
      };

      const result = validator.validateUserPreferences(preferences);

      expect(result.theme).toBe('light');
      expect(result.language).toBe('en');
      expect(result.notifications).toBe(true);
      expect(result.autoSummarize).toBe(false);
      expect(result.defaultPriority).toBe('medium');
    });

    it('should reject invalid theme values', () => {
      const preferences = {
        theme: 'invalid-theme'
      };

      expect(() => validator.validateUserPreferences(preferences)).toThrow(ValidationError);
    });

    it('should reject invalid language codes', () => {
      const preferences = {
        language: 'invalid-lang-code'
      };

      expect(() => validator.validateUserPreferences(preferences)).toThrow(ValidationError);
    });
  });

  describe('validateClaudeResponse', () => {
    it('should accept safe Claude responses', () => {
      const safeResponses = [
        'This is a safe response from Claude.',
        'Here are some hotel recommendations for Paris.',
        'The article discusses various topics including technology and science.'
      ];

      for (const response of safeResponses) {
        expect(validator.validateClaudeResponse(response)).toBe(true);
      }
    });

    it('should reject responses with dangerous patterns', () => {
      const dangerousResponses = [
        'Here is your result: <script>alert("xss")</script>',
        'Navigate to javascript:alert("malicious")',
        'Set element.innerHTML = maliciousContent',
        'Use eval(userInput) to process',
        'Execute document.write(content)',
        'Redirect window.location to malicious site'
      ];

      for (const response of dangerousResponses) {
        expect(validator.validateClaudeResponse(response)).toBe(false);
      }
    });

    it('should reject non-string responses', () => {
      const invalidResponses = [
        null,
        undefined,
        123,
        { message: 'object response' },
        ['array', 'response']
      ];

      for (const response of invalidResponses) {
        expect(validator.validateClaudeResponse(response as any)).toBe(false);
      }
    });
  });

  describe('sanitizeString', () => {
    it('should remove dangerous HTML tags and attributes', () => {
      const maliciousStrings = [
        '<script>alert("xss")</script>normal text',
        'text with <img onerror="hack()" src="x">',
        'javascript:alert("malicious") in text',
        'normal <b>bold</b> text with <script>code</script>'
      ];

      for (const str of maliciousStrings) {
        const sanitized = validator.sanitizeString(str);
        
        expect(sanitized).not.toContain('<script>');
        expect(sanitized).not.toContain('javascript:');
        expect(sanitized).not.toContain('onerror=');
        expect(sanitized).not.toContain('<');
        expect(sanitized).not.toContain('>');
      }
    });

    it('should preserve safe content while removing dangerous parts', () => {
      const input = 'Find hotels <script>steal()</script> in Paris';
      const result = validator.sanitizeString(input);
      
      expect(result).toContain('Find hotels');
      expect(result).toContain('in Paris');
      expect(result).not.toContain('<script>');
      expect(result).not.toContain('steal()');
    });

    it('should handle edge cases', () => {
      expect(validator.sanitizeString('')).toBe('');
      expect(validator.sanitizeString(null as any)).toBe('');
      expect(validator.sanitizeString(undefined as any)).toBe('');
      expect(validator.sanitizeString(123 as any)).toBe('');
    });

    it('should trim whitespace and limit length', () => {
      const longString = '  ' + 'x'.repeat(15000) + '  ';
      const result = validator.sanitizeString(longString);
      
      expect(result.length).toBeLessThanOrEqual(10000);
      expect(result).not.toMatch(/^\s/); // Should not start with whitespace
      expect(result).not.toMatch(/\s$/); // Should not end with whitespace
    });
  });

  describe('validateEmail', () => {
    it('should validate correct email addresses', () => {
      const validEmails = [
        'user@example.com',
        'test.email@domain.co.uk',
        'user+tag@example.org',
        'firstname.lastname@company.com'
      ];

      for (const email of validEmails) {
        expect(validator.validateEmail(email)).toBe(true);
      }
    });

    it('should reject invalid email addresses', () => {
      const invalidEmails = [
        'not-an-email',
        '@domain.com',
        'user@',
        'user..double.dot@example.com',
        '',
        'user@domain',
        'user name@example.com'
      ];

      for (const email of invalidEmails) {
        expect(validator.validateEmail(email)).toBe(false);
      }
    });
  });

  describe('validatePassword', () => {
    it('should validate strong passwords', () => {
      const strongPasswords = [
        'StrongPass123!',
        'MySecure@Password1',
        'Complex#Pass99'
      ];

      for (const password of strongPasswords) {
        const result = validator.validatePassword(password);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }
    });

    it('should reject weak passwords and provide specific errors', () => {
      const weakPasswords = [
        { password: 'short', expectedErrors: 5 }, // Too short, missing all requirements
        { password: 'toolongbutnouppercaseornumbers', expectedErrors: 3 }, // Missing uppercase, numbers, special chars
        { password: 'NoNumbers!', expectedErrors: 1 }, // Missing numbers
        { password: 'nonumbers123', expectedErrors: 2 }, // Missing uppercase and special chars
        { password: 'NOLOWERCASE123!', expectedErrors: 1 } // Missing lowercase
      ];

      for (const { password, expectedErrors } of weakPasswords) {
        const result = validator.validatePassword(password);
        expect(result.valid).toBe(false);
        expect(result.errors.length).toBeGreaterThanOrEqual(1);
        expect(result.errors.length).toBeLessThanOrEqual(expectedErrors);
      }
    });

    it('should provide specific error messages', () => {
      const result = validator.validatePassword('weak');
      
      expect(result.errors).toContain('Password must be at least 8 characters long');
      expect(result.errors).toContain('Password must contain at least one uppercase letter');
      expect(result.errors).toContain('Password must contain at least one number');
      expect(result.errors).toContain('Password must contain at least one special character');
    });
  });

  describe('isValidUUID', () => {
    it('should validate correct UUIDs', () => {
      const validUUIDs = [
        '123e4567-e89b-12d3-a456-426614174000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        '6ba7b811-9dad-11d1-80b4-00c04fd430c8'
      ];

      for (const uuid of validUUIDs) {
        expect(validator.isValidUUID(uuid)).toBe(true);
      }
    });

    it('should reject invalid UUIDs', () => {
      const invalidUUIDs = [
        'not-a-uuid',
        '123e4567-e89b-12d3-a456', // Too short
        '123e4567-e89b-12d3-a456-426614174000-extra', // Too long
        '123e4567-e89b-12d3-g456-426614174000', // Invalid character
        '123e4567e89b12d3a456426614174000', // Missing hyphens
        ''
      ];

      for (const uuid of invalidUUIDs) {
        expect(validator.isValidUUID(uuid)).toBe(false);
      }
    });
  });

  describe('validatePagination', () => {
    it('should validate and normalize pagination parameters', () => {
      const testCases = [
        { input: { page: 1, limit: 10 }, expected: { page: 1, limit: 10 } },
        { input: { page: 5, limit: 25 }, expected: { page: 5, limit: 25 } },
        { input: {}, expected: { page: 1, limit: 10 } }, // Defaults
        { input: { page: 0, limit: 0 }, expected: { page: 1, limit: 1 } }, // Min values
        { input: { page: -5, limit: -10 }, expected: { page: 1, limit: 1 } }, // Negative values
        { input: { page: 1000, limit: 1000 }, expected: { page: 1000, limit: 100 } } // Max limit
      ];

      for (const { input, expected } of testCases) {
        const result = validator.validatePagination(input.page, input.limit);
        expect(result).toEqual(expected);
      }
    });

    it('should handle undefined values', () => {
      const result = validator.validatePagination(undefined, undefined);
      expect(result).toEqual({ page: 1, limit: 10 });
    });
  });

  describe('domain management', () => {
    it('should manage blocked domains correctly', () => {
      // Initially should have some default blocked domains
      const initialBlocked = validator.getBlockedDomains();
      expect(Array.isArray(initialBlocked)).toBe(true);

      // Add new blocked domain
      validator.addBlockedDomain('new-blocked.com');
      let blocked = validator.getBlockedDomains();
      expect(blocked).toContain('new-blocked.com');

      // Remove blocked domain
      validator.removeBlockedDomain('new-blocked.com');
      blocked = validator.getBlockedDomains();
      expect(blocked).not.toContain('new-blocked.com');
    });

    it('should handle case-insensitive domain operations', () => {
      validator.addBlockedDomain('UPPERCASE-DOMAIN.COM');
      
      let blocked = validator.getBlockedDomains();
      expect(blocked).toContain('uppercase-domain.com');
      
      validator.removeBlockedDomain('uppercase-domain.com');
      blocked = validator.getBlockedDomains();
      expect(blocked).not.toContain('uppercase-domain.com');
    });
  });

  describe('error handling', () => {
    it('should throw appropriate error types', () => {
      // ValidationError for schema violations
      expect(() => validator.validateUserGoal({})).toThrow(ValidationError);
      expect(() => validator.validateUrl('invalid-url')).toThrow(ValidationError);
      
      // SecurityError for security violations
      expect(() => validator.validateUserGoal({ text: '<script>alert("xss")</script>' })).toThrow(SecurityError);
      
      validator.addBlockedDomain('blocked.com');
      expect(() => validator.validateUrl('https://blocked.com')).toThrow(SecurityError);
    });

    it('should provide meaningful error messages', () => {
      try {
        validator.validateUserGoal({ text: '', priority: 'invalid' });
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.message).toContain('Invalid user goal');
      }

      try {
        validator.validateUrl('not-a-url');
      } catch (error) {
        expect(error).toBeInstanceOf(ValidationError);
        expect(error.message).toContain('Invalid URL');
      }
    });
  });
});