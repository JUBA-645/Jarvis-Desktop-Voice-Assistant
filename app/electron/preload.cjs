const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  setKey: (name, baseUrl, model, value) =>
    ipcRenderer.invoke('keys:set', { name, baseUrl, model, value }),
  hasKey: (name) => ipcRenderer.invoke('keys:has', { name }),
  deleteKey: (name) => ipcRenderer.invoke('keys:delete', { name }),
  aiChat: (providerName, messages) => ipcRenderer.invoke('ai:chat', { providerName, messages }),
  saveFile: (name, base64) => ipcRenderer.invoke('files:save', { name, base64 }),
});
