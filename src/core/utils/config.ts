import dotenv from 'dotenv';
import { AppConfig } from '@/types';

dotenv.config();

class ConfigManager {
  private config: AppConfig;

  constructor() {
    this.config = this.loadConfig();
    this.validateConfig();
  }

  private loadConfig(): AppConfig {
    return {
      port: parseInt(process.env.PORT || '3000', 10),
      nodeEnv: process.env.NODE_ENV || 'development',
      claudeApiKey: process.env.CLAUDE_API_KEY || '',
      claudeModel: process.env.CLAUDE_MODEL || 'claude-3-sonnet-20241022',
      redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
      jwtSecret: process.env.JWT_SECRET || 'default-jwt-secret',
      encryptionKey: process.env.ENCRYPTION_KEY || 'default-32-char-encryption-key',
      browserTimeout: parseInt(process.env.BROWSER_TIMEOUT || '30000', 10),
      browserMaxContexts: parseInt(process.env.BROWSER_MAX_CONTEXTS || '5', 10),
      browserHeadless: process.env.BROWSER_HEADLESS === 'true',
      logLevel: process.env.LOG_LEVEL || 'info',
      logFile: process.env.LOG_FILE || './logs/smartbrowser.log'
    };
  }

  private validateConfig(): void {
    const requiredFields: (keyof AppConfig)[] = [
      'claudeApiKey',
      'jwtSecret',
      'encryptionKey'
    ];

    const missing = requiredFields.filter(field => !this.config[field]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required configuration: ${missing.join(', ')}`);
    }

    if (this.config.encryptionKey.length !== 32) {
      throw new Error('ENCRYPTION_KEY must be exactly 32 characters long');
    }

    if (this.config.port < 1000 || this.config.port > 65535) {
      throw new Error('PORT must be between 1000 and 65535');
    }
  }

  public get(): AppConfig {
    return { ...this.config };
  }

  public isDevelopment(): boolean {
    return this.config.nodeEnv === 'development';
  }

  public isProduction(): boolean {
    return this.config.nodeEnv === 'production';
  }

  public isTest(): boolean {
    return this.config.nodeEnv === 'test';
  }
}

export const config = new ConfigManager();
export default config;