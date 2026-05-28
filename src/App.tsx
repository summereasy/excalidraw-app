import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronRight,
  FilePlus2,
  FolderOpen,
  Pencil,
  RefreshCw,
} from "lucide-react";
import {
  CaptureUpdateAction,
  Excalidraw,
  loadFromBlob,
  serializeAsJSON,
  useHandleLibrary,
} from "@excalidraw/excalidraw";
import type {
  AppState,
  BinaryFiles,
  ExcalidrawImperativeAPI,
  LibraryItems,
} from "@excalidraw/excalidraw/types";

import {
  createDrawingEntry,
  getDrawingDisplayName,
  isFileSystemAccessSupported,
  listDrawingFiles,
  loadDirectoryHandle,
  MoveFileError,
  moveFileToDirectory,
  getParentDirectoryPath,
  persistDirectoryHandle,
  pickDrawingDirectory,
  queryDirectoryPermission,
  readFileText,
  renameFileInDirectory,
  requestDirectoryPermission,
  resolveParentDir,
  saveTextAsDrawing,
  writeFileText,
} from "./file-system";
import type { DrawingEntry } from "./file-system";

type FileTreeNode =
  | { kind: "directory"; name: string; path: string; children: FileTreeNode[] }
  | { kind: "file"; entry: DrawingEntry };

function buildFileTree(files: DrawingEntry[]): FileTreeNode[] {
  const root: FileTreeNode[] = [];

  for (const entry of files) {
    const parts = entry.relativePath.split("/");
    let current = root;
    let pathAcc = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;

      if (isFile) {
        current.push({ kind: "file", entry });
      } else {
        pathAcc = pathAcc ? `${pathAcc}/${part}` : part;
        let dir = current.find(
          (n) => n.kind === "directory" && n.name === part,
        ) as Extract<FileTreeNode, { kind: "directory" }> | undefined;
        if (!dir) {
          dir = { kind: "directory", name: part, path: pathAcc, children: [] };
          current.push(dir);
        }
        current = dir.children;
      }
    }
  }

  // 排序：目录在前，文件在后，各自按名称字母序
  const sortNodes = (nodes: FileTreeNode[]): FileTreeNode[] => {
    return nodes.sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
      const na = a.kind === "directory" ? a.name : a.entry.name;
      const nb = b.kind === "directory" ? b.name : b.entry.name;
      return na.localeCompare(nb);
    }).map((node) => {
      if (node.kind === "directory") {
        return { ...node, children: sortNodes(node.children) };
      }
      return node;
    });
  };

  return sortNodes(root);
}
import {
  clearDraftScene,
  loadDraftScene,
  saveDraftScene,
} from "./scene-storage";
import type { DraftScene } from "./scene-storage";
import { loadPersistedLibrary, saveLibrary } from "./library-storage";
import { type AppLang, getStoredLang, persistLang, t } from "./i18n";

type InitialExcalidrawData = {
  elements?: DraftScene["elements"];
  appState?: DraftScene["appState"];
  files?: DraftScene["files"];
  libraryItems?: LibraryItems;
};

type SaveState = "idle" | "saving" | "saved" | "error";
type ThemeMode = "light" | "dark" | "system";
type ResolvedTheme = "light" | "dark";

type Notice = {
  kind: "info" | "error";
  message: string;
};

const EMPTY_FILE_NAME = "untitled.excalidraw";
const THEME_STORAGE_KEY = "excalidraw-app.theme";
const EXPANDED_DIRS_STORAGE_KEY = "excalidraw-app.expandedDirs";
const ROOT_DIRECTORY_PATH = "";
/** 供 libraries.excalidraw.com 安装素材库后跳回当前标签页 */
const LIBRARY_WINDOW_NAME = "excalidraw-app";

function getStoredExpandedDirs(): Set<string> {
  try {
    const value = localStorage.getItem(EXPANDED_DIRS_STORAGE_KEY);
    const paths = value ? (JSON.parse(value) as unknown) : [];
    return new Set(Array.isArray(paths) ? paths.filter((p) => typeof p === "string") : []);
  } catch {
    return new Set();
  }
}

