import { contextBridge, ipcRenderer, webUtils } from 'electron'
import { IPC, type ReqoraApi } from '../shared/api'

/**
 * Narrow, named API. No generic invoke/send, no Node objects, and no
 * filesystem access is exposed; each method forwards plain data only.
 */
const api: ReqoraApi = {
  workspace: {
    load: () => ipcRenderer.invoke(IPC.workspaceLoad),
    save: workspace => ipcRenderer.invoke(IPC.workspaceSave, workspace)
  },
  importer: {
    pickFile: () => ipcRenderer.invoke(IPC.importPick),
    fromDroppedFile: file => {
      let path = ''
      try { path = webUtils.getPathForFile(file) } catch { path = '' }
      if (!path) return Promise.resolve({ ok: false, error: { code: 'FILE', message: 'Only files from your computer can be dropped here.' } })
      return ipcRenderer.invoke(IPC.importPath, path)
    },
    fromUrl: url => ipcRenderer.invoke(IPC.importUrl, url),
    cancel: () => ipcRenderer.invoke(IPC.importCancel)
  },
  request: {
    send: input => ipcRenderer.invoke(IPC.requestSend, input)
  },
  secrets: {
    reveal: variableId => ipcRenderer.invoke(IPC.secretReveal, variableId)
  }
}

contextBridge.exposeInMainWorld('reqora', api)
