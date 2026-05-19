export type DrawingEntry = {
  name: string;
  handle: FileSystemFileHandle;
  lastModified: number | null;
};

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

    const fileHandle = handle as FileSystemFileHandle;
    let lastModified: number | null = null;

    try {
      lastModified = (await fileHandle.getFile()).lastModified;
    } catch {
      lastModified = null;
    }

    files.push({
      name: fileHandle.name,
      handle: fileHandle,
      lastModified,
    });
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
