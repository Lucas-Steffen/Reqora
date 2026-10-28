import { app, BrowserWindow, safeStorage, session } from "electron";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createImportService } from "./importService";
import { registerIpc } from "./ipc";
import { createFileWorkspaceStore } from "./workspaceStore";
import { createSecretStore } from "./secretStore";
import { createPreferencesStore } from "./preferencesStore";
import { annotateSecrets, extractSecrets } from "./secretVariables";
import { SEND_LIMITS, sendHttp } from "./http/sendRequest";
import { runRequest } from "../runner/run";

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
  const userData = app.getPath("userData");
  // Secrets are encrypted with the OS keychain (DPAPI/Keychain/libsecret).
  const secrets = createSecretStore(userData, safeStorage);
  const store = createFileWorkspaceStore(userData, {
    beforePersist: (workspace) => extractSecrets(workspace, secrets),
    afterLoad: (workspace) => annotateSecrets(workspace, secrets),
  });
  const isSecretVariable = async (variableId: string) =>
    (await store.load()).projects.some((project) =>
      [...project.globals, ...project.environments.flatMap((environment) => environment.variables)]
        .some((variable) => variable.id === variableId && variable.secret),
    );
  registerIpc({
    store,
    importer: createImportService(),
    isTrustedUrl,
    runRequest: async (input) =>
      runRequest(input, {
        workspace: await store.load(),
        readSecret: (variable) => secrets.get(variable.id),
        send: (request) => sendHttp(request, SEND_LIMITS),
      }),
    revealSecret: async (variableId) =>
      (await isSecretVariable(variableId)) ? ((await secrets.get(variableId)) ?? null) : null,
    preferences: createPreferencesStore(userData),
  });
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
