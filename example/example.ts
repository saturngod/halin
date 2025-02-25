import { Halin } from '../src/halin';

const app = new Halin();

// Global error handler
app.use((error: Error, req, res, next) => {
  console.error(`[Error] ${error.message}`);
  res.status(500).json({
    error: error.message,
    path: req.path
  });
});

// Multiple global middleware example
app.use(
  // Logger middleware
  async (req, res, next) => {
    console.log(`[${req.method}] ${req.path}`);
    const startTime = Date.now();
    await next();
    const duration = Date.now() - startTime;
    console.log(`Request completed in ${duration}ms`);
  },
  // Request ID middleware
  async (req, res, next) => {
    const requestId = Math.random().toString(36).substring(7);
    res.header('X-Request-ID', requestId);
    await next();
  },
  // CORS middleware
  async (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', '*');
    res.header('Access-Control-Allow-Headers', '*');
    await next();
  }
);

// Logger middleware: Logs the method and path of each request
app.use(async (req, res, next) => {
  console.log(`[${req.method}] ${req.path}`);
  await next();
});

// Multiple middleware mounted at path
app.use('/api',
  // API Version middleware
  async (req, res, next) => {
    res.header('X-API-Version', '1.0');
    await next();
  },
  // API Rate limiting middleware (example)
  async (req, res, next) => {
    const requestsPerMinute = 60;
    // Here you would typically check a rate limit store
    // This is just an example
    res.header('X-RateLimit-Limit', String(requestsPerMinute));
    await next();
  }
);

// Authentication middleware example
const auth = async (req, res, next) => {
  const token = req.headers.get('authorization');
  if (token === 'secret') {
    await next();
  } else {
    throw new Error('Unauthorized');
  }
};

// Role checking middleware
const checkRole = (role: string) => async (req, res, next) => {
  // In a real app, you'd check the user's role from the token
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

// Public routes
app.get('/', (req, res) => {
  res.json({ message: 'Welcome to Halin!' });
});

// API routes with multiple middleware
app.get('/api/items', 
  auth, 
  checkRole('admin'),
  (req, res) => {
    res.json([
      { id: 1, name: 'Item 1' },
      { id: 2, name: 'Item 2' }
    ]);
  }
);

// POST with validation middleware
app.post('/api/items', 
  auth,
  checkRole('editor'),
  validateBody({ name: 'string', description: 'string' }),
  (req, res) => {
    const newItem = req.body;
    res.json({ message: 'Item created', item: newItem });
  }
);

// Demonstrate wildcard routing
app.get('/api/items/*', (req, res) => {
  res.json({ message: 'Wildcard route matched', path: req.path });
});

// Complex route with multiple middleware and error handling
app.put('/api/items/:id',
  auth,
  checkRole('editor'),
  validateBody({ name: 'string' }),
  async (req, res, next) => {
    // Custom business logic middleware
    const id = req.params.id;
    if (id === '0') {
      throw new Error('Cannot modify item 0');
    }
    await next();
  },
  async (req, res) => {
    const id = req.params.id;
    const updatedItem = req.body;
    res.json({ message: `Item ${id} updated`, item: updatedItem });
  }
);

app.delete('/api/items/:id', auth, (req, res) => {
  const id = req.params.id;
  res.json({ message: `Item ${id} deleted` });
});

// Custom HTTP method examples
app.on('REPORT', '/system/status', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString()
  });
});

app.on('SYNC', '/data/replicate', auth, (req, res) => {
  res.json({
    message: 'Data sync initiated',
    replicaId: 'replica-123'
  });
});

// Custom HTTP methods with multiple middleware
app.on('REPORT', '/system/status',
  auth,
  checkRole('admin'),
  async (req, res, next) => {
    // Add system metrics
    req.body = {
      ...req.body,
      memory: process.memoryUsage(),
      uptime: process.uptime()
    };
    await next();
  },
  (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metrics: req.body
    });
  }
);

// Custom method with multiple handlers
app.on('PROCESS', '/tasks/:taskId',
  auth,
  async (req, res, next) => {
    if (!req.body.data) {
      throw new Error('Process data is required');
    }
    await next();
  },
  (req, res) => {
    const taskId = req.params.taskId;
    res.json({
      message: `Task ${taskId} processing started`,
      status: 'processing'
    });
  }
);

// Batch processing with multiple middleware
app.on('PROCESS', '/tasks/batch',
  auth,
  checkRole('admin'),
  validateBody({ tasks: 'array' }),
  async (req, res, next) => {
    // Pre-process tasks
    if (req.body.tasks.length > 10) {
      throw new Error('Maximum 10 tasks allowed per batch');
    }
    await next();
  },
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

// OpenAI Chat Stream example
app.post('/chat/stream', async (req, res) => {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model: 'gpt-3.5-turbo',
      messages: req.body.messages,
      stream: true
    })
  });

  // Stream the OpenAI response directly to the client
  return res.stream(response.body);
});

