import type {
  AppState,
  BinaryFiles,
} from "@excalidraw/excalidraw/types";
import { openIDB } from "./file-system";

// ExcalidrawElement 没有从包导出，用 unknown[] 做 storage 层的类型
// 调用方保证传入正确的 elements 数组
export type DraftScene = {
  elements: readonly unknown[];
  appState: Partial<AppState>;
  files: BinaryFiles;
  currentFileHandle: FileSystemFileHandle | null;
  currentFileName: string | null;
};

const IDB_STORE_NAME = "draft";
const IDB_KEY = "scene";

export async function saveDraftScene(draft: DraftScene): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, "readwrite");
    tx.objectStore(IDB_STORE_NAME).put(draft, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadDraftScene(): Promise<DraftScene | null> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, "readonly");
    const request = tx.objectStore(IDB_STORE_NAME).get(IDB_KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function clearDraftScene(): Promise<void> {
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, "readwrite");
    tx.objectStore(IDB_STORE_NAME).delete(IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
