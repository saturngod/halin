// halin.ts - A lightweight TypeScript web framework for Bun
// Inspired by Express and Hono

// Types
type HTTPMethod = string; // Allow any HTTP method string
type Handler = (req: Request, res: Response, next?: NextFunction) => Promise<void> | void;
type NextFunction = () => Promise<void>;
type ErrorHandler = (error: Error, req: Request, res: Response, next: NextFunction) => Promise<void> | void;

// Interfaces
interface RouteDefinition {
  method: HTTPMethod;
  path: string;
  pattern: RegExp;
  handlers: Handler[];
}

interface RouteMatch {
  route: RouteDefinition;
  params: Record<string, string>;
}

interface Request {
  method: string;
  url: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  headers: Headers;
  body: any;
  raw: globalThis.Request;
}

interface Response {
  statusCode: number;
  headers: Headers;
  body: string | null | ReadableStream;
  status: (code: number) => Response;
  header: (name: string, value: string) => Response;
  json: (data: any) => Response;
  text: (data: string) => Response;
  send: (data: any) => Response;
  stream: (stream: ReadableStream) => Response;
  sse: () => SSEResponse;
}

// Add SSE (Server-Sent Events) interface
interface SSEResponse extends Response {
  send: (data: any) => boolean;
  close: () => void;
}

class SSEWriter implements SSEResponse {
  statusCode: number = 200;
  headers: Headers;
  body: ReadableStream;
  private controller: ReadableStreamDefaultController;
  private encoder: TextEncoder;
  private closed: boolean = false;

  constructor() {
    this.headers = new Headers({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    });
    this.encoder = new TextEncoder();
    
    const self = this;
    this.body = new ReadableStream({
      start(controller) {
        self.controller = controller;
        // Ensure initial headers are set
        self.header('Content-Type', 'text/event-stream');
      },
      cancel() {
        self.closed = true;
      }
    });
  }

  status(code: number): Response {
    this.statusCode = code;
    return this;
  }

  header(name: string, value: string): Response {
    this.headers.set(name, value);
    return this;
  }

  json(data: any): Response {
    this.send(data);
    return this;
  }

  text(data: string): Response {
    this.send(data);
    return this;
  }

  stream(stream: ReadableStream): Response {
    this.body = stream;
    return this;
  }

  sse(): SSEResponse {
    return this;
  }

  send(data: any): boolean {
    if (this.closed) return false;
    
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    const encoded = this.encoder.encode(`data: ${message}\n\n`);
    this.controller.enqueue(encoded);
    return true;
  }

  close(): void {
    if (!this.closed) {
      this.closed = true;
      this.controller.close();
    }
  }
}

class HalinError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
    this.name = 'HalinError';
  }
}

export class Halin {
  private routes: RouteDefinition[] = [];
  private middlewares: Handler[] = [];
  private errorHandlers: ErrorHandler[] = [];
  private prefix: string = '';
  private currentGroupMiddlewares: Handler[] = [];

  // Middleware handling
  use(...handlers: (Handler | ErrorHandler)[]): Halin {
    handlers.forEach(handler => {
      if (handler.length === 4) {
        // Error handling middleware
        this.errorHandlers.push(handler as ErrorHandler);
      } else {
        // Regular middleware
        this.middlewares.push(handler as Handler);
      }
    });
    return this;
  }

  // Convert path pattern to RegExp
  private pathToPattern(path: string): RegExp {
    const pattern = path
      .replace(/\/:([^/]+)/g, '/([^/]+)') // Convert :param to capture group
      .replace(/\*/g, '.*'); // Convert * to wildcard
    return new RegExp(`^${pattern}$`);
  }

  // HTTP method handlers
  private addRoute(method: HTTPMethod, path: string, ...handlers: Handler[]): Halin {
    this.routes.push({
      method,
      path,
      pattern: this.pathToPattern(path),
      handlers
    });
    return this;
  }

