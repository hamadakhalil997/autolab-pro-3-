const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('autoLabDesktop', Object.freeze({
  getRuntimeInfo: () => ipcRenderer.invoke('desktop:info'),
  getVciCapabilities: () => ipcRenderer.invoke('vci:capabilities'),
}));
