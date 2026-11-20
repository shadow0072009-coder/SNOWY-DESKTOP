const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('qor', {
  onSettings: (callback) => {
    ipcRenderer.on('qor:settings', (_event, settings) => callback(settings));
  },
  onStorm: (callback) => {
    ipcRenderer.on('qor:storm', (_event, point) => callback(point));
  },
});
