import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  Check,
  FilePlus2,
  FolderOpen,
  RefreshCw,
  Save,
} from "lucide-react";
import {
  CaptureUpdateAction,
  Excalidraw,
  loadFromBlob,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import type {
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

import {
  createDrawingEntry,
  isFileSystemAccessSupported,
  listDrawingFiles,
  pickDrawingDirectory,
  readFileText,
  saveTextAsDrawing,
  writeFileText,
} from "./file-system";
import type { DrawingEntry } from "./file-system";

type SaveState = "idle" | "saving" | "saved" | "error";
type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

type Notice = {
  kind: "info" | "error";
  message: string;
};

const EMPTY_FILE_NAME = "untitled.excalidraw";
const THEME_STORAGE_KEY = "excalidraw-app.theme";

export default function App() {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [directory, setDirectory] = useState<FileSystemDirectoryHandle | null>(
    null,
  );
  const [files, setFiles] = useState<DrawingEntry[]>([]);
  const [currentFile, setCurrentFile] = useState<DrawingEntry | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [dirty, setDirty] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredTheme());
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    getSystemTheme(),
  );
  const [chromeHidden, setChromeHidden] = useState(false);

  const supported = isFileSystemAccessSupported();
  const resolvedTheme = themeMode === "system" ? systemTheme : themeMode;

  const currentTitle = currentFile?.name ?? EMPTY_FILE_NAME;

  const sortedFiles = useMemo(
    () => [...files].sort((a, b) => a.name.localeCompare(b.name)),
    [files],
  );

  const serializeCurrentScene = useCallback(() => {
    if (!api) {
      throw new Error("Excalidraw 还没有初始化完成");
    }

    return serializeAsJSON(
      api.getSceneElementsIncludingDeleted(),
      api.getAppState(),
      api.getFiles(),
      "local",
    );
  }, [api]);

  const refreshDirectory = useCallback(async () => {
    if (!directory) {
      return;
    }

    const nextFiles = await listDrawingFiles(directory);
    setFiles(nextFiles);
  }, [directory]);

  const openDirectory = useCallback(async () => {
    setNotice(null);

    try {
      const result = await pickDrawingDirectory();
      setDirectory(result.directory);
      setFiles(result.files);
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        setNotice({ kind: "error", message: "无法打开目录" });
      }
    }
  }, []);

  const loadDrawing = useCallback(
    async (entry: DrawingEntry) => {
      if (!api) {
        return;
      }

      setNotice(null);

      try {
        const text = await readFileText(entry.handle);
        const blob = new Blob([text], {
          type: "application/vnd.excalidraw+json",
        });
        const scene = await loadFromBlob(
          blob,
          api.getAppState(),
          api.getSceneElementsIncludingDeleted(),
          entry.handle,
        );

        if (scene.files) {
          api.addFiles(Object.values(scene.files) as BinaryFiles[string][]);
        }

        api.updateScene({
          elements: scene.elements ?? [],
          appState: {
            ...scene.appState,
            name: entry.name.replace(/\.excalidraw$/, ""),
          },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        api.history.clear();

        setCurrentFile(entry);
        setDirty(false);
        setSaveState("idle");
      } catch {
        setNotice({ kind: "error", message: `无法打开 ${entry.name}` });
      }
    },
    [api],
  );

  useEffect(() => {
    if (!api || !("launchQueue" in window)) {
      return;
    }

    window.launchQueue.setConsumer((launchParams) => {
      const [handle] = launchParams.files ?? [];
      if (!handle || handle.kind !== "file") {
        return;
      }

      void createDrawingEntry(handle)
        .then((entry) => {
          setFiles((prev) => {
            if (prev.some((file) => file.name === entry.name)) {
              return prev.map((file) => (file.name === entry.name ? entry : file));
            }
            return [entry, ...prev];
          });
          return loadDrawing(entry);
        })
        .catch(() => {
          setNotice({ kind: "error", message: "无法打开系统传入的文件" });
        });
    });
  }, [api, loadDrawing]);

  const saveCurrentFile = useCallback(async () => {
    if (!api || !currentFile) {
      return;
    }

    setSaveState("saving");
    setNotice(null);

    try {
      await writeFileText(currentFile.handle, serializeCurrentScene());
      setDirty(false);
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1400);
    } catch {
      setSaveState("error");
      setNotice({ kind: "error", message: "保存失败，请检查文件写入权限" });
    }
  }, [api, currentFile, serializeCurrentScene]);

  const saveAs = useCallback(async () => {
    if (!api) {
      return;
    }

    setSaveState("saving");
    setNotice(null);

    try {
      const handle = await saveTextAsDrawing(currentTitle, serializeCurrentScene());
      const entry: DrawingEntry = {
        name: handle.name,
        handle,
        lastModified: (await handle.getFile()).lastModified,
      };

      setCurrentFile(entry);
      setFiles((prev) => {
        if (prev.some((file) => file.name === entry.name)) {
          return prev.map((file) => (file.name === entry.name ? entry : file));
        }
        return [...prev, entry];
      });
      setDirty(false);
      setSaveState("saved");
      window.setTimeout(() => setSaveState("idle"), 1400);
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        setSaveState("error");
        setNotice({ kind: "error", message: "另存为失败" });
      } else {
        setSaveState("idle");
      }
    }
  }, [api, currentTitle, serializeCurrentScene]);

  const newDrawing = useCallback(() => {
    if (!api) {
      return;
    }

    api.resetScene();
    api.updateScene({
      appState: { name: "untitled" },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    api.history.clear();

    setCurrentFile(null);
    setDirty(false);
    setSaveState("idle");
    setNotice(null);
  }, [api]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) {
        return;
      }

      const key = event.key.toLowerCase();

      if (key === "s") {
        event.preventDefault();

        if (currentFile) {
          void saveCurrentFile();
        } else {
          void saveAs();
        }
        return;
      }

      if (key === "b") {
        event.preventDefault();
        setChromeHidden((hidden) => !hidden);
      }
    };

    window.addEventListener("keydown", handleKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [currentFile, saveAs, saveCurrentFile]);

  useEffect(() => {
    localStorage.setItem(THEME_STORAGE_KEY, themeMode);
  }, [themeMode]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => {
      setSystemTheme(query.matches ? "dark" : "light");
    };

    handleChange();
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  return (
    <div
      className={chromeHidden ? "workspace workspace--chrome-hidden" : "workspace"}
      data-theme={resolvedTheme}
    >
      <aside className="sidebar">
        <header className="sidebar__header">
          <div>
            <h1>Excalidraw App</h1>
            <p>{directory?.name ?? "未选择目录"}</p>
          </div>
        </header>

        <div className="sidebar__actions">
          <button
            className="button button--primary"
            onClick={openDirectory}
            disabled={!supported}
          >
            <FolderOpen size={16} />
            打开目录
          </button>
          <button
            className="button button--icon"
            title="刷新"
            onClick={() => void refreshDirectory()}
            disabled={!directory}
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {!supported && (
          <div className="notice notice--error">
            <AlertCircle size={16} />
            当前浏览器不支持 File System Access API，请使用 Chrome 或 Edge。
          </div>
        )}

        <div className="file-list">
          {sortedFiles.length === 0 ? (
            <div className="empty-state">目录内没有 .excalidraw 文件</div>
          ) : (
            sortedFiles.map((file) => (
              <button
                key={file.name}
                className={
                  file.name === currentFile?.name
                    ? "file-list__item file-list__item--active"
                    : "file-list__item"
                }
                onClick={() => void loadDrawing(file)}
              >
                <span>{file.name}</span>
                {file.lastModified && (
                  <time>{new Date(file.lastModified).toLocaleDateString()}</time>
                )}
              </button>
            ))
          )}
        </div>
      </aside>

      <main className="editor-shell">
        <div className="topbar">
          <div className="topbar__title">
            <strong>{currentTitle}</strong>
            <span>{dirty ? "有未保存修改" : "已同步"}</span>
          </div>

          <div className="topbar__actions">
            {notice && (
              <div className={`notice notice--${notice.kind}`}>
                {notice.kind === "error" ? (
                  <AlertCircle size={15} />
                ) : (
                  <Check size={15} />
                )}
                {notice.message}
              </div>
            )}

            <div className="theme-toggle" aria-label="主题切换">
              <button
                className={themeMode === "light" ? "active" : ""}
                onClick={() => setThemeMode("light")}
                type="button"
              >
                浅色
              </button>
              <button
                className={themeMode === "dark" ? "active" : ""}
                onClick={() => setThemeMode("dark")}
                type="button"
              >
                深色
              </button>
              <button
                className={themeMode === "system" ? "active" : ""}
                onClick={() => setThemeMode("system")}
                type="button"
              >
                系统
              </button>
            </div>

            <button className="button" onClick={newDrawing} disabled={!api}>
              <FilePlus2 size={16} />
              新建
            </button>
            <button className="button" onClick={() => void saveAs()} disabled={!api}>
              另存为
            </button>
            <button
              className="button button--primary"
              onClick={() => void saveCurrentFile()}
              disabled={!api || !currentFile || saveState === "saving"}
            >
              {saveState === "saved" ? <Check size={16} /> : <Save size={16} />}
              {saveState === "saving"
                ? "保存中"
                : saveState === "saved"
                  ? "已保存"
                  : "保存"}
            </button>
          </div>
        </div>

        <section className="canvas-wrap">
          <Excalidraw
            excalidrawAPI={setApi}
            onChange={() => {
              if (api) {
                setDirty(true);
              }
            }}
            name={currentTitle.replace(/\.excalidraw$/, "")}
            theme={resolvedTheme}
            UIOptions={{
              canvasActions: {
                loadScene: false,
                saveToActiveFile: false,
                export: { saveFileToDisk: true },
              },
            }}
          />
        </section>
      </main>
    </div>
  );
}

function getStoredTheme(): ThemeMode {
  const value = localStorage.getItem(THEME_STORAGE_KEY);
  if (value === "light" || value === "dark" || value === "system") {
    return value;
  }
  return "system";
}

function getSystemTheme(): ResolvedTheme {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}
