// Global test utilities type declarations
import { Task, UserGoal, PageContent, ClaudeResponse } from '../src/types';

declare global {
  namespace NodeJS {
    interface Global {
      testUtils: {
        createMockTask: (overrides?: any) => any;
        createMockGoal: (overrides?: any) => any;
        createMockPageContent: (overrides?: any) => any;
        createMockClaudeResponse: (overrides?: any) => any;
        sleep: (ms: number) => Promise<void>;
        waitForCondition: (condition: () => boolean, timeout?: number) => Promise<void>;
      };
    }
  }

  var testUtils: {
    createMockTask: (overrides?: any) => any;
    createMockGoal: (overrides?: any) => any;
    createMockPageContent: (overrides?: any) => any;
    createMockClaudeResponse: (overrides?: any) => any;
    sleep: (ms: number) => Promise<void>;
    waitForCondition: (condition: () => boolean, timeout?: number) => Promise<void>;
  };
}

export {};