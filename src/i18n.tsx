// 简易 i18n：只支持 zh-CN 和 en，~20 条字符串
// 新增语言只需扩展 translations map

export type AppLang = "en" | "zh-CN";

export const APP_LANGUAGES: { code: AppLang; label: string }[] = [
  { code: "en", label: "English" },
  { code: "zh-CN", label: "简体中文" },
];

const translations: Record<AppLang, Record<string, string>> = {
  en: {
    // sidebar header
    "app.title": "Excalidraw App",
    "app.hint": "\u2318B to hide",
    "dir.noSelected": "No directory selected",
    // sidebar actions
    "dir.open": "Open Directory",
    "dir.openOther": "Open other folder",
    "dir.refresh": "Refresh",
    "dir.reauthorize": "Re-authorize Directory",
    // file list
    "dir.empty": "No .excalidraw files in directory",
    "file.new": "New",
    "file.saveAs": "Save As",
    "file.saving": "Saving…",
    "file.saved": "Saved",
    "file.rename": "Rename",
    // status
    "status.draft": "Draft not saved to file",
    "status.saveFailed": "Save failed",
    // errors
    "error.browserUnsupported":
      "Your browser does not support File System Access API. Please use Chrome or Edge.",
    "error.openDir": "Failed to open directory",
    "error.openFile": "Failed to open {name}",
    "error.saveFail": "Save failed — check file write permissions",
    "error.saveAsFail": "Save As failed",
    "error.launchFile": "Failed to open file from system",
    "error.renameFail": "Rename failed",
    // theme
    "theme.light": "Light",
    "theme.dark": "Dark",
    "theme.system": "System",
  },
  "zh-CN": {
    "app.title": "Excalidraw App",
    "app.hint": "\u2318B 隐藏界面",
    "dir.noSelected": "未选择目录",
    "dir.open": "打开目录",
    "dir.openOther": "打开其他文件夹",
    "dir.refresh": "刷新",
    "dir.reauthorize": "重新授权目录",
    "dir.empty": "目录内没有 .excalidraw 文件",
    "file.new": "新建",
    "file.saveAs": "另存为",
    "file.saving": "保存中",
    "file.saved": "已保存",
    "file.rename": "重命名",
    "status.draft": "草稿未落盘",
    "status.saveFailed": "保存失败",
    "error.browserUnsupported":
      "当前浏览器不支持 File System Access API，请使用 Chrome 或 Edge。",
    "error.openDir": "无法打开目录",
    "error.openFile": "无法打开 {name}",
    "error.saveFail": "保存失败，请检查文件写入权限",
    "error.saveAsFail": "另存为失败",
    "error.launchFile": "无法打开系统传入的文件",
    "error.renameFail": "重命名失败",
    "theme.light": "浅色",
    "theme.dark": "深色",
    "theme.system": "系统",
  },
};

const STORAGE_KEY = "excalidraw-app.lang";

export function getStoredLang(): AppLang {
  const v = localStorage.getItem(STORAGE_KEY);
  return v === "zh-CN" ? "zh-CN" : "en";
}

export function persistLang(lang: AppLang): void {
  localStorage.setItem(STORAGE_KEY, lang);
}

/**
 * 简易翻译函数，支持 {placeholder} 插值
 */
export function t(
  lang: AppLang,
  key: string,
  repl?: Record<string, string>,
): string {
  let text = translations[lang][key] ?? translations["en"][key] ?? key;
  if (repl) {
    for (const [k, v] of Object.entries(repl)) {
      text = text.replaceAll(`{${k}}`, v);
    }
  }
  return text;
}
