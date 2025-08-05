// Type fixes for Jest mock issues
declare module '@jest/globals' {
  namespace jest {
    interface MockInstance<T = any, Y extends any[] = any[]> {
      mockResolvedValue(value: any): this;
      mockRejectedValue(error: any): this;
      mockReturnValue(value: any): this;
      mockImplementation(fn: any): this;
      mockResolvedValueOnce(value: any): this;
      mockReturnValueOnce(value: any): this;
    }
    
    interface Mock<T = any, Y extends any[] = any[]> extends MockInstance<T, Y> {
      mockResolvedValue(value: any): this;
      mockRejectedValue(error: any): this;
      mockReturnValue(value: any): this;
      mockImplementation(fn: any): this;
      mockResolvedValueOnce(value: any): this;
      mockReturnValueOnce(value: any): this;
    }

    function fn<T = any, Y extends any[] = any[]>(implementation?: (...args: Y) => T): Mock<T, Y>;
  }
}
