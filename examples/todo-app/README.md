# Todo App (SuperInsights Example)

This example app runs on port `3001`, loads the SuperInsights browser SDK from your SuperInsights server (default `http://localhost:3000`), and sends events when you CRUD todos.

## Run

1. Start the main SuperInsights app (typically on `:3000`).
2. Ensure you have a **public API key** for a project (starts with `pk_`).
3. Start this example:

```bash
npm install
SUPERINSIGHTS_PUBLIC_KEY=pk_your_key SUPERINSIGHTS_API_URL=http://localhost:3000 npm start
```

Then open:

- http://localhost:3001

## What it tracks

- `todo_app_loaded`
- `todo_list_loaded` / `todo_list_load_failed`
- `todo_created` / `todo_create_failed`
- `todo_updated` / `todo_update_failed`
- `todo_deleted` / `todo_delete_failed`
- `todo_toggled` / `todo_toggle_failed`

It also emits **timed events** for each API call using:

- `SuperInsights.timeAsync('todo_api_get' | 'todo_api_post' | 'todo_api_patch' | 'todo_api_delete', ...)`

Those timed events show up under **Events → Slowest timed events**.
