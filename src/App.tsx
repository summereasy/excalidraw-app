import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
} from "@excalidraw/excalidraw/types";

import {
  createDrawingEntry,
  isFileSystemAccessSupported,
  listDrawingFiles,
  loadDirectoryHandle,
  persistDirectoryHandle,
  pickDrawingDirectory,
  queryDirectoryPermission,
  readFileText,
  requestDirectoryPermission,
  saveTextAsDrawing,
  writeFileText,
} from "./file-system";
import type { DrawingEntry } from "./file-system";
import {
  clearDraftScene,
  loadDraftScene,
  saveDraftScene,
} from "./scene-storage";
import type { DraftScene } from "./scene-storage";

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

  // 启动时从 IndexedDB 加载 draft scene 作为 initialData
  const [initialData, setInitialData] = useState<
    Promise<DraftScene | null> | null
  >(() => loadDraftScene());

  // 用 ref 跟踪 currentFile，避免 onChange 闭包里拿到旧值
  const currentFileRef = useRef<DrawingEntry | null>(null);

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

  // --- Draft scene 持久化 ---

  const persistDraft = useCallback(
    (
      elements: readonly unknown[],
      appState: AppState,
      files: BinaryFiles,
    ) => {
      const file = currentFileRef.current;
      void saveDraftScene({
        elements,
        appState,
        files,
        currentFileHandle: file?.handle ?? null,
        currentFileName: file?.name ?? null,
      });
    },
    [],
  );

  // onChange 防抖：避免每次微小变化都写 IndexedDB
  const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const schedulePersistDraft = useCallback(
    (
      elements: readonly unknown[],
      appState: AppState,
      files: BinaryFiles,
    ) => {
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
      }
      draftTimerRef.current = setTimeout(() => {
        persistDraft(elements, appState, files);
      }, 300);
    },
    [persistDraft],
  );

  // --- 目录操作 ---

  const refreshDirectory = useCallback(async () => {
    if (!directory) {
      return;
    }

    try {
      const nextFiles = await listDrawingFiles(directory);
      setFiles(nextFiles);
    } catch {
      // 权限不足时静默忽略，用户可通过重新授权按钮恢复
    }
  }, [directory]);

  const reauthorizeDirectory = useCallback(async () => {
    if (!directory) return;

    try {
      const perm = await requestDirectoryPermission(directory);
      if (perm === "granted") {
        await refreshDirectory();
      }
    } catch {
      // 用户拒绝或浏览器阻止
    }
  }, [directory, refreshDirectory]);

  const openDirectory = useCallback(async () => {
    setNotice(null);

    try {
      const result = await pickDrawingDirectory();
      setDirectory(result.directory);
      setFiles(result.files);
      void persistDirectoryHandle(result.directory);
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        setNotice({ kind: "error", message: "无法打开目录" });
      }
    }
  }, []);

  // --- 文件操作 ---

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

        currentFileRef.current = entry;
        setCurrentFile(entry);
        setDirty(false);
        setSaveState("idle");

        // 从文件加载后立即更新 draft
        persistDraft(
          api.getSceneElementsIncludingDeleted(),
          api.getAppState(),
          api.getFiles(),
        );
      } catch {
        setNotice({ kind: "error", message: `无法打开 ${entry.name}` });
      }
    },
    [api, persistDraft],
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

      // 保存后更新 draft（标记为干净状态）
      persistDraft(
        api.getSceneElementsIncludingDeleted(),
        api.getAppState(),
        api.getFiles(),
      );

      window.setTimeout(() => setSaveState("idle"), 1400);
    } catch {
      setSaveState("error");
      setNotice({ kind: "error", message: "保存失败，请检查文件写入权限" });
    }
  }, [api, currentFile, serializeCurrentScene, persistDraft]);

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

      currentFileRef.current = entry;
      setCurrentFile(entry);
      setFiles((prev) => {
        if (prev.some((file) => file.name === entry.name)) {
          return prev.map((file) => (file.name === entry.name ? entry : file));
        }
        return [...prev, entry];
      });
      setDirty(false);
      setSaveState("saved");

      // 另存为后更新 draft
      persistDraft(
        api.getSceneElementsIncludingDeleted(),
        api.getAppState(),
        api.getFiles(),
      );

      window.setTimeout(() => setSaveState("idle"), 1400);
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        setSaveState("error");
        setNotice({ kind: "error", message: "另存为失败" });
      } else {
        setSaveState("idle");
      }
    }
  }, [api, currentTitle, serializeCurrentScene, persistDraft]);

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

    currentFileRef.current = null;
    setCurrentFile(null);
    setDirty(false);
    setSaveState("idle");
    setNotice(null);

    // 新建画布时清除 draft
    void clearDraftScene();
  }, [api]);

  // --- 键盘快捷键 ---

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

  // --- 启动恢复 ---

  useEffect(() => {
    if (!supported) return;

    let cancelled = false;

    void (async () => {
      try {
        const handle = await loadDirectoryHandle();
        if (cancelled || !handle) return;

        setDirectory(handle);

        const dirFiles = await listDrawingFiles(handle);
        if (!cancelled) {
          setFiles(dirFiles);
        }
      } catch {
        // 权限不足或 handle 失效，静默忽略
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [supported]);

  // 从 draft 恢复 currentFile（Excalidraw 初始化完成后）
  useEffect(() => {
    if (!api) return;

    let cancelled = false;

    void (async () => {
      try {
        const draft = await loadDraftScene();
        if (cancelled || !draft) return;

        // 恢复 currentFile（如果 draft 里有 handle）
        if (draft.currentFileHandle) {
          const entry = await createDrawingEntry(draft.currentFileHandle);
          currentFileRef.current = entry;
          setCurrentFile(entry);
        }
      } catch {
        // handle 失效或权限不足，静默忽略
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api]);

  // --- Theme ---

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

        {directory && sortedFiles.length === 0 && (
          <div className="sidebar__actions">
            <button
              className="button button--primary"
              onClick={() => void reauthorizeDirectory()}
            >
              <FolderOpen size={16} />
              重新授权目录
            </button>
          </div>
        )}

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
            initialData={
              initialData
                ? initialData.then((draft) =>
                    draft
                      ? {
                          elements: draft.elements as any,
                          appState: draft.appState,
                          files: draft.files,
                        }
                      : null,
                  )
                : undefined
            }
            onChange={(elements, appState, files) => {
              if (api) {
                setDirty(true);
                schedulePersistDraft(elements, appState, files);
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
