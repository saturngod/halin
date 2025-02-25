import { Halin } from '../../src/halin'; // Adjust the import path as necessary
import { describe, expect, test } from 'bun:test';

// Helper functions from example.ts
const auth = async (req, res, next) => {
  const token = req.headers.get('authorization');
  if (token === 'secret') {
    await next();
  } else {
    throw new Error('Unauthorized');
  }
};

const checkRole = (role: string) => async (req, res, next) => {
  const userRole = req.headers.get('x-user-role');
  if (userRole === role) {
    await next();
  } else {
    throw new Error('Forbidden: Insufficient permissions');
  }
};

const validateBody = (schema: Record<string, any>) => async (req, res, next) => {
  const missingFields = Object.keys(schema).filter(key => !(key in req.body));
  if (missingFields.length > 0) {
    throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
  }
  await next();
};

describe('Halin Framework', () => {
  test('GET / should return welcome message', async () => {
    const app = new Halin();
    app.get('/', (req, res) => {
      res.json({ message: 'Welcome to Halin!' });
    });
    const request = new Request('http://localhost/');
    const response = await app.handle(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ message: 'Welcome to Halin!' });
  });

  test('middleware should set X-Request-ID header', async () => {
    const app = new Halin();
    app.use(async (req, res, next) => {
      const requestId = Math.random().toString(36).substring(7);
      res.header('X-Request-ID', requestId);
      await next();
    });
    app.get('/', (req, res) => {
      res.json({ message: 'test' });
    });
    const request = new Request('http://localhost/');
    const response = await app.handle(request);
    expect(response.headers.get('X-Request-ID')).toBeTruthy();
  });

  test('multiple middleware should execute in order', async () => {
    const app = new Halin();
    const order: string[] = [];
    app.use(async (req, res, next) => {
      order.push('first');
      await next();
    });
    app.use(async (req, res, next) => {
      order.push('second');
      await next();
    });
    app.get('/', (req, res) => {
      order.push('handler');
      res.json({ message: 'test' });
    });
    const request = new Request('http://localhost/');
    await app.handle(request);
    expect(order).toEqual(['first', 'second', 'handler']);
  });

  test('route parameters should be extracted', async () => {
    const app = new Halin();
    app.get('/users/:id', (req, res) => {
      res.json({ id: req.params.id });
    });
    const request = new Request('http://localhost/users/123');
    const response = await app.handle(request);
    const data = await response.json();
    expect(data).toEqual({ id: '123' });
  });

  test('query parameters should be available', async () => {
    const app = new Halin();
    app.get('/search', (req, res) => {
      res.json({ query: req.query });
    });
    const request = new Request('http://localhost/search?q=test&sort=asc');
    const response = await app.handle(request);
    const data = await response.json();
    expect(data).toEqual({ query: { q: 'test', sort: 'asc' } });
  });

  test('global error handler should handle errors', async () => {
    const app = new Halin();
    app.use((error, req, res, next) => {
      res.status(500).json({ error: error.message, path: req.path });
    });
    app.get('/error', (req, res) => {
      throw new Error('Test error');
    });
    const request = new Request('http://localhost/error');
    const response = await app.handle(request);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: 'Test error', path: '/error' });
  });

  test('unhandled errors should return 500', async () => {
    const app = new Halin();
    app.get('/error', (req, res) => {
      throw new Error('Test error');
    });
    const request = new Request('http://localhost/error');
    const response = await app.handle(request);
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data).toEqual({ error: 'Test error' });
  });

  test('authentication middleware should enforce authorization', async () => {
    const app = new Halin();
    app.get('/api/items', auth, (req, res) => {
      res.json({ items: [] });
    });
    // Unauthorized request
    let request = new Request('http://localhost/api/items');
    let response = await app.handle(request);
    expect(response.status).toBe(500);
    let data = await response.json();
    expect(data).toEqual({ error: 'Unauthorized' });
    // Authorized request
    request = new Request('http://localhost/api/items', {
      headers: { 'authorization': 'secret' }
    });
    response = await app.handle(request);
    expect(response.status).toBe(200);
    data = await response.json();
    expect(data).toEqual({ items: [] });
  });

  test('role checking middleware should enforce permissions', async () => {
    const app = new Halin();
    app.get('/api/items', auth, checkRole('admin'), (req, res) => {
      res.json({ items: [] });
    });
    // Forbidden request
    let request = new Request('http://localhost/api/items', {
      headers: { 'authorization': 'secret', 'x-user-role': 'user' }
    });
    let response = await app.handle(request);
    expect(response.status).toBe(500);
    let data = await response.json();
    expect(data).toEqual({ error: 'Forbidden: Insufficient permissions' });
    // Authorized request
    request = new Request('http://localhost/api/items', {
      headers: { 'authorization': 'secret', 'x-user-role': 'admin' }
    });
    response = await app.handle(request);
    expect(response.status).toBe(200);
    data = await response.json();
    expect(data).toEqual({ items: [] });
  });

  test('validation middleware should check request body', async () => {
    const app = new Halin();
    app.post('/api/items', validateBody({ name: 'string' }), (req, res) => {
      res.json({ item: req.body });
    });
    // Invalid request
    let request = new Request('http://localhost/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    let response = await app.handle(request);
    expect(response.status).toBe(500);
    let data = await response.json();
    expect(data).toEqual({ error: 'Missing required fields: name' });
    // Valid request
    request = new Request('http://localhost/api/items', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Item 1' })
    });
    response = await app.handle(request);
    expect(response.status).toBe(200);
    data = await response.json();
    expect(data).toEqual({ item: { name: 'Item 1' } });
  });

  test('group routes should have prefix and middleware', async () => {
    const app = new Halin();
    app.group('/user')
      .use(auth)
      .use(checkRole('user'))
      .routes(user => {
        user.get('/profile', (req, res) => {
          res.json({ name: 'John Doe' });
        });
      });
    // Unauthorized request
    let request = new Request('http://localhost/user/profile');
    let response = await app.handle(request);
    expect(response.status).toBe(500);
    let data = await response.json();
    expect(data).toEqual({ error: 'Unauthorized' });
    // Forbidden request
    request = new Request('http://localhost/user/profile', {
      headers: { 'authorization': 'secret', 'x-user-role': 'admin' }
    });
    response = await app.handle(request);
    expect(response.status).toBe(500);
    data = await response.json();
    expect(data).toEqual({ error: 'Forbidden: Insufficient permissions' });
    // Authorized request
    request = new Request('http://localhost/user/profile', {
      headers: { 'authorization': 'secret', 'x-user-role': 'user' }
    });
    response = await app.handle(request);
    expect(response.status).toBe(200);
    data = await response.json();
    expect(data).toEqual({ name: 'John Doe' });
  });

  test('nested group routes should apply middleware', async () => {
    const app = new Halin();
    app.group('/api/v1')
      .use(auth)
      .routes(api => {
        api.group('/users')
          .use(checkRole('admin'))
          .routes(users => {
            users.get('', (req, res) => { // Changed from '/' to ''
              res.json({ users: [] });
            });
          });
      });

    let request = new Request('http://localhost/api/v1/users');
    let response = await app.handle(request);
    expect(response.status).toBe(500);
    let data = await response.json();
    expect(data).toEqual({ error: 'Unauthorized' });
    // Forbidden request
    request = new Request('http://localhost/api/v1/users', {
      headers: { 'authorization': 'secret', 'x-user-role': 'user' }
    });
    response = await app.handle(request);
    expect(response.status).toBe(500);
    data = await response.json();
    expect(data).toEqual({ error: 'Forbidden: Insufficient permissions' });
    // Authorized request
    request = new Request('http://localhost/api/v1/users', {
      headers: { 'authorization': 'secret', 'x-user-role': 'admin' }
    });
    response = await app.handle(request);
    expect(response.status).toBe(200);
    data = await response.json();
    expect(data).toEqual({ users: [] });
  });

  test('should handle custom HTTP methods', async () => {
    const app = new Halin();
    app.on('REPORT', '/system/status', (req, res) => {
      res.json({ status: 'healthy' });
    });
    const request = new Request('http://localhost/system/status', { method: 'REPORT' });
    const response = await app.handle(request);
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toEqual({ status: 'healthy' });
  });

  test('should return 404 for unknown routes', async () => {
    const app = new Halin();
    const request = new Request('http://localhost/unknown');
    const response = await app.handle(request);
    expect(response.status).toBe(404);
    const data = await response.json();
    expect(data).toEqual({ error: 'Not Found' });
  });

  // Note: Testing streaming and SSE responses with handle method is limited due to async nature
  // For thorough testing of streaming/SSE, consider integration tests
  test('should handle streaming responses', async () => {
    const app = new Halin();
    app.get('/stream', (req, res) => {
      const stream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('test data'));
          controller.close();
        }
      });
      res.stream(stream);
    });
    const request = new Request('http://localhost/stream');
    const response = await app.handle(request);
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).toBe('test data');
  });

  test('should handle SSE responses', async () => {
    const app = new Halin();
    app.get('/sse', (req, res) => {
      const sse = res.sse();
      sse.send({ message: 'test' });
      sse.close();
    });
    const request = new Request('http://localhost/sse');
    const response = await app.handle(request);
    expect(response.status).toBe(200);
    expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    const text = await response.text();
    expect(text).toBe('data: {"message":"test"}\n\n');
  });
});