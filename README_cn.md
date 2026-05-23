# Excalidraw App

**[English](./README.md)**

一个本地优先的 Excalidraw 编辑器,让 `.excalidraw` 文件的打开、浏览、保存像本地文件一样顺滑。

## 为什么需要这个项目

Excalidraw 官方网站是一个很棒的画图工具,但如果你日常维护大量 `.excalidraw` 文件,会发现文件操作有很多摩擦:

- 每次打开都要手动选择文件
- 保存需要手动导出下载
- 没有文件列表,无法快速切换

Excalidraw App 直接内嵌了官方 `@excalidraw/excalidraw` 组件,并围绕它加了一层本地文件操作 shell,核心能力:

- 📂 打开本地目录,侧边栏浏览所有 `.excalidraw` 文件
- 💾 `Cmd+S` 直接保存回原文件
- 🎨 支持浅色/深色/跟随系统主题
- 🌐 英文 & 简体中文 UI(顶栏切换)

## 安装与使用

### 推荐: 本机 Caddy

这是一个纯静态的浏览器 app。推荐路径是先构建一次,再用本机静态文件服务提供 `dist/`。Caddy 是一个简单选择:

```bash
bun install
bun run build
```

示例 `Caddyfile`:

```caddyfile
http://127.0.0.1:7072 {
	root * ./dist
	file_server

	@appShell path / /index.html
	header @appShell Cache-Control "no-cache"
}
```

在项目根目录运行 Caddy:

```bash
caddy run --config Caddyfile
```

然后打开 http://127.0.0.1:7072/ 。

> Caddy 只负责提供 `dist/` 静态文件。文件读写仍然通过浏览器的 File System Access API 在本地完成，Caddy 不访问你的绘图文件。

### 开发环境运行

适合想修改代码或调试的场景。

依赖: Node.js 18+，并已安装项目依赖。

```bash
bun run dev
```

浏览器打开打印出来的本地地址 (通常 http://127.0.0.1:5173/)。

构建生产版本:

```bash
bun run build
bun run preview   # 本地预览生产构建
```

### 部署模型

这是一个纯静态 SPA，构建产物在 `dist/` 目录。可以用任何静态文件服务器提供这个目录,比如 Caddy、nginx、Apache,或者托管静态站点服务。

File System Access API 通常要求 HTTPS,但本地 `127.0.0.1` 和 `localhost` 是 secure context 例外,不需要 HTTPS。

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
- 没有后端服务器,所有文件操作都在浏览器本地完成

## 致谢

基于官方 Excalidraw 项目构建:

- https://github.com/excalidraw/excalidraw
- https://www.npmjs.com/package/@excalidraw/excalidraw

感谢 Excalidraw 团队维护这个优秀的绘图工具并提供可嵌入的 React 组件。

## License

MIT. See [LICENSE](./LICENSE).
