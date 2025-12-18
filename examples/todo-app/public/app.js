function $(id) {
  return document.getElementById(id);
}

const cfg = window.TODO_APP_CONFIG || {};

function initSuperInsights() {
  const apiUrl = String(cfg.superinsightsApiUrl || '').replace(/\/$/, '');
  const apiKey = String(cfg.superinsightsPublicKey || '');

  if (!apiUrl || !apiKey || !window.SuperInsights) {
    return { enabled: false };
  }

  window.SuperInsights.init(apiKey, {
    apiUrl,
    batchSize: 20,
    flushInterval: 2000,
    debug: true,
  });

  window.SuperInsights.trackEvent('todo_app_loaded', {
    port: window.location.port,
  });

  return { enabled: true, apiUrl, apiKey };
}

const si = initSuperInsights();

if ($('sdk-url')) $('sdk-url').textContent = si.enabled ? `${si.apiUrl}/sdk/superinsights.js` : '(not configured)';
if ($('api-key')) $('api-key').textContent = si.enabled ? `${si.apiKey.slice(0, 6)}…` : '(missing)';

let todos = [];

function setStatus(text) {
  const el = $('status');
  if (!el) return;
  el.textContent = text || '';
}

function render() {
  const list = $('todo-list');
  if (!list) return;

  list.innerHTML = '';

  if (!todos.length) {
    const li = document.createElement('li');
    li.className = 'muted';
    li.textContent = 'No todos.';
    list.appendChild(li);
    return;
  }

  for (const t of todos) {
    const li = document.createElement('li');
    li.className = 'todo';

    const left = document.createElement('div');
    left.className = 'todo-left';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = Boolean(t.completed);
    checkbox.addEventListener('change', () => toggleTodo(t));

    const title = document.createElement('span');
    title.className = t.completed ? 'todo-title done' : 'todo-title';
    title.textContent = t.title;

    left.appendChild(checkbox);
    left.appendChild(title);

    const actions = document.createElement('div');
    actions.className = 'todo-actions';

    const edit = document.createElement('button');
    edit.className = 'btn btn-small btn-secondary';
    edit.textContent = 'Edit';
    edit.addEventListener('click', () => editTodo(t));

    const del = document.createElement('button');
    del.className = 'btn btn-small btn-danger';
    del.textContent = 'Delete';
    del.addEventListener('click', () => deleteTodo(t));

    actions.appendChild(edit);
    actions.appendChild(del);

    li.appendChild(left);
    li.appendChild(actions);

    list.appendChild(li);
  }
}

async function apiFetch(method, url, body) {
  const opts = {
    method,
    headers: {
      'Content-Type': 'application/json',
    },
  };

  if (body !== undefined) {
    opts.body = JSON.stringify(body);
  }

  const doFetch = async () => {
    const res = await fetch(url, opts);
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = data && data.error ? data.error : `Request failed (${res.status})`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  };

  if (window.SuperInsights && window.SuperInsights.timeAsync) {
    return window.SuperInsights.timeAsync(`todo_api_${method.toLowerCase()}`, () => doFetch(), {
      url,
    });
  }

  return doFetch();
}

async function loadTodos() {
  setStatus('Loading…');

  try {
    const data = await apiFetch('GET', '/api/todos');
    todos = Array.isArray(data.items) ? data.items : [];

    if (window.SuperInsights) {
      window.SuperInsights.trackEvent('todo_list_loaded', { count: todos.length });
    }

    render();
    setStatus('');
  } catch (err) {
    setStatus(err && err.message ? err.message : 'Failed to load');
    if (window.SuperInsights) {
      window.SuperInsights.trackEvent('todo_list_load_failed', { message: String(err && err.message ? err.message : err) });
    }
  }
}

