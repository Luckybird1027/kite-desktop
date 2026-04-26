# Desktop Runtime Contract

## Scope

This document defines the runtime contract between the embedded desktop host and the React UI.

It applies only when:

- `APP_RUNTIME=desktop-local`
- `/api/desktop/status.enabled=true`

## Runtime Identity

Desktop mode is represented as a dedicated runtime, not as anonymous web mode.

Runtime response shape:

```json
{
  "enabled": true,
  "runtime": "desktop-local",
  "capabilities": {
    "nativeFileDialog": true,
    "nativeSaveDialog": true,
    "tray": true,
    "menu": true,
    "singleInstance": true
  }
}
```

## Auth Contract

Desktop mode does not synthesize a frontend-only user.

The UI must always read the current user from:

- `GET /api/auth/user`

The backend injects the local desktop user when `desktop-local` runtime is active.

## Desktop APIs

### `GET /api/desktop/status`

Returns current runtime and desktop capabilities.

### `GET /api/desktop/app-info`

Returns app metadata and resolved local directories.

Response shape:

```json
{
  "name": "Kite",
  "runtime": "desktop-local",
  "version": "v0.0.0",
  "buildDate": "2026-04-04T00:00:00Z",
  "commitId": "abcdef0",
  "paths": {
    "configDir": "...",
    "logsDir": "...",
    "cacheDir": "...",
    "tempDir": "..."
  }
}
```

### `POST /api/desktop/open-url`

Opens:

- same-origin routes in a desktop child window
- external links in the system browser

### `POST /api/desktop/open-file`

Opens the native file picker and can optionally return file content.

### `POST /api/desktop/save-file`

Opens the native save dialog and writes text content from the desktop host.

### `POST /api/desktop/download-to-path`

Opens the native save dialog and downloads a URL directly from the desktop host.

### `POST /api/desktop/open-path`

Opens a local file or directory in the host OS.

### `POST /api/desktop/reveal-path`

Reveals a local path by opening its containing directory.

### `POST /api/desktop/open-config-dir`

Opens the resolved Kite config directory.

### `POST /api/desktop/open-logs-dir`

Opens the resolved Kite logs directory.

### `POST /api/desktop/window/focus`

Focuses and restores the main window.

### `POST /api/desktop/window/hide`

Hides the main window.

### `POST /api/desktop/window/quit`

Quits the desktop app.

### `POST /api/desktop/copy-to-clipboard`

Copies text via the native clipboard.

### `POST /api/desktop/import-kubeconfig`

Imports kubeconfig content, or opens the native file dialog when content is omitted.

### `POST /api/v1/admin/clusters/source-reload`

Desktop-oriented recovery endpoint for file-based kubeconfig clusters.

- request body:

```json
{
  "name": "cluster-name"
}
```

- behavior:
  - compares current in-memory file fingerprint with the latest kubeconfig file fingerprint
  - if unchanged, returns without rebuilding
  - if changed, triggers cluster sync/rebuild and returns reconnect result
  - intended for "retry after connection error" flows in desktop runtime

## UI Rules

The UI should not directly depend on browser-only behavior for desktop actions.

Desktop-sensitive actions must go through `ui/src/lib/desktop.ts`, including:

- opening external links
- saving files
- downloading files
- opening config or logs directories
- clipboard copy when native bridge is available

For file-based kubeconfig clusters in desktop runtime:

- cluster setting supports `configSource=file` + `configPath` (+ optional `configContext`)
- runtime recovery should call `/api/v1/admin/clusters/source-reload` when connection failures suggest kubeconfig drift

## Data Directories

Desktop host ensures these directories exist before runtime boot:

- `Kite/`
- `Kite/logs/`
- `Kite/cache/`
- `Kite/tmp/`

Default SQLite path:

- `Kite/kite.db`
