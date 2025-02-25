# Halin (ဟန်လင်း)

A lightweight, fast, and flexible web framework for Bun, inspired by Express and Hono. Halin provides a simple yet powerful API for building web applications with TypeScript.

> **Note**: This framework was created with the assistance of AI (GitHub Copilot) for personal use and learning purposes. It is not intended for production use.

## Features

- 🚀 Built for Bun - Optimized for performance
- 🎯 TypeScript first - Full type safety
- 🔄 Middleware support - Global, path-specific, and route-level
- 🛣️ Flexible routing - Support for parameters and wildcards
- ⚡ Custom HTTP methods - Beyond standard REST
- 🔒 Built-in error handling
- 🎨 Express-like API - Familiar and easy to use

## Installation

```bash
bun add halin
```

## Quick Start

```typescript
import { Halin } from 'halin';

const app = new Halin();

app.get('/', (req, res) => {
  res.json({ message: 'Hello from Halin!' });
});

app.listen(3000, () => {
  console.log('Server running at http://localhost:3000');
});
```

## Core Concepts

### Route Groups and Middleware Organization

Group related routes and middleware together for better organization and reusability:

```typescript
// API v1 Routes with versioning and auth
app.group('/api/v1')
  .use(
    // Version and auth middleware
    async (req, res, next) => {
      res.header('X-API-Version', '1.0');
      await next();
    },
    auth,
    // Rate limiting middleware
    async (req, res, next) => {
      res.header('X-RateLimit-Limit', '60');
      await next();
    }
  )
  .routes(api => {
    // Users subgroup
    api.group('/users')
      .use(userMiddleware)
      .routes(users => {
        users.get('/', listUsers);
        users.post('/', createUser);
      });

    // Nested payment routes within orders
    api.group('/orders')
      .use(orderMiddleware)
      .routes(orders => {
        orders.group('/payment')
          .use(validatePayment)
          .routes(payment => {
            payment.post('/stripe', stripeHandler);
            payment.post('/paypal', paypalHandler);
          });
      });
  });
```

### Basic Routing

```typescript
// Basic GET route
app.get('/hello', (req, res) => {
  res.text('Hello World!');
});

// Route with URL parameters
app.get('/users/:id', (req, res) => {
  const userId = req.params.id;
  res.json({ userId });
});

// Support for different HTTP methods
app.post('/items', (req, res) => {
  res.json(req.body);
});

app.put('/items/:id', (req, res) => {
  // Update item
});

app.delete('/items/:id', (req, res) => {
  // Delete item
});
```

### Custom HTTP Methods

```typescript
// Define custom HTTP methods using .on()
app.on('REPORT', '/system/status', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

app.on('SYNC', '/data', (req, res) => {
  res.json({ message: 'Sync initiated' });
});
```

### Middleware

```typescript
// Global middleware
app.use(async (req, res, next) => {
  console.log(`[${req.method}] ${req.path}`);
  await next();
});

// Path-specific middleware
app.use('/api', async (req, res, next) => {
  res.header('X-API-Version', '1.0');
  await next();
});

// Multiple middleware
app.get('/protected',
  auth,
  checkRole('admin'),
  (req, res) => {
    res.json({ secret: 'data' });
  }
);
```

### Error Handling

```typescript
// Global error handler
app.use((error: Error, req, res, next) => {
  console.error(error);
  res.status(500).json({
    error: error.message
  });
});

// Route-specific error handling
app.get('/may-error', async (req, res) => {
  try {
    // ... some operation
  } catch (error) {
    throw new Error('Something went wrong');
  }
});
```

## Advanced Usage

### Middleware Factory

Create reusable middleware factories:

```typescript
// Role checking middleware
const checkRole = (role: string) => async (req, res, next) => {
  const userRole = req.headers.get('x-user-role');
  if (userRole === role) {
    await next();
  } else {
    throw new Error('Forbidden: Insufficient permissions');
  }
};

// Validation middleware
const validateBody = (schema: Record<string, any>) => async (req, res, next) => {
  const missingFields = Object.keys(schema).filter(key => !(key in req.body));
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }
  await next();
};
```

### Request Processing Pipeline

```typescript
app.post('/items',
  auth,                                    // Authentication
  checkRole('editor'),                     // Authorization
  validateBody({ name: 'string' }),        // Validation
  async (req, res, next) => {             // Custom processing
    req.body.timestamp = Date.now();
    await next();
  },
  (req, res) => {                         // Final handler
    res.json({ message: 'Item created' });
  }
);
```

### Batch Processing

```typescript
app.on('PROCESS', '/tasks/batch',
  auth,
  checkRole('admin'),
  validateBody({ tasks: 'array' }),
  async (req, res) => {
    const results = await Promise.all(
      req.body.tasks.map(task => ({
        taskId: task.id,
        status: 'processed'
      }))
    );
    res.json({ results });
  }
);
```

### Response Status Codes

You can set custom status codes with response methods chaining:

