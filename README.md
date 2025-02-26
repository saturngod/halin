# Halin (ဟန်လင်း)

A lightweight, fast, and type-safe web framework for Bun, inspired by Express and Hono.

## Features
- 🚀 Built for Bun's high-performance runtime
- 📝 First-class TypeScript support
- 🔄 Flexible middleware system
- 🛣️ Express-style routing with parameters
- 👥 Route grouping with shared middleware
- 🌊 Server-Sent Events (SSE) support
- 🔒 Built-in error handling
- 🎯 Custom HTTP methods support

## Installation

```bash
bun add halin
```

## Quick Start

```typescript
import { Halin } from 'halin';

const app = new Halin();

// Basic middleware (logging)
app.use(async (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  await next();
});

// Simple route
app.get('/', (req, res) => {
  res.send('Welcome to Halin!');
});

// Start server
app.listen(3000, () => {
  console.log('Server started on http://localhost:3000');
});
```

## Core Concepts

### Routing

```typescript
// Basic routes
app.get('/', (req, res) => {
  res.send('Hello World!');
});

// Routes with parameters
app.get('/users/:id', (req, res) => {
  res.json({
    userId: req.params.id,
    query: req.query
  });
});

// POST handling with JSON body
app.post('/data', async (req, res) => {
  const data = req.body;
  res.status(201).json({ received: data });
});
```

### Middleware

```typescript
// Global middleware
app.use(async (req, res, next) => {
  console.log(`${req.method} ${req.path}`);
  await next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof HalinError) {
    res.status(err.statusCode).json({
      error: err.message,
      status: err.statusCode
    });
  } else {
    next(err);
  }
});
```

### Route Groups

```typescript
app.group('/api')
  .use((req, res, next) => {
    // Authentication middleware
    if (req.headers.get('x-api-key') !== 'secret') {
      throw new HalinError(401, 'Invalid API key');
    }
    next();
  })
  .routes(api => {
    // Routes under /api
    api.get('/users', (req, res) => {
      res.json([{ id: 1, name: 'John' }]);
    });

    // Nested groups
    api.group('/v2').routes(v2 => {
      v2.get('/products', (req, res) => {
        res.json([{ id: 'p1', name: 'Product 1' }]);
      });
    });
  });
```

### CORS Example

```typescript
const cors = (req, res, next) => {
  res.headers.set('Access-Control-Allow-Origin', '*');
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  next();
};

app.options('/cors', cors, (req, res) => {
  res.text('');
});

app.get('/cors', cors, (req, res) => {
  res.json({ message: 'CORS enabled' });
});

```

### Server-Sent Events (SSE)

```typescript
app.get('/sse', (req, res) => {
  const sse = res.sse();
  let count = 0;

  const interval = setInterval(() => {
    sse.send(`Message ${count++}`);
    if (count >= 5) {
      sse.close();
      clearInterval(interval);
    }
  }, 1000);

  return sse;
});
```

## API Reference

### Request Object
- `req.method`: HTTP method
- `req.url`: Full URL
- `req.path`: URL pathname
- `req.params`: Route parameters
- `req.query`: Query parameters
- `req.headers`: Request headers
- `req.body`: Request body (parsed automatically)
- `req.raw`: Raw Bun request object

### Response Object
- `res.status(code)`: Set status code
- `res.headers`: Response headers
- `res.json(data)`: Send JSON response
- `res.text(data)`: Send text response
- `res.send(data)`: Smart send (auto-detects type)
- `res.sse()`: Create SSE connection
- `res.stream(stream)`: Send streaming response

### Error Handling

```typescript
import { Halin, HalinError } from 'halin';

// Using the built-in error handler
app.get('/error', () => {
  throw new HalinError(418, "I'm a teapot");
});

// Custom error handling middleware
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  if (err instanceof HalinError) {
    res.status(err.statusCode).json({
      error: err.message
    });
  } else {
    next(err);
  }
});
```

## TypeScript Support

Halin is written in TypeScript and provides full type safety. Key types:

```typescript
type Handler = (req: Request, res: Response, next?: NextFunction) => Promise<void> | void;
type ErrorHandler = (error: Error, req: Request, res: Response, next: NextFunction) => Promise<void> | void;
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License - See LICENSE file for details.