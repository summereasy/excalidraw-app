export type DrawingEntry = {
  name: string;
  handle: FileSystemFileHandle;
  lastModified: number | null;
};

export async function createDrawingEntry(
  handle: FileSystemFileHandle,
): Promise<DrawingEntry> {
  let lastModified: number | null = null;

  try {
    lastModified = (await handle.getFile()).lastModified;
  } catch {
    lastModified = null;
  }

  return {
    name: handle.name,
    handle,
    lastModified,
  };
}

export async function pickDrawingDirectory(): Promise<{
  directory: FileSystemDirectoryHandle;
  files: DrawingEntry[];
}> {
  const directory = await window.showDirectoryPicker({ mode: "readwrite" });
  return {
    directory,
    files: await listDrawingFiles(directory),
  };
}

export async function listDrawingFiles(
  directory: FileSystemDirectoryHandle,
): Promise<DrawingEntry[]> {
  const files: DrawingEntry[] = [];

  for await (const [, handle] of directory.entries()) {
    if (handle.kind !== "file" || !handle.name.endsWith(".excalidraw")) {
      continue;
    }

    files.push(await createDrawingEntry(handle as FileSystemFileHandle));
  }

  return files.sort((a, b) => a.name.localeCompare(b.name));
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

export async function saveTextAsDrawing(
  suggestedName: string,
  content: string,
): Promise<FileSystemFileHandle> {
  const handle = await window.showSaveFilePicker({
    suggestedName: ensureDrawingExtension(suggestedName),
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

// --- IndexedDB 持久化 directory handle ---

const IDB_DB_NAME = "excalidraw-app";
const IDB_DB_VERSION = 2;
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
