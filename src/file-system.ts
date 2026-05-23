/** 与 showDirectoryPicker / showSaveFilePicker 共用，便于浏览器记住工作区目录 */
export const WORKSPACE_PICKER_ID = "excalidraw-workspace";

export type DrawingEntry = {
  name: string;
  /** 文件相对于根目录的路径，如 "sub/foo.excalidraw" */
  relativePath: string;
  handle: FileSystemFileHandle;
  /** 文件所在的直接父目录 handle */
  directoryHandle: FileSystemDirectoryHandle;
  lastModified: number | null;
};

export async function createDrawingEntry(
  handle: FileSystemFileHandle,
  relativePath: string,
  directoryHandle: FileSystemDirectoryHandle,
): Promise<DrawingEntry> {
  let lastModified: number | null = null;

  try {
    lastModified = (await handle.getFile()).lastModified;
  } catch {
    lastModified = null;
  }

  return {
    name: handle.name,
    relativePath,
    handle,
    directoryHandle,
    lastModified,
  };
}

export async function pickDrawingDirectory(
  startIn?: FileSystemDirectoryHandle,
): Promise<{
  directory: FileSystemDirectoryHandle;
  files: DrawingEntry[];
}> {
  const directory = await window.showDirectoryPicker({
    mode: "readwrite",
    id: WORKSPACE_PICKER_ID,
    startIn,
  });
  return {
    directory,
    files: await listDrawingFiles(directory),
  };
}

export async function listDrawingFiles(
  directory: FileSystemDirectoryHandle,
): Promise<DrawingEntry[]> {
  const files: DrawingEntry[] = [];
  await collectFiles(directory, "", files);
  return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
}

async function collectFiles(
  dir: FileSystemDirectoryHandle,
  prefix: string,
  out: DrawingEntry[],
): Promise<void> {
  for await (const [name, handle] of dir.entries()) {
    if (name.startsWith(".")) continue;

    if (handle.kind === "directory") {
      await collectFiles(
        handle as FileSystemDirectoryHandle,
        prefix ? `${prefix}/${name}` : name,
        out,
      );
    } else if (handle.kind === "file" && name.endsWith(".excalidraw")) {
      out.push(
        await createDrawingEntry(
          handle as FileSystemFileHandle,
          prefix ? `${prefix}/${name}` : name,
          dir,
        ),
      );
    }
  }
}

export async function readFileText(handle: FileSystemFileHandle): Promise<string> {
  return (await handle.getFile()).text();
}

export async function writeFileText(
  handle: FileSystemFileHandle,
  content: string,
): Promise<void> {
  const writable = await handle.createWritable();
  await writable.write(content);
  await writable.close();
}

export type SaveDrawingPickerOptions = {
  startIn?: FileSystemDirectoryHandle;
};

export async function saveTextAsDrawing(
  suggestedName: string,
  content: string,
  options?: SaveDrawingPickerOptions,
): Promise<FileSystemFileHandle> {
  const handle = await window.showSaveFilePicker({
    suggestedName: ensureDrawingExtension(suggestedName),
    id: WORKSPACE_PICKER_ID,
    ...(options?.startIn ? { startIn: options.startIn } : {}),
    types: [
      {
        description: "Excalidraw 文件",
        accept: {
          "application/json": [".excalidraw"],
        },
      },
    ],
  });

  await writeFileText(handle, content);
  return handle;
}

export function isFileSystemAccessSupported(): boolean {
  return (
    typeof window.showDirectoryPicker === "function" &&
    typeof window.showSaveFilePicker === "function"
  );
}

function ensureDrawingExtension(name: string): string {
  return name.endsWith(".excalidraw") ? name : `${name}.excalidraw`;
}

/**
 * 从根目录逐级 getDirectoryHandle 到 relativePath 的父目录，
 * 确保返回的 handle 拥有与根目录一致的 readwrite 权限。
 */
export async function resolveParentDir(
  root: FileSystemDirectoryHandle,
  relativePath: string,
): Promise<FileSystemDirectoryHandle> {
  const parts = relativePath.split("/");
  parts.pop(); // 去掉文件名

  let dir = root;
  for (const part of parts) {
    dir = await dir.getDirectoryHandle(part);
  }
  return dir;
}

export async function renameFileInDirectory(
  parentDir: FileSystemDirectoryHandle,
  oldHandle: FileSystemFileHandle,
  newName: string,
): Promise<FileSystemFileHandle> {
  const finalName = ensureDrawingExtension(newName);

  // 读旧文件内容
  const content = await readFileText(oldHandle);

  // 在同一父目录创建新文件并写入
  const newHandle = await parentDir.getFileHandle(finalName, { create: true });
  await writeFileText(newHandle, content);

  // 删除旧文件
  await parentDir.removeEntry(oldHandle.name);

  return newHandle;
}

// --- IndexedDB 持久化 directory handle ---

const IDB_DB_NAME = "excalidraw-app";
const IDB_DB_VERSION = 3;
const IDB_STORE_NAME = "handles";
const IDB_KEY = "lastDirectory";

export function openIDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(IDB_DB_NAME, IDB_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("handles")) {
        db.createObjectStore("handles");
      }
      if (!db.objectStoreNames.contains("draft")) {
        db.createObjectStore("draft");
      }
      if (!db.objectStoreNames.contains("library")) {
        db.createObjectStore("library");
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function persistDirectoryHandle(
  directory: FileSystemDirectoryHandle,
): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, "readwrite");
    tx.objectStore(IDB_STORE_NAME).put(directory, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadDirectoryHandle(): Promise<FileSystemDirectoryHandle | null> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, "readonly");
    const request = tx.objectStore(IDB_STORE_NAME).get(IDB_KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function queryDirectoryPermission(
  directory: FileSystemDirectoryHandle,
): Promise<PermissionState> {
  return directory.queryPermission({ mode: "readwrite" });
}

export async function requestDirectoryPermission(
  directory: FileSystemDirectoryHandle,
): Promise<PermissionState> {
  return directory.requestPermission({ mode: "readwrite" });
}