// SSE Chat example
app.get('/chat/sse', (req, res) => {
  const sse = res.sse();
  
  // Simulate chat responses
  const interval = setInterval(() => {
    const message = {
      role: 'assistant',
      content: 'This is a streaming message part ' + new Date().toISOString()
    };
    
    if (!sse.send(message)) {
      clearInterval(interval);
    }
  }, 1000);
  
  // Clean up after 5 messages
  setTimeout(() => {
    clearInterval(interval);
    sse.close();
  }, 5000);
});

// OpenAI Chat SSE example
app.post('/chat/stream/sse', async (req, res) => {
  const sse = res.sse();
  
  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-3.5-turbo',
        messages: req.body.messages,
        stream: true
      })
    });

    // Create a text decoder to properly handle the stream
    const decoder = new TextDecoder();
    const reader = response.body.getReader();
    
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      // Decode the stream chunks
      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      // Process each line
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const data = line.slice(6);
          if (data === '[DONE]') {
            sse.close();
            return;
          }
          
          try {
            const parsed = JSON.parse(data);
            if (parsed.choices?.[0]?.delta?.content) {
              sse.send({
                content: parsed.choices[0].delta.content
              });
            }
          } catch (e) {
            console.error('Failed to parse chunk:', e);
          }
        }
      }
    }
  } catch (error) {
    console.error('Stream error:', error);
    sse.send({ error: 'Stream error occurred' });
    sse.close();
  }
});

// User API group with middleware
app.group('/user')
  .use(auth)
  .use(checkRole('user'))
  .routes(user => {
    user.get('/profile', (req, res) => {
      res.json({ name: 'John Doe', email: 'john@example.com' });
    });

    user.put('/profile', 
      validateBody({ name: 'string', email: 'string' }),
      (req, res) => {
        res.json({ message: 'Profile updated' });
      }
    );

    user.get('/settings', (req, res) => {
      res.json({ theme: 'dark', notifications: true });
    });
  });

// Banking group with multiple middleware
app.group([auth, checkRole('customer')])
  .use(validateBody({ accountId: 'string' }))
  .routes(banking => {
    banking.get('/balance', (req, res) => {
      res.json({ balance: 1000.00 });
    });

    banking.post('/transfer',
      validateBody({ toAccount: 'string', amount: 'number' }),
      (req, res) => {
        res.json({ message: 'Transfer successful' });
      }
    );
    
    // Nested deposit group
    app.group('/deposit')
      .use(validateBody({ amount: 'number' }))
      .routes(deposit => {
        deposit.post('/cash', (req, res) => {
          res.json({ message: 'Cash deposited' });
        });

        deposit.post('/check',
          validateBody({ checkNumber: 'string' }),
          (req, res) => {
            res.json({ message: 'Check deposit initiated' });
          }
        );
      });
  });

// Admin group with path and middleware array
app.group('/admin')
  .use([
    auth,
    checkRole('admin'),
    async (req, res, next) => {
      res.header('X-Admin-Access', 'true');
      await next();
    }
  ])
  .routes(admin => {
    admin.get('/users', (req, res) => {
      res.json({ users: ['user1', 'user2'] });
    });

    admin.post('/users',
      validateBody({ username: 'string', role: 'string' }),
      (req, res) => {
        res.json({ message: 'User created' });
      }
    );

    // System management subgroup
    app.group('/system').routes(system => {
      system.get('/status', (req, res) => {
        res.json({ status: 'healthy' });
      });

      system.post('/maintenance', (req, res) => {
        res.json({ message: 'Maintenance mode activated' });
      });
    });
  });

// API group with versioning and rate limiting
app.group('/api/v1')
  .use(
    async (req, res, next) => {
      res.header('X-API-Version', '1.0');
      await next();
    },
    async (req, res, next) => {
      // Rate limiting logic
      await next();
    }
  )
  .routes(api => {
    api.get('/products', (req, res) => {
      res.json([{ id: 1, name: 'Product 1' }]);
    });

    api.post('/products',
      validateBody({ name: 'string', price: 'number' }),
      (req, res) => {
        res.json({ message: 'Product created' });
      }
    );
  });

// API v1 Routes
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
      .use(async (req, res, next) => {
        // User-specific middleware
        req.body = { ...req.body, timestamp: Date.now() };
        await next();
      })
      .routes(users => {
        users.get('/', (req, res) => {
          res.json([{ id: 1, name: 'User 1' }]);
        });

        users.post('/',
          validateBody({ name: 'string', email: 'string' }),
          (req, res) => {
            res.json({ message: 'User created' });
          }
        );

        users.get('/:id', (req, res) => {
          res.json({ id: req.params.id, name: 'User Name' });
        });
      });

    // Products subgroup
    api.group('/products')
      .use(checkRole('admin'))
      .routes(products => {
        products.get('/', (req, res) => {
          res.json([{ id: 1, name: 'Product 1' }]);
        });

        products.post('/',
          validateBody({ name: 'string', price: 'number' }),
          (req, res) => {
            res.json({ message: 'Product created' });
          }
        );
      });

    // Orders subgroup with nested payment routes
    api.group('/orders')
      .use(checkRole('customer'))
      .routes(orders => {
        orders.get('/', (req, res) => {
          res.json([{ id: 1, status: 'pending' }]);
        });

        // Nested payment group
        orders.group('/payment')
          .use(validateBody({ amount: 'number' }))
          .routes(payment => {
            payment.post('/stripe', async (req, res) => {
              res.json({ status: 'processing' });
            });

            payment.post('/paypal', async (req, res) => {
              res.json({ status: 'processing' });
            });
          });
      });
  });

