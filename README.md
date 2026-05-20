# Excalidraw App

**[简体中文](./README_cn.md)**

A local-first Excalidraw editor that makes opening, browsing, and saving `.excalidraw` files as smooth as working with local files.

## Why This Project

The official Excalidraw website is a great drawing tool, but if you maintain a large number of `.excalidraw` files daily, you'll find a lot of friction in file operations:

- You have to manually select a file every time you open one
- Saving requires manual export/download
- There's no file list for quick switching
- You can't double-click a `.excalidraw` file to open it like a native app

Excalidraw App embeds the official `@excalidraw/excalidraw` component and wraps it with a local file operation shell. Core features:

- 📂 Open a local directory and browse all `.excalidraw` files in a sidebar
- 💾 `Cmd+S` to save directly back to the original file
- 🎨 Light/Dark/System theme support
- 🌐 English & 简体中文 UI (toggle in topbar)
- 📱 Install as PWA and double-click `.excalidraw` files to open them natively

## Installation & Usage

### Recommended: Docker + PWA (smoothest experience)

This is the recommended way for daily use. Just two steps:

**Step 1: Start a local server with Docker**

```bash
docker pull ghcr.io/summereasy/excalidraw-app:latest
docker run -d --name excalidraw-app -p 38767:80 ghcr.io/summereasy/excalidraw-app:latest
```

Using Apple Containers:

```bash
container run --rm -d --name excalidraw-app -p 38767:80 excalidraw-app:latest
```

Then open http://127.0.0.1:38767/ .

> The container only serves static files. File read/write is done locally through the browser's File System Access API — the container never accesses your files.

**Step 2: Install as PWA**

Open the address above in Chrome / Edge / Brave, then:

1. Browser menu → **Install Excalidraw App**
2. After installation, set the installed app as the default handler for `.excalidraw` files on macOS:
   - Right-click a `.excalidraw` file in Finder → Get Info → Open With → select Excalidraw App → Change All

After that, double-clicking any `.excalidraw` file will open it directly — no more manual import/export.

To stop the service:

```bash
docker stop excalidraw-app && docker rm excalidraw-app
# Apple Containers:
container stop excalidraw-app
```

### Development

For hacking on the code or debugging.

Requirements: Node.js 18+, pnpm

```bash
pnpm install
pnpm dev
```

Open the printed local address in your browser (usually http://127.0.0.1:5173/).

Build for production:

```bash
pnpm build
pnpm preview   # preview production build locally
```

### Build Docker Image

For building and deploying your own image.

```bash
pnpm build
container build -t excalidraw-app:latest .
# or:
pnpm image:build
```

The image only contains `dist/` + nginx — no Node.js build environment.

### Deployment

This is a purely static SPA. Build output goes to `dist/`. Drop it onto any static file server (nginx, Caddy, Vercel, Netlify...). The only requirement is HTTPS (needed for PWA and File System Access API). Local `127.0.0.1` is an exception — no HTTPS needed.

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
- PWA file double-click support depends on the browser's file handler capability — Chrome and Edge have the best support
- There is no backend server — all file operations happen locally in the browser

## Acknowledgements

Built on the official Excalidraw project:

- https://github.com/excalidraw/excalidraw
- https://www.npmjs.com/package/@excalidraw/excalidraw

Thanks to the Excalidraw team for maintaining this excellent drawing tool and providing the embeddable React component.

## License

MIT. See [LICENSE](./LICENSE).