  // Generic method handler
  on(method: string, path: string, ...handlers: Handler[]): Halin {
    return this.addRoute(method.toUpperCase(), path, ...handlers);
  }

  // HTTP method handlers as shortcuts
  get(path: string, ...handlers: Handler[]): Halin {
    return this.on('GET', path, ...handlers);
  }

  post(path: string, ...handlers: Handler[]): Halin {
    return this.on('POST', path, ...handlers);
  }

  put(path: string, ...handlers: Handler[]): Halin {
    return this.on('PUT', path, ...handlers);
  }

  delete(path: string, ...handlers: Handler[]): Halin {
    return this.on('DELETE', path, ...handlers);
  }

  patch(path: string, ...handlers: Handler[]): Halin {
    return this.on('PATCH', path, ...handlers);
  }

  options(path: string, ...handlers: Handler[]): Halin {
    return this.on('OPTIONS', path, ...handlers);
  }

  head(path: string, ...handlers: Handler[]): Halin {
    return this.on('HEAD', path, ...handlers);
  }

  // Extract path parameters
  private extractParams(route: RouteDefinition, path: string): Record<string, string> | null {
    const match = path.match(route.pattern);
    if (!match) return null;

    const params: Record<string, string> = {};
    const paramNames = route.path.match(/:[^/]+/g) || [];
    
    paramNames.forEach((param, index) => {
      params[param.slice(1)] = match[index + 1];
    });
    
    return params;
  }

  // Route matching
  private findRoute(method: HTTPMethod, path: string): RouteMatch | null {
    for (const route of this.routes) {
      if (route.method === method) {
        const params = this.extractParams(route, path);
        if (params !== null) {
          return { route, params };
        }
      }
    }
    return null;
  }

  // Server start
  listen(port: number, callback?: (server: any) => void): any {
    const server = Bun.serve({
      port,
      fetch: async (request: globalThis.Request) => {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;  // Remove 'as HTTPMethod' since we accept any string
        
        try {
          // Find matching route
          const match = this.findRoute(method, path);
          
          if (!match) {
            throw new HalinError(404, 'Not Found');
          }
          
          // Parse request body based on Content-Type
          const contentType = request.headers.get('Content-Type');
          let body: any = null;
          
          if (request.body) {
            if (contentType?.includes('application/json')) {
              try {
                body = await request.json();
              } catch (error) {
                throw new HalinError(400, 'Invalid JSON body');
              }
            } else if (contentType?.includes('application/x-www-form-urlencoded')) {
              try {
                const formData = await request.formData();
                body = Object.fromEntries(formData);
              } catch (error) {
                throw new HalinError(400, 'Invalid form data');
              }
            } else {
              body = await request.text();
            }
          }
          
          // Create request and response objects
          const req: Request = {
            method,
            url: request.url,
            path,
            params: match.params,
            query: Object.fromEntries(url.searchParams),
            headers: request.headers,
            body,
            raw: request
          };
          
          const res: Response = {
            statusCode: 200,
            headers: new Headers(),
            body: null,
            status(code: number) {
              this.statusCode = code;
              return this;
            },
            header(name: string, value: string) {
              this.headers.set(name, value);
              return this;
            },
            json(data: any) {
              this.header('Content-Type', 'application/json');
              this.body = JSON.stringify(data);
              return this;
            },
            text(data: string) {
              this.header('Content-Type', 'text/plain');
              this.body = data;
              return this;
            },
            send(data: any) {
              if (typeof data === 'object') {
                return this.json(data);
              }
              return this.text(String(data));
            },
            stream(stream: ReadableStream) {
              this.body = stream;
              return this;
            },
            sse() {
              const sseWriter = new SSEWriter();
              currentResponse = sseWriter;
              return sseWriter;
            }
          };
          
          // Execute middleware stack
          let index = 0;
          const middlewares = [...this.middlewares, ...match.route.handlers];
          
          const next: NextFunction = async () => {
            if (index < middlewares.length) {
              const middleware = middlewares[index++];
              await middleware(req, res, next);
            }
          };

          try {
            await next();
          } catch (error) {
            // Handle errors through error middleware chain
            if (this.errorHandlers.length > 0) {
              let errorIndex = 0;
              const errorNext = async () => {
                if (errorIndex < this.errorHandlers.length) {
                  const errorHandler = this.errorHandlers[errorIndex++];
                  await errorHandler(error as Error, req, res, errorNext);
                } else {
                  throw error;
                }
              };
              await errorNext();
            } else {
              throw error;
            }
          }

          // Return final response
          if (currentResponse instanceof SSEWriter) {
            return new Response(currentResponse.body, {
              status: currentResponse.statusCode,
              headers: currentResponse.headers
            });
          }

          return new Response(res.body, {
            status: res.statusCode,
            headers: res.headers
          });
        } catch (error) {
          // Final error handling
          if (error instanceof HalinError) {
            return new Response(JSON.stringify({ error: error.message }), { 
              status: error.statusCode,
              headers: { 'Content-Type': 'application/json' }
            });
          } else {
            console.error('Internal Server Error:', error);
            return new Response(JSON.stringify({ error: 'Internal Server Error' }), { 
              status: 500,
              headers: { 'Content-Type': 'application/json' }
            });
          }
        }
      }
    });
    
    if (callback) callback(server);
    
    console.log(`Server running at http://localhost:${port}`);
    return server;
  }