async function createTodo(title) {
  const clean = String(title || '').trim();
  if (!clean) return;

  try {
    const data = await apiFetch('POST', '/api/todos', { title: clean });
    if (window.SuperInsights) {
      window.SuperInsights.trackEvent('todo_created', { todoId: data.item && data.item.id ? data.item.id : null });
    }
    await loadTodos();
  } catch (err) {
    if (window.SuperInsights) {
      window.SuperInsights.trackEvent('todo_create_failed', { message: String(err && err.message ? err.message : err) });
    }
    throw err;
  }
}

async function toggleTodo(todo) {
  const nextCompleted = !Boolean(todo.completed);

  try {
    const data = await apiFetch('PATCH', `/api/todos/${encodeURIComponent(todo.id)}`, { completed: nextCompleted });
    if (window.SuperInsights) {
      window.SuperInsights.trackEvent('todo_toggled', {
        todoId: todo.id,
        completed: nextCompleted,
      });
    }
    todo.completed = Boolean(data.item && data.item.completed);
    render();
  } catch (err) {
    if (window.SuperInsights) {
      window.SuperInsights.trackEvent('todo_toggle_failed', { todoId: todo.id, message: String(err && err.message ? err.message : err) });
    }
    setStatus(err && err.message ? err.message : 'Failed to toggle');
  }
}

async function editTodo(todo) {
  const nextTitle = window.prompt('Edit todo', todo.title);
  if (nextTitle === null) return;

  try {
    const data = await apiFetch('PATCH', `/api/todos/${encodeURIComponent(todo.id)}`, { title: nextTitle });
    if (window.SuperInsights) {
      window.SuperInsights.trackEvent('todo_updated', { todoId: todo.id });
    }
    todo.title = String(data.item && data.item.title ? data.item.title : todo.title);
    render();
  } catch (err) {
    if (window.SuperInsights) {
      window.SuperInsights.trackEvent('todo_update_failed', { todoId: todo.id, message: String(err && err.message ? err.message : err) });
    }
    setStatus(err && err.message ? err.message : 'Failed to update');
  }
}

async function deleteTodo(todo) {
  if (!window.confirm('Delete this todo?')) return;

  try {
    await apiFetch('DELETE', `/api/todos/${encodeURIComponent(todo.id)}`);
    if (window.SuperInsights) {
      window.SuperInsights.trackEvent('todo_deleted', { todoId: todo.id });
    }
    await loadTodos();
  } catch (err) {
    if (window.SuperInsights) {
      window.SuperInsights.trackEvent('todo_delete_failed', { todoId: todo.id, message: String(err && err.message ? err.message : err) });
    }
    setStatus(err && err.message ? err.message : 'Failed to delete');
  }
}

async function seedTodos() {
  try {
    await apiFetch('POST', '/api/seed', { count: 5 });
    if (window.SuperInsights) {
      window.SuperInsights.trackEvent('todo_seeded', { count: 5 });
    }
    await loadTodos();
  } catch (err) {
    setStatus(err && err.message ? err.message : 'Failed to seed');
  }
}

async function clearTodos() {
  if (!window.confirm('Clear ALL todos?')) return;

  try {
    await apiFetch('POST', '/api/clear');
    if (window.SuperInsights) {
      window.SuperInsights.trackEvent('todo_cleared', {});
    }
    await loadTodos();
  } catch (err) {
    setStatus(err && err.message ? err.message : 'Failed to clear');
  }
}

function attachHandlers() {
  const form = $('create-form');
  const input = $('new-title');
  const refresh = $('refresh');
  const seed = $('seed');
  const clear = $('clear');

  if (form && input) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const title = input.value;
      input.value = '';
      try {
        await createTodo(title);
      } catch (err) {
        setStatus(err && err.message ? err.message : 'Failed to create');
      }
    });
  }

  if (refresh) refresh.addEventListener('click', () => loadTodos());
  if (seed) seed.addEventListener('click', () => seedTodos());
  if (clear) clear.addEventListener('click', () => clearTodos());
}

attachHandlers();
loadTodos();
