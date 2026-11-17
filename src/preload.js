const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('hub', {
  getState: () => ipcRenderer.invoke('get-state'),
  openProfile: (browser, dir) => ipcRenderer.invoke('open-profile', browser, dir),
  addProfile: (browser) => ipcRenderer.invoke('add-profile', browser),
  saveConfig: (patch) => ipcRenderer.invoke('save-config', patch),
  pickExe: (browser) => ipcRenderer.invoke('pick-exe', browser),
  win: (action) => ipcRenderer.send('win', action),
  onRefresh: (cb) => ipcRenderer.on('refresh', cb)
});
