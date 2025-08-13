import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  selectFile: () => ipcRenderer.invoke('select-file'),
  saveFile: (fileName: string) => ipcRenderer.invoke('save-file', fileName),
  readFile: (filePath: string) => ipcRenderer.invoke('read-file', filePath),
  writeFile: (filePath: string, data: Buffer) => ipcRenderer.invoke('write-file', filePath, data),
  onConvertProgress: (callback: (progress: number) => void) => {
    ipcRenderer.on('convert-progress', (_, progress) => callback(progress));
  },
  resizeWindow: (width: number, height: number) => ipcRenderer.invoke('resize-window', width, height),
  selectVrmFile: () => ipcRenderer.invoke('select-vrm-file'),
});