  // Handle method for testing
  async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;
    
    try {
      // Create request and response objects first
      const req: Request = {
        method,
        url: request.url,
        path,
        params: {},
        query: Object.fromEntries(url.searchParams),
        headers: request.headers,
        body: null,
        raw: request
      };

      let currentResponse: Response | SSEWriter | null = null;

      const res: Response = {
        statusCode: 200,
        headers: new Headers(),
        body: null,
        status(code: number) {
          this.statusCode = code;
          return this;
        },
        header(name: string, value: string) {
          this.headers.set(name, value);
          return this;
        },
        json(data: any) {
          this.header('Content-Type', 'application/json');
          this.body = JSON.stringify(data);
          return this;
        },
        text(data: string) {
          this.header('Content-Type', 'text/plain');
          this.body = data;
          return this;
        },
        send(data: any) {
          if (typeof data === 'object') {
            return this.json(data);
          }
          return this.text(String(data));
        },
        stream(stream: ReadableStream) {
          this.body = stream;
          return this;
        },
        sse() {
          const sseWriter = new SSEWriter();
          currentResponse = sseWriter;
          return sseWriter;
        }
      };

      try {
        // Find matching route after creating req/res objects
        const match = this.findRoute(method, path);
        
        if (match) {
          req.params = match.params;
        }

        // Parse body if present
        if (request.body) {
          const contentType = request.headers.get('Content-Type');
          if (contentType?.includes('application/json')) {
            try {
              req.body = await request.json();
            } catch (error) {
              throw new HalinError(400, 'Invalid JSON body');
            }
          }
        }

        // Combine all handlers including middleware and route handlers
        const handlers = [...this.middlewares];
        
        if (match) {
          handlers.push(...match.route.handlers);
        }

        // Execute handler chain
        let index = 0;
        const next = async () => {
          try {
            if (index < handlers.length) {
              const handler = handlers[index++];
              await handler(req, res, next);
            } else if (!match) {
              throw new HalinError(404, 'Not Found');
            }
          } catch (e) {
            throw e;
          }
        };

        await next();

        if (currentResponse instanceof SSEWriter) {
          return new Response(currentResponse.body, {
            status: currentResponse.statusCode,
            headers: currentResponse.headers
          });
        }

        return new Response(res.body, {
          status: res.statusCode,
          headers: res.headers
        });
      } catch (error) {
        // Handle errors through error middleware chain
        if (this.errorHandlers.length > 0) {
          let errorIndex = 0;
          const errorNext = async () => {
            if (errorIndex < this.errorHandlers.length) {
              const handler = this.errorHandlers[errorIndex++];
              await handler(error as Error, req, res, errorNext);
            } else {
              throw error;
            }
          };
          await errorNext();

          return new Response(res.body, {
            status: res.statusCode,
            headers: res.headers
          });
        }
        throw error;
      }
    } catch (error) {
      // Final error handling
      if (error instanceof HalinError) {
        return new Response(JSON.stringify({ error: error.message }), { 
          status: error.statusCode,
          headers: { 'Content-Type': 'application/json' }
        });
      } else {
        return new Response(JSON.stringify({ error: error.message || 'Internal Server Error' }), { 
          status: 500,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }
  }

  // Group method with fluent API
  group(pathOrMiddleware?: string | Handler | Handler[]): GroupBuilder {
    const groupRouter = new GroupBuilder(this);

    if (typeof pathOrMiddleware === 'string') {
      groupRouter.prefix = this.prefix + pathOrMiddleware;
    } else if (Array.isArray(pathOrMiddleware)) {
      groupRouter.use(...pathOrMiddleware);
    } else if (pathOrMiddleware) {
      groupRouter.use(pathOrMiddleware);
    }

    return groupRouter;
  }

  // Method to add routes from group
  private addGroupRoute(method: HTTPMethod, path: string, handlers: Handler[]): void {
    const fullPath = this.prefix + path;
    this.routes.push({
      method,
      path: fullPath,
      pattern: this.pathToPattern(fullPath),
      handlers: [...this.currentGroupMiddlewares, ...handlers]
    });
  }
}

// New GroupBuilder class for fluent group API
class GroupBuilder {
  private _middlewares: Handler[] = [];
  public prefix: string = '';

  constructor(private app: Halin) {}

  // Add middleware to the group
  use(...handlers: Handler[]): GroupBuilder {
    this._middlewares.push(...handlers);
    return this;
  }

  // Define routes within the group
  routes(callback: (group: GroupRouter) => void): Halin {
    const router = new GroupRouter(this.app, this.prefix, this._middlewares);
    callback(router);
    return this.app;
  }
}

// Router class for group routes
class GroupRouter {
  constructor(
    private app: Halin,
    private prefix: string,
    private groupMiddlewares: Handler[]
  ) {}

  private addRoute(method: HTTPMethod, path: string, ...handlers: Handler[]): void {
    const fullPath = this.prefix + path;
    
    // Simply concatenate the middleware arrays without wrapping
    this.app['routes'].push({
      method,
      path: fullPath,
      pattern: this.app['pathToPattern'](fullPath),
      handlers: [...this.groupMiddlewares, ...handlers]
    });
  }

  get(path: string, ...handlers: Handler[]): GroupRouter {
    this.addRoute('GET', path, ...handlers);
    return this;
  }

  post(path: string, ...handlers: Handler[]): GroupRouter {
    this.addRoute('POST', path, ...handlers);
    return this;
  }

  put(path: string, ...handlers: Handler[]): GroupRouter {
    this.addRoute('PUT', path, ...handlers);
    return this;
  }

  delete(path: string, ...handlers: Handler[]): GroupRouter {
    this.addRoute('DELETE', path, ...handlers);
    return this;
  }

  patch(path: string, ...handlers: Handler[]): GroupRouter {
    this.addRoute('PATCH', path, ...handlers);
    return this;
  }

  on(method: string, path: string, ...handlers: Handler[]): GroupRouter {
    this.addRoute(method.toUpperCase(), path, ...handlers);
    return this;
  }

  group(path: string): GroupBuilder {
    const nestedGroup = new GroupBuilder(this.app);
    nestedGroup.prefix = this.prefix + path;
    // Pass through the existing middleware
    nestedGroup.use(...this.groupMiddlewares);
    return nestedGroup;
  }
}