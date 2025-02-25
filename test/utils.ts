import { Halin } from "../src/halin";

/**
 * Create a test request with common defaults
 */
export function createTestRequest(
  path: string,
  options: RequestInit = {}
): Request {
  const url = new URL(path, "http://localhost");
  return new Request(url, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
    },
    ...options,
  });
}

/**
 * Create a mock stream for testing
 */
export function createMockStream(data: string | string[]): ReadableStream {
  const messages = Array.isArray(data) ? data : [data];
  
  return new ReadableStream({
    start(controller) {
      messages.forEach(msg => {
        controller.enqueue(new TextEncoder().encode(msg));
      });
      controller.close();
    }
  });
}

/**
 * Create a test app with common middleware
 */
export function createTestApp(): Halin {
  const app = new Halin();
  
  // Add error handling
  app.use((error: Error, req, res, next) => {
    res.status(500).json({ error: error.message });
  });

  return app;
}

/**
 * Wait for a specific amount of time
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Assert response headers
 */
export function assertHeaders(
  response: Response,
  expectedHeaders: Record<string, string>
): void {
  Object.entries(expectedHeaders).forEach(([key, value]) => {
    expect(response.headers.get(key)).toBe(value);
  });
}