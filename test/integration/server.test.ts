import { describe, expect, test, beforeAll, afterAll } from "bun:test";

describe("Halin Server Integration", () => {
  const baseUrl = "http://localhost:3001";
  let server: any;

  beforeAll(() => {
    // Start test server
    server = Bun.serve({
      port: 3001,
      async fetch(req) {
        const url = new URL(req.url);
        
        if (url.pathname === "/json") {
          return Response.json({ message: "test" });
        }

        if (url.pathname === "/stream") {
          const stream = new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode("test data"));
              controller.close();
            }
          });
          return new Response(stream);
        }

        if (url.pathname === "/sse") {
          const stream = new ReadableStream({
            start(controller) {
              const encoder = new TextEncoder();
              controller.enqueue(encoder.encode("data: {\"message\":\"test\"}\n\n"));
              controller.close();
            }
          });
          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              "Connection": "keep-alive"
            }
          });
        }

        return new Response("Not Found", { status: 404 });
      }
    });
  });

  afterAll(() => {
    server.stop();
  });

  test("should handle JSON responses", async () => {
    const response = await fetch(`${baseUrl}/json`);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual({ message: "test" });
  });

  test("should handle streaming responses", async () => {
    const response = await fetch(`${baseUrl}/stream`);
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toBe("test data");
  });

  test("should handle SSE responses", async () => {
    const response = await fetch(`${baseUrl}/sse`);
    const reader = response.body?.getReader();
    const decoder = new TextDecoder();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    if (reader) {
      const { value } = await reader.read();
      const text = decoder.decode(value);
      expect(text).toBe('data: {"message":"test"}\n\n');
    }
  });
});