// Admin routes with nested management groups
app.group('/admin')
  .use([auth, checkRole('admin')])
  .routes(admin => {
    // System management
    admin.group('/system')
      .routes(system => {
        system.get('/health', (req, res) => {
          res.json({ status: 'healthy' });
        });

        system.on('REPORT', '/metrics', (req, res) => {
          res.json({
            uptime: process.uptime(),
            memory: process.memoryUsage()
          });
        });
      });

    // User management
    admin.group('/users')
      .routes(users => {
        users.get('/audit', (req, res) => {
          res.json({ logs: [] });
        });

        users.post('/bulk',
          validateBody({ users: 'array' }),
          (req, res) => {
            res.json({ message: 'Users imported' });
          }
        );
      });
  });

// Chat and streaming examples
app.group('/chat')
  .use(auth)
  .routes(chat => {
    // Regular streaming
    chat.post('/stream', async (req, res) => {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: req.body.messages,
          stream: true
        })
      });

      return res.stream(response.body);
    });

    // SSE streaming
    chat.get('/sse', (req, res) => {
      const sse = res.sse();
      const interval = setInterval(() => {
        const message = {
          type: 'message',
          data: 'Server time: ' + new Date().toISOString()
        };
        
        if (!sse.send(message)) {
          clearInterval(interval);
        }
      }, 1000);

      // Cleanup after 30 seconds
      setTimeout(() => {
        clearInterval(interval);
        sse.close();
      }, 30000);
    });
  });

// Example of custom status code responses
app.post('/api/validate', 
  validateBody({ email: 'string', password: 'string' }),
  (req, res) => {
    const { email, password } = req.body;
    
    // Validation example
    if (!email.includes('@')) {
      return res.status(422).json({
        error: 'Validation failed',
        details: {
          email: 'Invalid email format'
        }
      });
    }

    if (password.length < 8) {
      return res.status(422).json({
        error: 'Validation failed',
        details: {
          password: 'Password must be at least 8 characters'
        }
      });
    }

    res.status(200).json({ message: 'Validation passed' });
  }
);

// Example with multiple validation checks
app.post('/api/users', 
  validateBody({ username: 'string', age: 'number', email: 'string' }),
  (req, res) => {
    const { username, age, email } = req.body;
    const errors = {};

    if (username.length < 3) {
      errors['username'] = 'Username must be at least 3 characters';
    }

    if (age < 18) {
      errors['age'] = 'Must be 18 or older';
    }

    if (!email.includes('@')) {
      errors['email'] = 'Invalid email format';
    }

    if (Object.keys(errors).length > 0) {
      return res.status(422).json({
        error: 'Validation failed',
        details: errors
      });
    }

    res.status(201).json({ 
      message: 'User created successfully',
      user: { username, age, email }
    });
  }
);

// Example with business logic validation
app.post('/api/orders',
  auth,
  validateBody({ items: 'array', shippingAddress: 'string' }),
  async (req, res) => {
    const { items, shippingAddress } = req.body;

    // Check if items are in stock
    const outOfStockItems = items.filter(item => !isInStock(item.id));
    if (outOfStockItems.length > 0) {
      return res.status(422).json({
        error: 'Order validation failed',
        details: {
          items: `Items not in stock: ${outOfStockItems.map(i => i.id).join(', ')}`
        }
      });
    }

    // Validate shipping address
    if (!isValidShippingAddress(shippingAddress)) {
      return res.status(422).json({
        error: 'Order validation failed',
        details: {
          shippingAddress: 'Invalid shipping address'
        }
      });
    }

    // Process valid order
    const order = await createOrder(items, shippingAddress);
    res.status(201).json({ 
      message: 'Order created successfully',
      orderId: order.id
    });
  }
);

// Example with file upload validation
app.post('/api/files/upload',
  auth,
  async (req, res) => {
    const file = req.body;
    const maxSize = 5 * 1024 * 1024; // 5MB

    if (!file) {
      return res.status(422).json({
        error: 'Validation failed',
        details: {
          file: 'No file provided'
        }
      });
    }

    if (file.size > maxSize) {
      return res.status(422).json({
        error: 'Validation failed',
        details: {
          file: 'File size exceeds 5MB limit'
        }
      });
    }

    if (!['image/jpeg', 'image/png'].includes(file.type)) {
      return res.status(422).json({
        error: 'Validation failed',
        details: {
          file: 'Only JPEG and PNG files are allowed'
        }
      });
    }

    // Process valid file
    await saveFile(file);
    res.status(201).json({ message: 'File uploaded successfully' });
  }
);

// Start the server
app.listen(3000, () => {
  console.log('Server is running on http://localhost:3000');
});