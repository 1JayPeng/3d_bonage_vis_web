const path = require("path");
const fs = require("fs/promises");
const { app, BrowserWindow, ipcMain, dialog } = require("electron");

ipcMain.handle("desktop:selectDirectory", async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ["openDirectory"]
  });
  if (canceled || filePaths.length === 0) {
    return null;
  }

  const dirPath = filePaths[0];
  try {
    const files = await fs.readdir(dirPath);
    const result = [];
    for (const f of files) {
      const fullPath = path.join(dirPath, f);
      const stat = await fs.stat(fullPath);
      // Optional: filtering could happen here, but we return all files
      if (stat.isFile() && stat.size > 0) {
        result.push({
          name: f,
          path: fullPath,
          size: stat.size
        });
      }
    }
    return { dirPath, files: result };
  } catch (err) {
    console.error("Failed to read directory", err);
    return null;
  }
});

ipcMain.handle("desktop:readFile", async (_event, filePath) => {
  return await fs.readFile(filePath);
});

function sanitizeFileName(name) {
  const base = path.basename(String(name || "")).trim();
  if (!base) {
    throw new Error("Invalid output file name");
  }
  return base;
}

function ensureAbsoluteDir(dirPath) {
  const normalized = path.resolve(String(dirPath || ""));
  if (!path.isAbsolute(normalized)) {
    throw new Error("Output directory must be absolute");
  }
  return normalized;
}

function createMainWindow() {
  const win = new BrowserWindow({
    width: 1520,
    height: 920,
    minWidth: 1200,
    minHeight: 760,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  win.once("ready-to-show", () => {
    win.show();
  });

  win.loadFile(path.join(__dirname, "index.html"));
}

ipcMain.handle("desktop:getDefaultOutputDir", async (_event, sourceFolderPath) => {
  const sourceDir = ensureAbsoluteDir(sourceFolderPath);
  const parentDir = path.dirname(sourceDir);
  const folderName = path.basename(sourceDir);
  return path.join(parentDir, `${folderName}_clean`);
});

ipcMain.handle("desktop:writeDicomFile", async (_event, payload) => {
  const outputDir = ensureAbsoluteDir(payload?.outputDir);
  const fileName = sanitizeFileName(payload?.fileName);
  const byteArray = payload?.byteArray;
  if (!byteArray) {
    throw new Error("Missing byteArray");
  }

  await fs.mkdir(outputDir, { recursive: true });
  const target = path.join(outputDir, fileName);
  const buffer = Buffer.from(byteArray);
  await fs.writeFile(target, buffer);
  return target;
});

app.whenReady().then(() => {
  createMainWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
