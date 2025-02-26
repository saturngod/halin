// example.ts - Example usage of Halin web framework
import { Halin, HalinError } from '../src/halin';

// Create Halin app instance
const app = new Halin();

// Basic middleware example (logging)
app.use(async (req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  await next();
});

// Simple GET route
app.get('/', (req, res) => {
  res.send('Welcome to Halin!');
});

// Route with parameters
app.get('/users/:id', (req, res) => {
  res.json({
    userId: req.params.id,
    name: `User ${req.params.id}`,
    query: req.query
  });
});

// POST route with JSON body handling
app.post('/data', async (req, res) => {
  const data = req.body;
  res.status(201).json({ received: data });
});

// Error handling example
app.get('/error', () => {
  throw new HalinError(418, "I'm a teapot");
});

// Custom error handler
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

// SSE (Server-Sent Events) example
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

// Grouped routes with common prefix and middleware
app.group('/api')
  .use((req, res, next) => {
    // Authentication middleware for API group
    if (req.headers.get('x-api-key') !== 'secret') {
      throw new HalinError(401, 'Invalid API key');
    }
    next();
  })
  .routes(api => {
    api.get('/users', (req, res) => {
      res.json([{ id: 1, name: 'John' }, { id: 2, name: 'Jane' }]);
    });

    api.post('/users', (req, res) => {
      res.status(201).json({ id: 3, ...req.body });
    });

    // Nested group example
    api.group('/v2').routes(v2 => {
      v2.get('/products', (req, res) => {
        res.json([{ id: 'p1', name: 'Product 1' }]);
      });
    });
  });

// Start server
app.listen(3000, () => {
  console.log('Server started on http://localhost:3000');
});