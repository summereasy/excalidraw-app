# Excalidraw App

A local-first Excalidraw editor for people who keep `.excalidraw` files in normal folders.

This app embeds the official `@excalidraw/excalidraw` React component and adds a small file-browser shell around it. It is meant for opening a local folder, switching between drawings in that folder, and saving changes back to the same `.excalidraw` file with `Cmd+S`.

## What This Is For

- Browse `.excalidraw` files from a local directory.
- Open a drawing without using Excalidraw's file picker every time.
- Save changes back to the current local file.
- Create a new drawing and save it as a `.excalidraw` file.
- Use light, dark, or system theme.
- Hide the local file UI with `Cmd+B` / `Ctrl+B` when you want a cleaner canvas.
- Install as a PWA and, where supported by the browser, open `.excalidraw` files through the operating system file handler.

This is a browser app, not a native desktop app. It uses the File System Access API, so the browser will ask for explicit permission before reading a directory or writing a file.

## Browser Support

Use a Chromium browser with File System Access API support.

Known working setup:

- Chrome
- Edge
- Brave, after enabling the File System Access API flag

For Brave:

1. Open `brave://flags/#file-system-access-api`.
2. Set `File System Access API` to `Enabled`.
3. Restart Brave.

Use the local dev URL shown by Vite, usually:

```text
http://127.0.0.1:5173/
```

or:

```text
http://localhost:5173/
```

## Setup

### Development

Requirements:

- Node.js 18+
- pnpm

Install dependencies:

```bash
pnpm install
```

Start the development server:

```bash
pnpm dev
```

Open the printed local URL in your browser.

Build for production:

```bash
pnpm build
```

Preview the production build:

```bash
pnpm preview
```

### Local Docker Hosting

For day-to-day local use, you do not need to keep `pnpm dev` running. You can build and run the static app with Docker or any compatible container runtime:

```bash
docker build -t excalidraw-app .
docker run -d --name excalidraw-app -p 38767:80 excalidraw-app
```

With Apple's `container` CLI:

```bash
container build -t excalidraw-app:local .
container run --rm -d --name excalidraw-app -p 38767:80 excalidraw-app:local
```

Then open:

```text
http://127.0.0.1:38767/
```

The container only serves the app's static files. Local file access still happens in your browser through the File System Access API, so the container does not need access to your drawing folders.

Stop the container:

```bash
docker stop excalidraw-app
docker rm excalidraw-app
```

For Apple's `container` CLI:

```bash
container stop excalidraw-app
```

### Install As PWA

The app includes a web app manifest, service worker, and `.excalidraw` file handler declaration.

After serving the production build from a stable local or HTTPS URL, open that URL in Chrome, Edge, or Brave and install it as a PWA:

```text
Browser menu -> Install Excalidraw App
```

If your browser supports PWA file handling, you can then try:

```bash
open -a "Excalidraw App" /path/to/drawing.excalidraw
```

or set the installed PWA as the default opener in Finder:

```text
Finder -> select a .excalidraw file -> Cmd+I -> Open with -> Excalidraw App -> Change All
```

PWA file handling support varies by browser. Chrome and Edge are the most likely to work. Brave may require File System Access API support to be enabled and should be tested on your machine.

## How To Use

1. Open the app in a supported browser.
2. Click `打开目录`.
3. Choose a folder that contains `.excalidraw` files.
4. Click a file in the sidebar to load it into the canvas.
5. Edit the drawing.
6. Press `Cmd+S` / `Ctrl+S` or click `保存` to write back to the current file.

Shortcuts:

| Shortcut | Action |
| --- | --- |
| `Cmd+S` / `Ctrl+S` | Save the current drawing |
| `Cmd+B` / `Ctrl+B` | Toggle the sidebar and top bar |

## Current Limits

- It only sees files from a directory you explicitly choose.
- It cannot silently read or write arbitrary paths. That is a browser security boundary.
- Finder double-click support depends on installed PWA file handling support in your browser.
- There is no native companion server.
- Browser support depends on File System Access API availability.

## Why Not Just Use The Excalidraw Website?

The official Excalidraw website is excellent for manual open/export flows, but it does not expose a stable external API for a browser extension to load, read, and save the current scene as a local file.

This app owns the Excalidraw component directly, so it can use the official component API for loading and serializing drawings while relying on the browser's File System Access API for local file handles.

## Thanks

This project is built on top of the official Excalidraw project and its React package:

- https://github.com/excalidraw/excalidraw
- https://www.npmjs.com/package/@excalidraw/excalidraw

Thanks to the Excalidraw maintainers and contributors for building and maintaining a great drawing tool and making the embeddable package available.

## License

MIT. See [LICENSE](./LICENSE).
