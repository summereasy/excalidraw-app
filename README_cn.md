# Excalidraw App

**[English](./README.md)**

一个本地优先的 Excalidraw 编辑器,让 `.excalidraw` 文件的打开、浏览、保存像本地文件一样顺滑。

## 为什么需要这个项目

Excalidraw 官方网站是一个很棒的画图工具,但如果你日常维护大量 `.excalidraw` 文件,会发现文件操作有很多摩擦:

- 每次打开都要手动选择文件
- 保存需要手动导出下载
- 没有文件列表,无法快速切换
- 无法像本地 app 一样双击 `.excalidraw` 文件直接打开

Excalidraw App 直接内嵌了官方 `@excalidraw/excalidraw` 组件,并围绕它加了一层本地文件操作 shell,核心能力:

- 📂 打开本地目录,侧边栏浏览所有 `.excalidraw` 文件
- 💾 `Cmd+S` 直接保存回原文件
- 🎨 支持浅色/深色/跟随系统主题
- 🌐 英文 & 简体中文 UI(顶栏切换)
- 📱 可选: 安装为 PWA 后可以像原生 App 一样双击打开 `.excalidraw` 文件

## 安装与使用

### 推荐: Docker

最简单的使用方式。起一个本地服务，打开一个文件夹，侧边栏里就能看到所有的 `.excalidraw` 文件。

```bash
docker pull ghcr.io/summereasy/excalidraw-app:latest
docker run -d --name excalidraw-app -p 38767:80 ghcr.io/summereasy/excalidraw-app:latest
```

用 Apple Containers:

```bash
container run --rm -d --name excalidraw-app -p 38767:80 excalidraw-app:latest
```

然后打开 http://127.0.0.1:38767/ 。

> 容器只提供静态文件服务，文件读写仍然通过浏览器的 File System Access API 在本地完成，容器不需要访问你的文件。

停止服务:

```bash
docker stop excalidraw-app && docker rm excalidraw-app
# Apple Containers:
container stop excalidraw-app
```

### 可选: 安装 PWA (支持双击打开文件)

如果你经常需要从 Finder / 文件管理器中双击打开 `.excalidraw` 文件，可以安装 PWA，获得类似原生 App 的体验。

在 Chrome / Edge / Brave 中打开 http://127.0.0.1:38767/ ，然后:

1. 浏览器菜单 → **Install Excalidraw App**
2. 安装完成后，在 macOS 中将 `.excalidraw` 文件的默认打开方式指向安装的 App:
   - Finder 中右键一个 `.excalidraw` 文件 → 显示简介 → 打开方式 → 选择 Excalidraw App → 全部更改

配置完成后，双击任意 `.excalidraw` 文件就会直接在 PWA 中打开编辑。

### 开发环境运行

适合想修改代码或调试的场景。

依赖: Node.js 18+, pnpm

```bash
pnpm install
pnpm dev
```

浏览器打开打印出来的本地地址 (通常 http://127.0.0.1:5173/)。

构建生产版本:

```bash
pnpm build
pnpm preview   # 本地预览生产构建
```

### Docker 自行构建

适合想自己打镜像部署的场景。

```bash
pnpm build
container build -t excalidraw-app:latest .
# 或:
pnpm image:build
```

镜像只包含 `dist/` + nginx,不含 Node 构建环境。

### 部署

这是一个纯静态 SPA,构建产物在 `dist/` 目录。扔到任何静态文件服务器 (nginx, Caddy, Vercel, Netlify...) 即可。唯一要求是 HTTPS (PWA 和 File System Access API 需要),本地 `127.0.0.1` 是例外,不需要 HTTPS。

## 快捷键

| 快捷键 | 功能 |
| --- | --- |
| `Cmd+S` / `Ctrl+S` | 保存当前文件 |
| `Cmd+B` / `Ctrl+B` | 隐藏/显示侧边栏和顶栏 |

## 注意事项

### 浏览器要求

需要使用基于 Chromium 且支持 [File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access) 的浏览器。

已验证可用的浏览器:

- ✅ Chrome
- ✅ Edge
- ⚠️ Brave (需要手动开启,见下方)

### Brave 需要手动开启 File System Access API

Brave 默认禁用了 File System Access API,不开启的话无法使用本应用。

1. 地址栏输入 `brave://flags/#file-system-access-api`
2. 将 **File System Access API** 设为 **Enabled**
3. 重启 Brave

### 其他限制

- 只能访问你主动选择的目录,无法静默读写任意路径 (浏览器安全边界)
- PWA 文件双击打开的支持依赖浏览器的 file handler 能力,Chrome 和 Edge 支持最好
- 没有后端服务器,所有文件操作都在浏览器本地完成

## 致谢

基于官方 Excalidraw 项目构建:

- https://github.com/excalidraw/excalidraw
- https://www.npmjs.com/package/@excalidraw/excalidraw

感谢 Excalidraw 团队维护这个优秀的绘图工具并提供可嵌入的 React 组件。

## License

MIT. See [LICENSE](./LICENSE).
