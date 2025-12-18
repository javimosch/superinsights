const express = require('express');
const path = require('path');

const app = express();

const PORT = Number(process.env.PORT) || 3001;
const SUPERINSIGHTS_API_URL = String(process.env.SUPERINSIGHTS_API_URL || 'http://localhost:3000').replace(/\/$/, '');
const SUPERINSIGHTS_PUBLIC_KEY = String(process.env.SUPERINSIGHTS_PUBLIC_KEY || '');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let nextId = 1;
let todos = [];

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function nowIso() {
  return new Date().toISOString();
}

function validateTitle(title) {
  if (typeof title !== 'string') return false;
  const t = title.trim();
  return t.length > 0 && t.length <= 140;
}

app.get('/', (req, res) => {
  res.type('html').send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Todo App (SuperInsights Example)</title>
    <script>
      window.TODO_APP_CONFIG = ${JSON.stringify({
        superinsightsApiUrl: SUPERINSIGHTS_API_URL,
        superinsightsPublicKey: SUPERINSIGHTS_PUBLIC_KEY,
      })};
    </script>
    <script src="${SUPERINSIGHTS_API_URL}/sdk/superinsights.js"></script>
    <link rel="stylesheet" href="/styles.css" />
  </head>
  <body>
    <main class="container">
      <header class="header">
        <h1>Todo App</h1>
        <p class="muted">Example app instrumented with SuperInsights (events + timings).</p>
      </header>

      <section class="card">
        <form id="create-form" class="row">
          <input id="new-title" class="input" placeholder="What needs to be done?" autocomplete="off" />
          <button class="btn" type="submit">Add</button>
        </form>
        <div class="row row-space">
          <button id="refresh" class="btn btn-secondary" type="button">Refresh</button>
          <button id="seed" class="btn btn-secondary" type="button">Seed</button>
          <button id="clear" class="btn btn-danger" type="button">Clear</button>
        </div>
      </section>

      <section class="card">
        <div class="row row-space">
          <h2 class="h2">Todos</h2>
          <div id="status" class="muted"></div>
        </div>
        <ul id="todo-list" class="list"></ul>
      </section>

      <footer class="footer muted">
        <div>SDK URL: <span id="sdk-url"></span></div>
        <div>API key: <span id="api-key"></span></div>
      </footer>
    </main>

    <script src="/app.js"></script>
  </body>
</html>`);
});

app.get('/api/todos', async (req, res) => {
  res.json({
    items: todos.slice().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
  });
});

app.post('/api/todos', async (req, res) => {
  const title = req.body && req.body.title;
  if (!validateTitle(title)) {
    return res.status(400).json({ error: 'Invalid title' });
  }

  const normalizedTitle = String(title).toLowerCase();
  if (normalizedTitle.includes('slow') || normalizedTitle.includes('lento')) {
    const delayMs = 1000 + Math.floor(Math.random() * 1000);
    await sleep(delayMs);
  }

  const todo = {
    id: String(nextId++),
    title: String(title).trim(),
    completed: false,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  todos.push(todo);
  return res.status(201).json({ item: todo });
});

app.patch('/api/todos/:id', async (req, res) => {
  const id = String(req.params.id);
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const next = { ...todos[idx] };

  if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'title')) {
    if (!validateTitle(req.body.title)) {
      return res.status(400).json({ error: 'Invalid title' });
    }
    next.title = String(req.body.title).trim();
  }

  if (req.body && Object.prototype.hasOwnProperty.call(req.body, 'completed')) {
    next.completed = Boolean(req.body.completed);
  }

  next.updatedAt = nowIso();
  todos[idx] = next;

  return res.json({ item: next });
});

app.delete('/api/todos/:id', async (req, res) => {
  const id = String(req.params.id);
  const idx = todos.findIndex((t) => t.id === id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });

  const removed = todos[idx];
  todos.splice(idx, 1);

  return res.json({ item: removed });
});

app.post('/api/seed', async (req, res) => {
  const n = Math.max(1, Math.min(10, Number(req.body && req.body.count) || 5));

  for (let i = 0; i < n; i += 1) {
    const todo = {
      id: String(nextId++),
      title: `Example todo #${i + 1}`,
      completed: i % 3 === 0,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    todos.push(todo);
  }

  return res.json({ success: true, count: n });
});

app.post('/api/clear', async (req, res) => {
  todos = [];
  nextId = 1;
  return res.json({ success: true });
});

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`[todo-app] listening on http://localhost:${PORT}`);
  // eslint-disable-next-line no-console
  console.log(`[todo-app] SuperInsights API URL: ${SUPERINSIGHTS_API_URL}`);
});
