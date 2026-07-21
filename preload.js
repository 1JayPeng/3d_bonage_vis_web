const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("dicomDesktop", {
  isDesktop: true,
  selectDirectory: () => ipcRenderer.invoke("desktop:selectDirectory"),
  findDicomDirectories: () => ipcRenderer.invoke("desktop:findDicomDirectories"),
  readDirectoryFiles: (dirPath) => ipcRenderer.invoke("desktop:readDirectoryFiles", dirPath),
  readFile: (filePath) => ipcRenderer.invoke("desktop:readFile", filePath),
  getDefaultOutputDir: (sourceFolderPath) => ipcRenderer.invoke("desktop:getDefaultOutputDir", sourceFolderPath),
  prepareOutputDir: (outputDir) => ipcRenderer.invoke("desktop:prepareOutputDir", outputDir),
  writeDicomFile: (outputDir, fileName, byteArray) => ipcRenderer.invoke("desktop:writeDicomFile", {
    outputDir,
    fileName,
    byteArray,
  }),
});
