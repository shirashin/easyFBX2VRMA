const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFile: () => ipcRenderer.invoke('select-file'),
  saveFile: (fileName) => ipcRenderer.invoke('save-file', fileName),
  readFile: (filePath) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath, data) => ipcRenderer.invoke('write-file', filePath, data),
  saveTempFile: (fileName, fileData) => ipcRenderer.invoke('save-temp-file', fileName, fileData),
  onConvertProgress: (callback) => {
    ipcRenderer.on('convert-progress', (_, progress) => callback(progress));
  },
  onFileDropped: (callback) => {
    ipcRenderer.on('file-dropped', (_, filePath) => callback(filePath));
  },
  convertFbxToVrma: (fbxPath) => ipcRenderer.invoke('convert-fbx-to-vrma', fbxPath),
  onConversionProgress: (callback) => {
    ipcRenderer.on('conversion-progress', (_, progress) => callback(progress));
  },
  // FBX2glTF Download Events
  onFBX2glTFDownloadStart: (callback) => {
    ipcRenderer.on('fbx2gltf-download-start', () => callback());
  },
  onFBX2glTFDownloadProgress: (callback) => {
    ipcRenderer.on('fbx2gltf-download-progress', (_, progress) => callback(progress));
  },
  onFBX2glTFDownloadComplete: (callback) => {
    ipcRenderer.on('fbx2gltf-download-complete', () => callback());
  },
  onFBX2glTFDownloadError: (callback) => {
    ipcRenderer.on('fbx2gltf-download-error', (_, error) => callback(error));
  },
  onFBX2glTFReady: (callback) => {
    ipcRenderer.on('fbx2gltf-ready', () => callback());
  },
});