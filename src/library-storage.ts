import {
  restoreLibraryItems,
  serializeLibraryAsJSON,
} from "@excalidraw/excalidraw";
import type { LibraryItems } from "@excalidraw/excalidraw/types";

import { openIDB } from "./file-system";

const IDB_STORE_NAME = "library";
const IDB_KEY = "data";

export async function saveLibrary(libraryItems: LibraryItems): Promise<void> {
  const json = serializeLibraryAsJSON(libraryItems);
  const db = await openIDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, "readwrite");
    tx.objectStore(IDB_STORE_NAME).put(json, IDB_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadPersistedLibrary(): Promise<LibraryItems | null> {
  const db = await openIDB();
  const json = await new Promise<string | null>((resolve, reject) => {
    const tx = db.transaction(IDB_STORE_NAME, "readonly");
    const request = tx.objectStore(IDB_STORE_NAME).get(IDB_KEY);
    request.onsuccess = () => resolve(request.result ?? null);
    request.onerror = () => reject(request.error);
  });

  if (!json) {
    return null;
  }

  try {
    const data = JSON.parse(json) as { libraryItems?: unknown };
    return restoreLibraryItems(data.libraryItems ?? [], "unpublished");
  } catch {
    return null;
  }
}
