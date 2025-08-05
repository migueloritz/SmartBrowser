/**
 * Custom Jest types for better TypeScript compatibility
 */

declare global {
  namespace jest {
    interface MockInstance<T = any, Y extends any[] = any[]> {
      mockResolvedValue(value: T): this;
      mockReturnValue(value: T): this;
      mockResolvedValueOnce(value: T): this;
      mockReturnValueOnce(value: T): this;
      mockRejectedValue(error: any): this;
      mockRejectedValueOnce(error: any): this;
      mockImplementation(fn: (...args: Y) => T): this;
      mockImplementationOnce(fn: (...args: Y) => T): this;
      mockReturnThis(): this;
      mockClear(): this;
      mockReset(): this;
      mockRestore(): void;
    }
  }
}

declare const jest: {
  fn: <T = any, Y extends any[] = any[]>() => jest.MockInstance<T, Y>;
  spyOn: <T extends {}, M extends keyof T>(object: T, method: M) => jest.MockInstance<T[M], any[]>;
  mock: any;
  unmock: any;
  clearAllMocks: () => void;
  resetAllMocks: () => void;
  restoreAllMocks: () => void;
};

export {};
