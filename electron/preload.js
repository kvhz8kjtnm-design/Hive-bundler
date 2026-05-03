const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,

  /** Returns { isConfigured, rpcPreview } */
  getConfig: () => ipcRenderer.invoke('get-config'),

  /** Returns { rpcUrl, blockEngine } for the Settings panel */
  getFullConfig: () => ipcRenderer.invoke('get-full-config'),

  /** Saves wallet keys + RPC on first setup, starts server, returns { ok, error? } */
  saveConfig: (cfg) => ipcRenderer.invoke('save-config', cfg),

  /** Updates RPC URL and block engine from Settings, returns { ok } */
  updateConfig: (cfg) => ipcRenderer.invoke('update-config', cfg),
});
