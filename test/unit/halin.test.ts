import { describe, expect, test, beforeEach } from "bun:test";
import { Halin } from "../../src/halin";

describe("Halin Framework", () => {
  let app: Halin;
  let testServer: any;

  beforeEach(() => {
    app = new Halin();
  });

  describe("Routing", () => {
    test("should handle GET requests", async () => {
      app.get("/test", (req, res) => {
        res.json({ message: "test" });
      });

      const response = await app.handle(new Request("http://localhost/test"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ message: "test" });
    });

    test("should handle route parameters", async () => {
      app.get("/users/:id", (req, res) => {
        res.json({ id: req.params.id });
      });

      const response = await app.handle(new Request("http://localhost/users/123"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ id: "123" });
    });

    test("should handle custom HTTP methods", async () => {
      app.on("REPORT", "/status", (req, res) => {
        res.json({ status: "ok" });
      });

      const response = await app.handle(
        new Request("http://localhost/status", { method: "REPORT" })
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ status: "ok" });
    });

    test("should return 404 for non-existent routes", async () => {
      const response = await app.handle(
        new Request("http://localhost/nonexistent")
      );

      expect(response.status).toBe(404);
    });
  });

  describe("Middleware", () => {
    test("should execute global middleware", async () => {
      const order: string[] = [];

      app.use((req, res, next) => {
        order.push("middleware1");
        return next();
      });

      app.get("/test", (req, res) => {
        order.push("handler");
        res.json({ order });
      });

      const response = await app.handle(new Request("http://localhost/test"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.order).toEqual(["middleware1", "handler"]);
    });

    test("should handle multiple middleware", async () => {
      const order: string[] = [];

      app.use(
        (req, res, next) => {
          order.push("middleware1");
          return next();
        },
        (req, res, next) => {
          order.push("middleware2");
          return next();
        }
      );

      app.get("/test", (req, res) => {
        order.push("handler");
        res.json({ order });
      });

      const response = await app.handle(new Request("http://localhost/test"));
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.order).toEqual(["middleware1", "middleware2", "handler"]);
    });

    test("should handle path-specific middleware", async () => {
      const order: string[] = [];

      app.use("/api", (req, res, next) => {
        order.push("api-middleware");
        return next();
      });

      app.get("/api/test", (req, res) => {
        order.push("handler");
        res.json({ order });
      });

      const response = await app.handle(
        new Request("http://localhost/api/test")
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.order).toEqual(["api-middleware", "handler"]);
    });
  });

  describe("Error Handling", () => {
    test("should handle errors in middleware", async () => {
      app.use((req, res, next) => {
        throw new Error("Test error");
      });

      app.use((error: Error, req, res, next) => {
        res.status(500).json({ error: error.message });
      });

      const response = await app.handle(new Request("http://localhost/test"));
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: "Test error" });
    });

    test("should handle errors in route handlers", async () => {
      app.get("/error", (req, res) => {
        throw new Error("Route error");
      });

      app.use((error: Error, req, res, next) => {
        res.status(500).json({ error: error.message });
      });

      const response = await app.handle(
        new Request("http://localhost/error")
      );
      const data = await response.json();

      expect(response.status).toBe(500);
      expect(data).toEqual({ error: "Route error" });
    });
  });

  describe("Group Routing", () => {
    test("should handle grouped routes", async () => {
      app.group("/api")
        .use((req, res, next) => {
          res.header("X-API-Version", "1.0");
          return next();
        })
        .routes(api => {
          api.get("/test", (req, res) => {
            res.json({ message: "api test" });
          });
        });

      const response = await app.handle(
        new Request("http://localhost/api/test")
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get("X-API-Version")).toBe("1.0");
      expect(data).toEqual({ message: "api test" });
    });

    test("should handle nested groups", async () => {
      app.group("/api")
        .use((req, res, next) => {
          res.header("X-API-Version", "1.0");
          return next();
        })
        .routes(api => {
          api.group("/v1")
            .use((req, res, next) => {
              res.header("X-Feature", "test");
              return next();
            })
            .routes(v1 => {
              v1.get("/test", (req, res) => {
                res.json({ version: "v1" });
              });
            });
        });

      const response = await app.handle(
        new Request("http://localhost/api/v1/test")
      );
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get("X-API-Version")).toBe("1.0");
      expect(response.headers.get("X-Feature")).toBe("test");
      expect(data).toEqual({ version: "v1" });
    });
  });

  describe("Streaming", () => {
    test("should handle SSE responses", async () => {
      app.get("/sse", (req, res) => {
        const sse = res.sse();
        sse.send({ data: "test" });
        sse.close();
      });

      const response = await app.handle(new Request("http://localhost/sse"));

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    });

    test("should handle stream responses", async () => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue("test");
          controller.close();
        }
      });

      app.get("/stream", (req, res) => {
        res.stream(stream);
      });

      const response = await app.handle(
        new Request("http://localhost/stream")
      );
      const text = await response.text();

      expect(response.status).toBe(200);
      expect(text).toBe("test");
    });
  });
});