```typescript
// Return 422 Unprocessable Entity with validation errors
app.post('/api/validate', (req, res) => {
  const { email } = req.body;
  
  if (!email.includes('@')) {
    return res.status(422).json({
      error: 'Validation failed',
      details: { email: 'Invalid email format' }
    });
  }

  res.status(200).json({ message: 'Validation passed' });
});

// Return 201 Created for successful resource creation
app.post('/api/users', (req, res) => {
  // ... create user logic ...
  res.status(201).json({ 
    message: 'User created',
    userId: 'new-user-id'
  });
});

// Return 403 Forbidden for permission issues
app.get('/api/admin', (req, res) => {
  if (!isAdmin(req)) {
    return res.status(403).json({
      error: 'Access denied',
      message: 'Requires admin privileges'
    });
  }
  res.json({ data: 'admin data' });
});
```

## API Reference

### Application

#### `app.use(path?: string, ...handlers: Handler[])`
Mounts middleware function(s) at the specified path. If path is not specified, middleware is mounted at root level.

#### `app.on(method: string, path: string, ...handlers: Handler[])`
Adds a route for a custom HTTP method.

#### `app.get|post|put|delete|patch|options|head(path: string, ...handlers: Handler[])`
Shortcuts for common HTTP methods.

#### `app.listen(port: number, callback?: Function)`
Starts the server on the specified port.

#### `app.group(pathOrMiddleware?: string | Handler | Handler[])`
Creates a route group with optional path prefix or middleware. Returns a GroupBuilder.

#### `GroupBuilder Methods`
- `use(...handlers: Handler[])`: Add middleware to the group
- `routes(callback: (group: GroupRouter) => void)`: Define routes within the group

#### `GroupRouter Methods`
All standard HTTP methods (get, post, put, delete, patch) plus:
- `on(method: string, path: string, ...handlers: Handler[])`: Custom HTTP methods

Example:
```typescript
app.group('/admin')
  .use([auth, checkRole('admin')])
  .routes(admin => {
    admin.get('/users', (req, res) => {
      res.json({ users: ['user1', 'user2'] });
    });

    admin.post('/users', 
      validateBody({ username: 'string' }),
      (req, res) => {
        res.json({ message: 'User created' });
      }
    );
  });
```

### Request Object

- `req.method`: HTTP method
- `req.url`: Full URL
- `req.path`: URL pathname
- `req.params`: Route parameters
- `req.query`: Query parameters
- `req.headers`: Request headers
- `req.body`: Request body (automatically parsed based on Content-Type)
- `req.raw`: Raw Bun Request object

### Response Object

#### Methods
- `res.status(code: number)`: Sets response status code
- `res.header(name: string, value: string)`: Sets response header
- `res.json(data: any)`: Sends JSON response
- `res.text(data: string)`: Sends text response
- `res.send(data: any)`: Smart send (detects type)
- `res.stream(stream: ReadableStream)`: Sends a streaming response
- `res.sse()`: Creates Server-Sent Events response

## Advanced Features

### Streaming Responses

Halin supports both raw streaming and Server-Sent Events (SSE) for real-time data transmission:

```typescript
// Raw streaming example (e.g., with OpenAI API)
app.post('/chat/stream', async (req, res) => {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    // ... API configuration ...
    body: JSON.stringify({
      stream: true,
      // ... other options ...
    })
  });

  return res.stream(response.body);
});

// SSE example
app.get('/events', (req, res) => {
  const sse = res.sse();
  
  // Send updates to client
  setInterval(() => {
    sse.send({ data: 'Update ' + new Date() });
  }, 1000);

  // Clean up
  setTimeout(() => {
    sse.close();
  }, 10000);
});
```

#### Working with OpenAI Streaming

```typescript
app.post('/chat/stream/sse', async (req, res) => {
  const sse = res.sse();
  
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    // ... API configuration ...
    body: JSON.stringify({
      stream: true,
      messages: req.body.messages
    })
  });

  // Process the stream
  for await (const chunk of response.body) {
    const data = parseChunk(chunk);
    sse.send(data);
  }
  
  sse.close();
});
```

### Best Practices

1. **Organize Routes**: Use groups to organize related routes and their middleware
2. **Nested Groups**: Create hierarchical route structures for complex APIs
3. **Middleware Scope**: Apply middleware at the appropriate level (global, group, or route)
4. **Resource Management**: Properly manage resources in streaming responses
5. **Error Boundaries**: Use error handling middleware at different levels
6. **Validation**: Add validation middleware early in the request pipeline
7. **Type Safety**: Leverage TypeScript's type system for better reliability

### Advanced Middleware Patterns

```typescript
// Role-based middleware factory
const checkRole = (role: string) => async (req, res, next) => {
  const userRole = req.headers.get('x-user-role');
  if (userRole === role) {
    await next();
  } else {
    throw new Error('Forbidden: Insufficient permissions');
  }
};

// Validation middleware factory
const validateBody = (schema: Record<string, any>) => async (req, res, next) => {
  const missingFields = Object.keys(schema).filter(key => !(key in req.body));
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }
  await next();
};

// Using middleware factories in groups
app.group('/admin')
  .use([
    auth,
    checkRole('admin'),
    validateBody({ apiKey: 'string' })
  ])
  .routes(admin => {
    // Protected admin routes...
  });
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT License

## Credits

Inspired by Express.js and Hono frameworks.