function persistExpandedDirs(paths: Set<string>): void {
  localStorage.setItem(
    EXPANDED_DIRS_STORAGE_KEY,
    JSON.stringify(Array.from(paths).sort()),
  );
}

function getAncestorDirectoryPaths(relativePath: string): string[] {
  const parts = relativePath.split("/");
  parts.pop();

  const paths: string[] = [];
  let path = "";
  for (const part of parts) {
    path = path ? `${path}/${part}` : part;
    paths.push(path);
  }
  return paths;
}

function isInsideSubfolder(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest(".file-tree__dir") !== null;
}

export default function App() {
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);
  const [directory, setDirectory] = useState<FileSystemDirectoryHandle | null>(
    null,
  );
  const [files, setFiles] = useState<DrawingEntry[]>([]);
  const [currentFile, setCurrentFile] = useState<DrawingEntry | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => getStoredTheme());
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    getSystemTheme(),
  );
  const [chromeHidden, setChromeHidden] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [lang, setLang] = useState<AppLang>(() => getStoredLang());

  // 启动时从 IndexedDB 加载 draft scene 与素材库作为 initialData
  const [initialData] = useState<Promise<InitialExcalidrawData | null>>(() =>
    Promise.all([loadDraftScene(), loadPersistedLibrary()]).then(
      ([draft, libraryItems]) => {
        if (!draft && !libraryItems) {
          return null;
        }
        return {
          ...(draft
            ? {
                elements: draft.elements,
                appState: draft.appState,
                files: draft.files,
              }
            : {}),
          ...(libraryItems ? { libraryItems } : {}),
        };
      },
    ),
  );

  // 用 ref 跟踪 currentFile，避免 onChange 闭包里拿到旧值
  const currentFileRef = useRef<DrawingEntry | null>(null);
  const cleanSceneJSONRef = useRef<string | null>(null);
  const latestSceneJSONRef = useRef<string | null>(null);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const librarySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingAutosaveRef = useRef<{
    snapshot: string;
    file: DrawingEntry;
  } | null>(null);

  const supported = isFileSystemAccessSupported();
  const resolvedTheme = themeMode === "system" ? systemTheme : themeMode;
  const libraryReturnUrl = useMemo(
    () => `${window.location.origin}${window.location.pathname}`,
    [],
  );

  useEffect(() => {
    if (!window.name) {
      window.name = LIBRARY_WINDOW_NAME;
    }
  }, []);

  useHandleLibrary({ excalidrawAPI: api });

  const currentTitle = currentFile?.name ?? EMPTY_FILE_NAME;
  const saveStatusText = !currentFile
    ? t(lang, "status.draft")
    : saveState === "saving"
      ? t(lang, "file.saving")
      : saveState === "error"
        ? t(lang, "status.saveFailed")
        : t(lang, "file.saved");

  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(() =>
    getStoredExpandedDirs(),
  );
  const [draggingFilePath, setDraggingFilePath] = useState<string | null>(null);
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);

  const fileTree = useMemo(() => buildFileTree(files), [files]);

  const toggleDir = useCallback((path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  const serializeCurrentScene = useCallback(() => {
    if (!api) {
      throw new Error("Excalidraw has not been initialized yet");
    }

    return serializeAsJSON(
      api.getSceneElementsIncludingDeleted(),
      api.getAppState(),
      api.getFiles(),
      "local",
    );
  }, [api]);

  const markCleanSnapshot = useCallback((snapshot: string) => {
    cleanSceneJSONRef.current = snapshot;
    latestSceneJSONRef.current = snapshot;
  }, []);

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
          currentFileRelativePath: file?.relativePath ?? null,
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

  const saveSceneSnapshot = useCallback(
    async (snapshot: string, file = currentFileRef.current) => {
      if (!file) {
        return;
      }

      setSaveState("saving");
      setNotice(null);

      try {
        await writeFileText(file.handle, snapshot);

        if (
          currentFileRef.current?.relativePath === file.relativePath &&
          latestSceneJSONRef.current === snapshot
        ) {
          markCleanSnapshot(snapshot);
          setSaveState("saved");
          window.setTimeout(() => setSaveState("idle"), 1400);
        }
      } catch {
        setSaveState("error");
        setNotice({ kind: "error", message: t(lang, "error.saveFail") });
      }
    },
    [lang, markCleanSnapshot],
  );

  const scheduleAutosave = useCallback(
    (snapshot: string) => {
      const file = currentFileRef.current;
      if (!file) {
        return;
      }

      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }

      pendingAutosaveRef.current = { snapshot, file };
      setSaveState("saving");
      autosaveTimerRef.current = setTimeout(() => {
        if (
          pendingAutosaveRef.current?.snapshot === snapshot &&
          pendingAutosaveRef.current.file.relativePath === file.relativePath
        ) {
          pendingAutosaveRef.current = null;
        }
        void saveSceneSnapshot(snapshot, file);
      }, 800);
    },
    [saveSceneSnapshot],
  );

  const flushPendingAutosave = useCallback(async () => {
    const pending = pendingAutosaveRef.current;
    if (!pending) {
      return;
    }

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    pendingAutosaveRef.current = null;

    await saveSceneSnapshot(pending.snapshot, pending.file);
  }, [saveSceneSnapshot]);

  const schedulePersistLibrary = useCallback((libraryItems: LibraryItems) => {
    if (librarySaveTimerRef.current) {
      clearTimeout(librarySaveTimerRef.current);
    }
    librarySaveTimerRef.current = setTimeout(() => {
      void saveLibrary(libraryItems);
    }, 300);
  }, []);

  useEffect(() => {
    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
      if (draftTimerRef.current) {
        clearTimeout(draftTimerRef.current);
      }
      if (librarySaveTimerRef.current) {
        clearTimeout(librarySaveTimerRef.current);
      }
    };
  }, []);

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
      const result = await pickDrawingDirectory(directory ?? undefined);
      setDirectory(result.directory);
      setFiles(result.files);
      void persistDirectoryHandle(result.directory);
    } catch (error) {
      if ((error as DOMException).name !== "AbortError") {
        setNotice({ kind: "error", message: t(lang, "error.openDir") });
      }
    }
  }, [directory, lang]);

  // --- 文件操作 ---

  const loadDrawing = useCallback(
    async (entry: DrawingEntry) => {
      if (!api) {
        return;
      }

      setNotice(null);

      try {
        await flushPendingAutosave();

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
        setExpandedDirs((prev) => {
          const next = new Set(prev);
          for (const path of getAncestorDirectoryPaths(entry.relativePath)) {
            next.add(path);
          }
          return next;
        });
        markCleanSnapshot(serializeCurrentScene());
        setSaveState("idle");

        // 从文件加载后立即更新 draft
        persistDraft(
          api.getSceneElementsIncludingDeleted(),
          api.getAppState(),
          api.getFiles(),
        );
      } catch {
        setNotice({ kind: "error", message: t(lang, "error.openFile", { name: entry.name }) });
      }
    },
    [api, flushPendingAutosave, markCleanSnapshot, persistDraft, serializeCurrentScene],
  );

  const saveCurrentFile = useCallback(async () => {
    if (!api || !currentFile) {
      return;
    }

    const snapshot = serializeCurrentScene();
    latestSceneJSONRef.current = snapshot;
    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
      autosaveTimerRef.current = null;
    }
    pendingAutosaveRef.current = null;
    await saveSceneSnapshot(snapshot);

    persistDraft(
      api.getSceneElementsIncludingDeleted(),
      api.getAppState(),
      api.getFiles(),
    );
  }, [api, currentFile, saveSceneSnapshot, serializeCurrentScene, persistDraft]);

  const saveAs = useCallback(async () => {
    if (!api) {
      return;
    }

    setSaveState("saving");
    setNotice(null);

    try {
      const snapshot = serializeCurrentScene();
      let startIn: FileSystemDirectoryHandle | undefined;
      if (directory) {
        const perm = await requestDirectoryPermission(directory);
        if (perm === "granted") {
          startIn = directory;
        }
      }
      const handle = await saveTextAsDrawing(currentTitle, snapshot, { startIn });
      const entry: DrawingEntry = {
        name: handle.name,
        relativePath: handle.name,
        handle,
        directoryHandle: directory ?? ({} as unknown as FileSystemDirectoryHandle),
        lastModified: (await handle.getFile()).lastModified,
      };

      currentFileRef.current = entry;
      setCurrentFile(entry);
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        for (const path of getAncestorDirectoryPaths(entry.relativePath)) {
          next.add(path);
        }
        return next;
      });
      setFiles((prev) => {
        if (prev.some((file) => file.relativePath === entry.relativePath)) {
          return prev.map((file) =>
            file.relativePath === entry.relativePath ? entry : file,
          );
        }
        return [...prev, entry];
      });
      markCleanSnapshot(snapshot);
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
        setNotice({ kind: "error", message: t(lang, "error.saveAsFail") });
      } else {
        setSaveState("idle");
      }
    }
  }, [
    api,
    currentTitle,
    directory,
    lang,
    markCleanSnapshot,
    serializeCurrentScene,
    persistDraft,
  ]);

  const newDrawing = useCallback(async () => {
    if (!api) {
      return;
    }

    await flushPendingAutosave();

    api.resetScene();
    api.updateScene({
      appState: { name: "untitled" },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    api.history.clear();

    currentFileRef.current = null;
    setCurrentFile(null);
    markCleanSnapshot(serializeCurrentScene());
    setSaveState("idle");
    setNotice(null);

    // 新建画布时清除 draft
    void clearDraftScene();
  }, [api, flushPendingAutosave, markCleanSnapshot, serializeCurrentScene]);

  // --- 重命名 ---

  const startRename = useCallback(() => {
    if (!currentFile) return;
    // 去掉 .excalidraw 后缀作为编辑初始值
    setRenameValue(currentFile.name.replace(/\.excalidraw$/, ""));
    setRenaming(true);
  }, [currentFile]);

  const commitRename = useCallback(async () => {
    setRenaming(false);

    if (!api || !currentFile || !directory) return;

    const newName = renameValue.trim();
    if (!newName || `${newName}.excalidraw` === currentFile.name) return;

    try {
      // 从根目录逐级获取父目录 handle，确保有 readwrite 权限
      const parentDir = await resolveParentDir(directory, currentFile.relativePath);
      const newHandle = await renameFileInDirectory(
        parentDir,
        currentFile.handle,
        newName,
      );

      // 计算新的 relativePath
      const pathParts = currentFile.relativePath.split("/");
      pathParts[pathParts.length - 1] = newHandle.name;
      const newRelativePath = pathParts.join("/");

      const entry = await createDrawingEntry(newHandle, newRelativePath, parentDir);

      currentFileRef.current = entry;
      setCurrentFile(entry);
      setExpandedDirs((prev) => {
        const next = new Set(prev);
        for (const path of getAncestorDirectoryPaths(entry.relativePath)) {
          next.add(path);
        }
        return next;
      });

      // 刷新文件列表
      if (directory) {
        const nextFiles = await listDrawingFiles(directory);
        setFiles(nextFiles);
      }

      // 更新 draft
      persistDraft(
        api.getSceneElementsIncludingDeleted(),
        api.getAppState(),
        api.getFiles(),
      );
    } catch {
      setNotice({ kind: "error", message: t(lang, "error.renameFail") });
    }
  }, [api, currentFile, directory, renameValue, persistDraft]);

  const canDropFileOnFolder = useCallback(
    (fileRelativePath: string, folderPath: string) => {
      return getParentDirectoryPath(fileRelativePath) !== folderPath;
    },
    [],
  );

  const moveFileToFolder = useCallback(
    async (entry: DrawingEntry, targetDirectoryPath: string) => {
      if (!directory) {
        return;
      }

      if (!canDropFileOnFolder(entry.relativePath, targetDirectoryPath)) {
        return;
      }

      try {
        const moved = await moveFileToDirectory(
          directory,
          entry,
          targetDirectoryPath,
        );

        setFiles((prev) =>
          prev.map((file) =>
            file.relativePath === entry.relativePath ? moved : file,
          ),
        );

        if (currentFileRef.current?.relativePath === entry.relativePath) {
          currentFileRef.current = moved;
          setCurrentFile(moved);
          if (api) {
            persistDraft(
              api.getSceneElementsIncludingDeleted(),
              api.getAppState(),
              api.getFiles(),
            );
          }
        }

        setExpandedDirs((prev) => {
          const next = new Set(prev);
          if (targetDirectoryPath) {
            for (const path of getAncestorDirectoryPaths(targetDirectoryPath)) {
              next.add(path);
            }
            next.add(targetDirectoryPath);
          }
          return next;
        });
      } catch (error) {
        if (error instanceof MoveFileError) {
          if (error.code === "same-folder") {
            return;
          }
          if (error.code === "file-exists") {
            setNotice({
              kind: "error",
              message: t(lang, "error.moveExists"),
            });
            return;
          }
        }
        setNotice({ kind: "error", message: t(lang, "error.moveFail") });
      }
    },
    [api, canDropFileOnFolder, directory, lang, persistDraft],
  );

  const clearFileDragState = useCallback(() => {
    setDraggingFilePath(null);
    setDropTargetPath(null);
  }, []);

  const handleFileDragStart = useCallback(
    (entry: DrawingEntry, event: React.DragEvent<HTMLButtonElement>) => {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", entry.relativePath);
      setDraggingFilePath(entry.relativePath);
      setDropTargetPath(null);
    },
    [],
  );

  const handleDirectoryDragOver = useCallback(
    (directoryPath: string, event: React.DragEvent<HTMLElement>) => {
      if (!draggingFilePath) {
        return;
      }

      event.stopPropagation();

      if (canDropFileOnFolder(draggingFilePath, directoryPath)) {
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        setDropTargetPath(directoryPath);
        return;
      }

      setDropTargetPath((current) =>
        current === ROOT_DIRECTORY_PATH ? null : current,
      );
    },
    [canDropFileOnFolder, draggingFilePath],
  );

  const handleDirectoryDrop = useCallback(
    (directoryPath: string, event: React.DragEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();

      const filePath =
        draggingFilePath ?? event.dataTransfer.getData("text/plain");
      clearFileDragState();

      if (!filePath || !canDropFileOnFolder(filePath, directoryPath)) {
        return;
      }

      const entry = files.find((file) => file.relativePath === filePath);
      if (!entry) {
        return;
      }

      void moveFileToFolder(entry, directoryPath);
    },
    [
      canDropFileOnFolder,
      clearFileDragState,
      draggingFilePath,
      files,
      moveFileToFolder,
    ],
  );

  const handleRootZoneDragOver = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (
        !draggingFilePath ||
        !canDropFileOnFolder(draggingFilePath, ROOT_DIRECTORY_PATH) ||
        isInsideSubfolder(event.target)
      ) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "move";
      setDropTargetPath(ROOT_DIRECTORY_PATH);
    },
    [canDropFileOnFolder, draggingFilePath],
  );

  const handleRootZoneDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (isInsideSubfolder(event.target)) {
        return;
      }

      void handleDirectoryDrop(ROOT_DIRECTORY_PATH, event);
    },
    [handleDirectoryDrop],
  );

  const handleRootZoneDragLeave = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node)) {
        setDropTargetPath((current) =>
          current === ROOT_DIRECTORY_PATH ? null : current,
        );
      }
    },
    [],
  );

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
        const restoredPath = draft.currentFileRelativePath ?? draft.currentFileName;
        if (!restoredPath) return;
        if (currentFileRef.current?.relativePath === restoredPath) return;

        const entry = files.find((file) => file.relativePath === restoredPath);
        if (entry) {
          currentFileRef.current = entry;
          setCurrentFile(entry);
          setExpandedDirs((prev) => {
            const next = new Set(prev);
            for (const path of getAncestorDirectoryPaths(entry.relativePath)) {
              next.add(path);
            }
            return next;
          });
          markCleanSnapshot(serializeCurrentScene());
        } else if (draft.currentFileHandle) {
          const fallback = await createDrawingEntry(
            draft.currentFileHandle,
            restoredPath,
            ({} as unknown as FileSystemDirectoryHandle),
          );
          currentFileRef.current = fallback;
          setCurrentFile(fallback);
        }
      } catch {
        // handle 失效或权限不足，静默忽略
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [api, files, markCleanSnapshot, serializeCurrentScene]);

  // --- Lang ---

  useEffect(() => {
    persistLang(lang);
  }, [lang]);

  useEffect(() => {
    persistExpandedDirs(expandedDirs);
  }, [expandedDirs]);

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

  // --- 树形节点渲染 ---

  const renderTreeNode = (node: FileTreeNode): React.ReactNode => {
    if (node.kind === "directory") {
      const isOpen = expandedDirs.has(node.path);
      const isDropTarget =
        dropTargetPath === node.path &&
        draggingFilePath !== null &&
        canDropFileOnFolder(draggingFilePath, node.path);
      return (
        <li
          key={node.path}
          className={
            isDropTarget
              ? "file-tree__dir file-tree__dir--drop-target"
              : "file-tree__dir"
          }
          onDragOver={(event) => handleDirectoryDragOver(node.path, event)}
          onDragEnter={(event) => handleDirectoryDragOver(node.path, event)}
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node)) {
              setDropTargetPath((current) =>
                current === node.path ? null : current,
              );
            }
          }}
          onDrop={(event) => handleDirectoryDrop(node.path, event)}
        >
          <button
            className="file-tree__dir-toggle"
            onClick={() => toggleDir(node.path)}
          >
            <ChevronRight
              size={14}
              className={isOpen ? "file-tree__caret file-tree__caret--open" : "file-tree__caret"}
            />
            <span className="file-tree__dir-name">{node.name}</span>
          </button>
          {isOpen && node.children.length > 0 && (
            <ul className="file-tree__list">
              {node.children.map((child) => renderTreeNode(child))}
            </ul>
          )}
        </li>
      );
    }

    const isActive = node.entry.relativePath === currentFile?.relativePath;
    const isDragging = draggingFilePath === node.entry.relativePath;
    const itemClassName = [
      "file-tree__item",
      isActive && "file-tree__item--active",
      isDragging && "file-tree__item--dragging",
    ]
      .filter(Boolean)
      .join(" ");
    return (
      <li key={node.entry.relativePath}>
        <button
          className={itemClassName}
          draggable
          onDragStart={(event) => handleFileDragStart(node.entry, event)}
          onDragEnd={clearFileDragState}
          onClick={() => void loadDrawing(node.entry)}
        >
          <svg className="file-tree__icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
          <span className="file-tree__item-name">
            {getDrawingDisplayName(node.entry.name)}
          </span>
        </button>
      </li>
    );
  };

  const isRootDropTarget =
    dropTargetPath === ROOT_DIRECTORY_PATH &&
    draggingFilePath !== null &&
    canDropFileOnFolder(draggingFilePath, ROOT_DIRECTORY_PATH);

  return (
    <div
      className={chromeHidden ? "workspace workspace--chrome-hidden" : "workspace"}
      data-theme={resolvedTheme}
    >
      <aside className="sidebar">
        <header className="sidebar__header">
          <div>
            <h1>{t(lang, "app.title")}<small className="sidebar__hint">{t(lang, "app.hint")}</small></h1>
          </div>
        </header>

        {!directory ? (
          <div className="sidebar__actions">
            <button
              className="button button--primary"
              onClick={openDirectory}
              disabled={!supported}
            >
              <FolderOpen size={16} />
              {t(lang, "dir.open")}
            </button>
          </div>
        ) : (
          <div className="sidebar__actions">
            <span className="sidebar__dir-name">{directory.name}</span>
            <button
              className="button button--icon"
              title={t(lang, "dir.openOther")}
              onClick={openDirectory}
            >
              <FolderOpen size={16} />
            </button>
            <button
              className="button button--icon"
              title={t(lang, "dir.refresh")}
              onClick={() => void refreshDirectory()}
            >
              <RefreshCw size={16} />
            </button>
          </div>
        )}

        {directory && files.length === 0 && (
          <div className="sidebar__actions">
            <button
              className="button button--primary"
              onClick={() => void reauthorizeDirectory()}
            >
              <FolderOpen size={16} />
              {t(lang, "dir.reauthorize")}
            </button>
          </div>
        )}

        {!supported && (
          <div className="notice notice--error">
            <AlertCircle size={16} />
            {t(lang, "error.browserUnsupported")}
          </div>
        )}

        <div
          className={
            draggingFilePath ? "file-tree file-tree--dragging" : "file-tree"
          }
        >
          {files.length === 0 ? (
            <div className="empty-state">{t(lang, "dir.empty")}</div>
          ) : (
            <div
              className={
                isRootDropTarget
                  ? "file-tree__root-zone file-tree__root-zone--drop-target"
                  : "file-tree__root-zone"
              }
              onDragOver={handleRootZoneDragOver}
              onDragEnter={handleRootZoneDragOver}
              onDragLeave={handleRootZoneDragLeave}
              onDrop={handleRootZoneDrop}
            >
              <ul className="file-tree__list file-tree__list--root">
                {fileTree.map((node) => renderTreeNode(node))}
              </ul>
              {draggingFilePath &&
                canDropFileOnFolder(draggingFilePath, ROOT_DIRECTORY_PATH) && (
                  <div className="file-tree__root-drop-pad" />
                )}
            </div>
          )}
        </div>
      </aside>

      <main className="editor-shell">
        <div className="topbar">
          <div className="topbar__title">
            {renaming ? (
              <input
                className="topbar__rename-input"
                value={renameValue}
                autoFocus
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void commitRename();
                  } else if (e.key === "Escape") {
                    setRenaming(false);
                  }
                }}
                onBlur={() => void commitRename()}
              />
            ) : (
              <div className="topbar__name-row">
                <strong>{currentTitle}</strong>
                {currentFile && directory && (
                  <button
                    className="button button--icon button--tiny"
                    title={t(lang, "file.rename")}
                    onClick={startRename}
                  >
                    <Pencil size={13} />
                  </button>
                )}
              </div>
            )}
            <span>{saveStatusText}</span>
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

            <div className="theme-toggle" aria-label="Theme">
              <button
                className={themeMode === "light" ? "active" : ""}
                onClick={() => setThemeMode("light")}
                type="button"
              >
                {t(lang, "theme.light")}
              </button>
              <button
                className={themeMode === "dark" ? "active" : ""}
                onClick={() => setThemeMode("dark")}
                type="button"
              >
                {t(lang, "theme.dark")}
              </button>
              <button
                className={themeMode === "system" ? "active" : ""}
                onClick={() => setThemeMode("system")}
                type="button"
              >
                {t(lang, "theme.system")}
              </button>
            </div>

            <div className="lang-toggle" aria-label="Language">
              <button
                className={lang === "en" ? "active" : ""}
                onClick={() => setLang("en")}
                type="button"
              >
                EN
              </button>
              <button
                className={lang === "zh-CN" ? "active" : ""}
                onClick={() => setLang("zh-CN")}
                type="button"
              >
                中
              </button>
            </div>

            <button className="button" onClick={() => void newDrawing()} disabled={!api}>
              <FilePlus2 size={16} />
              {t(lang, "file.new")}
            </button>
            <button className="button" onClick={() => void saveAs()} disabled={!api}>
              {t(lang, "file.saveAs")}
            </button>
          </div>
        </div>

        <section className="canvas-wrap">
          <Excalidraw
            excalidrawAPI={setApi}
            initialData={initialData.then((data) =>
              data
                ? {
                    elements: data.elements as any,
                    appState: data.appState,
                    files: data.files,
                    libraryItems: data.libraryItems,
                  }
                : null,
            )}
            onLibraryChange={schedulePersistLibrary}
            onChange={(elements, appState, files) => {
              if (api) {
                const snapshot = serializeAsJSON(elements, appState, files, "local");
                latestSceneJSONRef.current = snapshot;
                const isDirty = snapshot !== cleanSceneJSONRef.current;

                schedulePersistDraft(elements, appState, files);

                if (isDirty && currentFileRef.current) {
                  scheduleAutosave(snapshot);
                } else if (!isDirty && autosaveTimerRef.current) {
                  clearTimeout(autosaveTimerRef.current);
                  autosaveTimerRef.current = null;
                }
              }
            }}
            name={currentTitle.replace(/\.excalidraw$/, "")}
            langCode={lang}
            theme={resolvedTheme}
            libraryReturnUrl={libraryReturnUrl}
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
