# Excalidraw App

**[简体中文](./README_cn.md)**

A local-first Excalidraw editor that makes opening, browsing, and saving `.excalidraw` files as smooth as working with local files.

## Why This Project

The official Excalidraw website is a great drawing tool, but if you maintain a large number of `.excalidraw` files daily, you'll find a lot of friction in file operations:

- You have to manually select a file every time you open one
- Saving requires manual export/download
- There's no file list for quick switching

Excalidraw App embeds the official `@excalidraw/excalidraw` component and wraps it with a local file operation shell. Core features:

- 📂 Open a local directory and browse all `.excalidraw` files in a sidebar
- 💾 `Cmd+S` to save directly back to the original file
- 🎨 Light/Dark/System theme support
- 🌐 English & 简体中文 UI (toggle in topbar)

## Installation & Usage

### Recommended: Local Caddy

This app is a static browser app. The recommended production path is to build it once, then serve `dist/` from a local static file server. Caddy is a simple option:

```bash
bun install
bun run build
```

Example `Caddyfile`:

```caddyfile
http://127.0.0.1:7072 {
	root * ./dist
	file_server

	@appShell path / /index.html
	header @appShell Cache-Control "no-cache"
}
```

Run Caddy from the project root:

```bash
caddy run --config Caddyfile
```

Then open http://127.0.0.1:7072/ .

> Caddy only serves static files from `dist/`. File read/write is done locally through the browser's File System Access API; Caddy never accesses your drawing files.

### Development

For hacking on the code or debugging.

Requirements: Node.js 18+ and project dependencies installed.

```bash
bun run dev
```

Open the printed local address in your browser (usually http://127.0.0.1:5173/).

Build for production:

```bash
bun run build
bun run preview   # preview production build locally
```

### Deployment Model

This is a purely static SPA. Build output goes to `dist/`. Serve that directory with any static file server, such as Caddy, nginx, Apache, or a managed static hosting service.

The File System Access API normally requires HTTPS, but local `127.0.0.1` and `localhost` are secure-context exceptions.

## Keyboard Shortcuts

| Shortcut | Action |
| --- | --- |
| `Cmd+S` / `Ctrl+S` | Save current file |
| `Cmd+B` / `Ctrl+B` | Toggle sidebar & topbar |

## Notes

### Browser Requirements

Requires a Chromium-based browser with [File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access) support.

Verified browsers:

- ✅ Chrome
- ✅ Edge
- ⚠️ Brave (requires manual enablement, see below)

### Brave: Enable File System Access API

Brave disables the File System Access API by default. You need to enable it manually.

1. Navigate to `brave://flags/#file-system-access-api`
2. Set **File System Access API** to **Enabled**
3. Restart Brave

### Other Limitations

- Can only access directories you explicitly select — no silent read/write of arbitrary paths (browser security boundary)
- There is no backend server — all file operations happen locally in the browser

## Acknowledgements

Built on the official Excalidraw project:

- https://github.com/excalidraw/excalidraw
- https://www.npmjs.com/package/@excalidraw/excalidraw

Thanks to the Excalidraw team for maintaining this excellent drawing tool and providing the embeddable React component.

## License

MIT. See [LICENSE](./LICENSE).
