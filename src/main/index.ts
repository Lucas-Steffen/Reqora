import { app, BrowserWindow, session } from "electron";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createImportService } from "./importService";
import { registerIpc } from "./ipc";
import { createFileWorkspaceStore } from "./workspaceStore";

const directory = fileURLToPath(new URL(".", import.meta.url));
const rendererFile = join(directory, "../renderer/index.html");
const rendererUrl = !app.isPackaged ? process.env.ELECTRON_RENDERER_URL : undefined;

function isTrustedUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (rendererUrl) return parsed.origin === new URL(rendererUrl).origin;
    return parsed.protocol === "file:" && fileURLToPath(parsed) === rendererFile;
  } catch {
    return false;
  }
}

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1000,
    minHeight: 700,
    title: "Reqora",
    show: process.env.REQORA_SMOKE_TEST !== "1",
    backgroundColor: "#101116",
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(directory, "../preload/index.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: process.env.REQORA_SMOKE_TEST !== "1",
      offscreen: process.env.REQORA_SMOKE_TEST === "1",
    },
  });
  window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  window.webContents.on("will-navigate", (event, url) => {
    if (url !== window.webContents.getURL()) event.preventDefault();
  });
  if (rendererUrl) void window.loadURL(rendererUrl);
  else void window.loadURL(pathToFileURL(rendererFile).toString());
}

void app.whenReady().then(() => {
  session.defaultSession.setPermissionRequestHandler(
    (_webContents, _permission, callback) => callback(false),
  );
  registerIpc({
    store: createFileWorkspaceStore(app.getPath("userData")),
    importer: createImportService(),
    isTrustedUrl,
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
