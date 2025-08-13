const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;
const https = require('https');

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 700,
    resizable: false, // Fixed window size
    acceptFirstMouse: true,
    autoHideMenuBar: true, // Hide menu bar
    center: true, // Center window on screen
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // Allow file access
      allowRunningInsecureContent: true, // For development
      enableRemoteModule: false,
    },
  });

  // Check if Vite dev server is running
  const isDev = process.env.NODE_ENV && process.env.NODE_ENV.trim() === 'development';
  
  
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
    
  } else {
    const indexPath = path.join(__dirname, '../dist/renderer/index.html');
    mainWindow.loadFile(indexPath);
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Check FBX2glTF after window is loaded
  mainWindow.webContents.once('did-finish-load', () => {
    checkAndDownloadFBX2glTF();
  });

  // Handle native file drop
  mainWindow.webContents.on('did-finish-load', () => {
    // Enable drag and drop
    mainWindow.webContents.on('drop-files', (event, files) => {
      if (files && files.length > 0) {
        const filePath = files[0];
        if (filePath.toLowerCase().endsWith('.fbx')) {
          mainWindow.webContents.send('file-dropped', filePath);
        }
      }
    });
  });
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Handle drag and drop files
  app.on('browser-window-created', (_, window) => {
    window.webContents.on('will-navigate', (event, navigationUrl) => {
      const parsedUrl = new URL(navigationUrl);

      if (parsedUrl.origin !== 'http://localhost:5173') {
        event.preventDefault();
      }
    });
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('select-file', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'FBX Files', extensions: ['fbx'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    // Return single file path for backward compatibility
    return result.filePaths[0];
  }
  return null;
});

// Load application configuration
ipcMain.handle('load-config', async () => {
  try {
    const configPath = app.isPackaged 
      ? path.join(process.resourcesPath, 'config.json')
      : path.join(__dirname, '..', 'config.json');
    
    const configData = await fs.readFile(configPath, 'utf8');
    return JSON.parse(configData);
  } catch (error) {
    console.warn('Could not load config.json:', error);
    // Return default configuration
    return {
      batchConversion: {
        maxFiles: 30
      },
      ui: {
        language: 'ja'
      },
      conversion: {
        outputQuality: 'high',
        defaultOutputDirectory: ''
      }
    };
  }
});

// Handle file drop via IPC - save temporary file
ipcMain.handle('save-temp-file', async (event, fileName, fileData) => {
  try {
    const os = require('os');
    const crypto = require('crypto');
    
    // Create unique temp file name
    const tempId = crypto.randomBytes(8).toString('hex');
    const tempFileName = `fbx2vrma_${tempId}_${fileName}`;
    const tempFilePath = path.join(os.tmpdir(), tempFileName);
    
    // Write file to temp directory
    await fs.writeFile(tempFilePath, Buffer.from(fileData));
    
    return tempFilePath;
  } catch (error) {
    console.error('Error saving temporary file:', error);
    throw error;
  }
});

ipcMain.handle('save-file', async (_, fileName) => {
  const result = await dialog.showSaveDialog({
    defaultPath: fileName,
    filters: [
      { name: 'VRMA Files', extensions: ['vrma'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  
  if (!result.canceled && result.filePath) {
    return result.filePath;
  }
  return null;
});

ipcMain.handle('read-file', async (_, filePath) => {
  try {
    const data = await fs.readFile(filePath);
    return data;
  } catch (error) {
    console.error('Error reading file:', error);
    throw error;
  }
});

ipcMain.handle('write-file', async (_, filePath, data) => {
  try {
    await fs.writeFile(filePath, Buffer.from(data));
    return true;
  } catch (error) {
    console.error('Error writing file:', error);
    throw error;
  }
});

// Convert glTF to VRMA format
async function convertGltfToVrma(gltfPath) {
  // Read the glTF file (binary format)
  const gltfData = await fs.readFile(gltfPath);
  
  // Parse binary glTF (.glb) file
  const { jsonData, binaryData } = parseGlbFileWithBinary(gltfData);
  
  // Debug: log the parsed glTF structure
  console.log('Parsed glTF structure:');
  console.log('- Nodes:', jsonData.nodes ? jsonData.nodes.length : 0);
  console.log('- Animations:', jsonData.animations ? jsonData.animations.length : 0);
  if (jsonData.nodes && jsonData.nodes.length > 0) {
    console.log('- Sample node names:', jsonData.nodes.slice(0, 5).map(n => n.name));
  }
  
  if (!jsonData.animations || jsonData.animations.length === 0) {
    throw new Error('No animations found in glTF file');
  }
  
  // Add VRMC_vrm_animation extension to existing glTF
  jsonData.extensionsUsed = jsonData.extensionsUsed || [];
  if (!jsonData.extensionsUsed.includes('VRMC_vrm_animation')) {
    jsonData.extensionsUsed.push('VRMC_vrm_animation');
  }
  
  jsonData.extensionsRequired = jsonData.extensionsRequired || [];
  if (!jsonData.extensionsRequired.includes('VRMC_vrm_animation')) {
    jsonData.extensionsRequired.push('VRMC_vrm_animation');
  }
  
  // Create VRMC_vrm_animation extension
  jsonData.extensions = jsonData.extensions || {};
  jsonData.extensions.VRMC_vrm_animation = {
    specVersion: "1.0",
    humanoid: {
      humanBones: {}
    }
  };
  
  // Map animation channels to VRM humanoid bones
  const animation = jsonData.animations[0];
  if (animation.channels) {
    console.log('Processing', animation.channels.length, 'animation channels');
    animation.channels.forEach((channel, index) => {
      if (jsonData.nodes && jsonData.nodes[channel.target.node]) {
        const nodeName = jsonData.nodes[channel.target.node].name || 'unnamed';
        const boneName = mapToVrmBoneByName(jsonData, channel.target.node);
        console.log(`Channel ${index}: node ${channel.target.node} (${nodeName}) -> ${boneName}`);
        if (boneName) {
          jsonData.extensions.VRMC_vrm_animation.humanoid.humanBones[boneName] = {
            node: channel.target.node
          };
        }
      }
    });
  }
  
  console.log('Created VRMC_vrm_animation extension with humanoid bones:', 
              Object.keys(jsonData.extensions.VRMC_vrm_animation.humanoid.humanBones));
  
  // Create new binary glTF file with updated JSON
  return createGlbFile(jsonData, binaryData);
}

// Map glTF bone by name to VRM humanoid bone names
function mapToVrmBoneByName(gltf, nodeIndex) {
  try {
    if (!gltf.nodes || !gltf.nodes[nodeIndex]) {
      return null;
    }
    
    const nodeName = gltf.nodes[nodeIndex].name || '';
    
    // Mixamo to VRM bone mapping (with colon syntax)
    const mixamoToVrm = {
      'mixamorig:Hips': 'hips',
      'mixamorig:Spine': 'spine',
      'mixamorig:Spine1': 'chest',
      'mixamorig:Spine2': 'upperChest',
      'mixamorig:Neck': 'neck',
      'mixamorig:Head': 'head',
      'mixamorig:LeftShoulder': 'leftShoulder',
      'mixamorig:LeftArm': 'leftUpperArm',
      'mixamorig:LeftForeArm': 'leftLowerArm',
      'mixamorig:LeftHand': 'leftHand',
      'mixamorig:RightShoulder': 'rightShoulder',
      'mixamorig:RightArm': 'rightUpperArm',
      'mixamorig:RightForeArm': 'rightLowerArm',
      'mixamorig:RightHand': 'rightHand',
      'mixamorig:LeftUpLeg': 'leftUpperLeg',
      'mixamorig:LeftLeg': 'leftLowerLeg',
      'mixamorig:LeftFoot': 'leftFoot',
      'mixamorig:LeftToeBase': 'leftToes',
      'mixamorig:RightUpLeg': 'rightUpperLeg',
      'mixamorig:RightLeg': 'rightLowerLeg',
      'mixamorig:RightFoot': 'rightFoot',
      'mixamorig:RightToeBase': 'rightToes'
    };
    
    // Direct mapping
    if (mixamoToVrm[nodeName]) {
      console.log(`Direct mapping: ${nodeName} -> ${mixamoToVrm[nodeName]} (node ${nodeIndex})`);
      return mixamoToVrm[nodeName];
    }
    
    return null;
  } catch (error) {
    console.error('Error mapping bone name:', error);
    return null;
  }
}

// Parse binary glTF (.glb) file and return both JSON and binary data
function parseGlbFileWithBinary(buffer) {
  console.log('GLB file size:', buffer.length, 'bytes');
  
  if (buffer.length < 12) {
    throw new Error('File too small to be a valid GLB file');
  }
  
  // GLB file structure:
  // 12 byte header: magic(4) + version(4) + length(4)
  const header = new DataView(buffer.buffer, buffer.byteOffset, 12);
  
  // Check magic number (should be 'glTF' = 0x46546C67)
  const magic = header.getUint32(0, true);
  console.log('Magic number:', magic.toString(16));
  if (magic !== 0x46546C67) {
    throw new Error('Invalid GLB file: wrong magic number');
  }
  
  // Get version and total length
  const version = header.getUint32(4, true);
  const totalLength = header.getUint32(8, true);
  console.log('GLB version:', version, 'total length:', totalLength);
  
  if (buffer.length < totalLength) {
    throw new Error('File size mismatch');
  }
  
  // Read first chunk (JSON)
  let offset = 12;
  const jsonChunkLength = new DataView(buffer.buffer, buffer.byteOffset + offset, 4).getUint32(0, true);
  offset += 4;
  const jsonChunkType = new DataView(buffer.buffer, buffer.byteOffset + offset, 4).getUint32(0, true);
  offset += 4;
  
  console.log('JSON chunk length:', jsonChunkLength, 'type:', jsonChunkType.toString(16));
  
  // Extract JSON chunk
  const jsonBuffer = buffer.subarray(offset, offset + jsonChunkLength);
  const jsonString = new TextDecoder().decode(jsonBuffer);
  offset += jsonChunkLength;
  
  console.log('JSON string length:', jsonString.length);
  console.log('JSON preview:', jsonString.substring(0, 200) + '...');
  
  const jsonData = JSON.parse(jsonString);
  
  // Read binary chunk if it exists
  let binaryData = null;
  if (offset < totalLength) {
    // Read binary chunk header
    const binaryChunkLength = new DataView(buffer.buffer, buffer.byteOffset + offset, 4).getUint32(0, true);
    offset += 4;
    const binaryChunkType = new DataView(buffer.buffer, buffer.byteOffset + offset, 4).getUint32(0, true);
    offset += 4;
    
    console.log('Binary chunk length:', binaryChunkLength, 'type:', binaryChunkType.toString(16));
    
    // Extract binary chunk
    binaryData = buffer.subarray(offset, offset + binaryChunkLength);
  }
  
  return { jsonData, binaryData };
}

// Create binary glTF (.glb) file from JSON and binary data
function createGlbFile(jsonData, binaryData) {
  const jsonString = JSON.stringify(jsonData);
  const jsonBuffer = new TextEncoder().encode(jsonString);
  
  // Pad JSON to 4-byte boundary
  const jsonPadding = (4 - (jsonBuffer.length % 4)) % 4;
  const paddedJsonLength = jsonBuffer.length + jsonPadding;
  
  // Calculate total file size
  const headerSize = 12;
  const jsonChunkHeaderSize = 8;
  let totalSize = headerSize + jsonChunkHeaderSize + paddedJsonLength;
  
  let binaryChunkHeaderSize = 0;
  let paddedBinaryLength = 0;
  
  if (binaryData && binaryData.length > 0) {
    binaryChunkHeaderSize = 8;
    const binaryPadding = (4 - (binaryData.length % 4)) % 4;
    paddedBinaryLength = binaryData.length + binaryPadding;
    totalSize += binaryChunkHeaderSize + paddedBinaryLength;
  }
  
  // Create output buffer
  const output = new ArrayBuffer(totalSize);
  const view = new DataView(output);
  const bytes = new Uint8Array(output);
  
  let offset = 0;
  
  // Write GLB header
  view.setUint32(offset, 0x46546C67, true); // magic: 'glTF'
  offset += 4;
  view.setUint32(offset, 2, true); // version
  offset += 4;
  view.setUint32(offset, totalSize, true); // total length
  offset += 4;
  
  // Write JSON chunk header
  view.setUint32(offset, paddedJsonLength, true); // chunk length
  offset += 4;
  view.setUint32(offset, 0x4E4F534A, true); // chunk type: 'JSON'
  offset += 4;
  
  // Write JSON data
  bytes.set(jsonBuffer, offset);
  offset += jsonBuffer.length;
  
  // Add JSON padding (spaces)
  for (let i = 0; i < jsonPadding; i++) {
    bytes[offset++] = 0x20; // space character
  }
  
  // Write binary chunk if it exists
  if (binaryData && binaryData.length > 0) {
    // Write binary chunk header
    view.setUint32(offset, paddedBinaryLength, true); // chunk length
    offset += 4;
    view.setUint32(offset, 0x004E4942, true); // chunk type: 'BIN\0'
    offset += 4;
    
    // Write binary data
    bytes.set(binaryData, offset);
    offset += binaryData.length;
    
    // Add binary padding (zeros)
    const binaryPadding = paddedBinaryLength - binaryData.length;
    for (let i = 0; i < binaryPadding; i++) {
      bytes[offset++] = 0x00;
    }
  }
  
  console.log('Created GLB file with size:', totalSize, 'bytes');
  return Buffer.from(output);
}

// FBX2glTF Download Functions
const FBX2GLTF_VERSION = 'v0.9.7';
const DOWNLOADS = {
  win32: {
    url: `https://github.com/facebookincubator/FBX2glTF/releases/download/${FBX2GLTF_VERSION}/FBX2glTF-windows-x64.exe`,
    filename: 'FBX2glTF.exe'
  },
  darwin: {
    url: `https://github.com/facebookincubator/FBX2glTF/releases/download/${FBX2GLTF_VERSION}/FBX2glTF-darwin-x64`,
    filename: 'FBX2glTF'
  },
  linux: {
    url: `https://github.com/facebookincubator/FBX2glTF/releases/download/${FBX2GLTF_VERSION}/FBX2glTF-linux-x64`,
    filename: 'FBX2glTF'
  }
};

function getFBX2glTFPath() {
  const platform = process.platform;
  const binaryName = platform === 'win32' ? 'FBX2glTF.exe' : 'FBX2glTF';
  
  if (app.isPackaged) {
    return path.join(process.resourcesPath, 'binaries', binaryName);
  } else {
    return path.join(__dirname, '..', 'binaries', binaryName);
  }
}

async function checkFBX2glTFExists() {
  try {
    const binaryPath = getFBX2glTFPath();
    await fs.access(binaryPath);
    return true;
  } catch {
    return false;
  }
}

function downloadFile(url, dest, progressCallback) {
  return new Promise((resolve, reject) => {
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        https.get(response.headers.location, (redirectResponse) => {
          handleDownloadResponse(redirectResponse, dest, progressCallback, resolve, reject);
        }).on('error', reject);
      } else {
        handleDownloadResponse(response, dest, progressCallback, resolve, reject);
      }
    }).on('error', reject);
  });
}

function handleDownloadResponse(response, dest, progressCallback, resolve, reject) {
  const totalSize = parseInt(response.headers['content-length'] || '0', 10);
  let downloadedSize = 0;

  const file = require('fs').createWriteStream(dest);

  response.on('data', (chunk) => {
    downloadedSize += chunk.length;
    if (progressCallback && totalSize > 0) {
      const progress = Math.round((downloadedSize / totalSize) * 100);
      progressCallback(progress);
    }
  });

  response.pipe(file);
  
  file.on('finish', () => {
    file.close();
    resolve();
  });

  file.on('error', (error) => {
    file.close();
    reject(error);
  });
}

async function downloadFBX2glTF(progressCallback) {
  const platform = process.platform;
  const download = DOWNLOADS[platform];
  
  if (!download) {
    throw new Error(`Unsupported platform: ${platform}`);
  }

  const binaryPath = getFBX2glTFPath();
  const binariesDir = path.dirname(binaryPath);

  // Create binaries directory if it doesn't exist
  try {
    await fs.mkdir(binariesDir, { recursive: true });
  } catch (error) {
    // Directory already exists, continue
  }

  console.log(`Downloading FBX2glTF for ${platform}...`);
  console.log(`URL: ${download.url}`);

  await downloadFile(download.url, binaryPath, progressCallback);
  console.log(`Downloaded to ${binaryPath}`);

  // Make executable on Unix systems
  if (platform !== 'win32') {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    await execAsync(`chmod +x "${binaryPath}"`);
    console.log('Made executable');
  }

  console.log('FBX2glTF installation complete!');
}

async function checkAndDownloadFBX2glTF() {
  if (await checkFBX2glTFExists()) {
    console.log('FBX2glTF already exists');
    if (mainWindow) {
      mainWindow.webContents.send('fbx2gltf-ready');
    }
    return;
  }

  console.log('FBX2glTF not found, starting download...');
  if (mainWindow) {
    mainWindow.webContents.send('fbx2gltf-download-start');
  }

  try {
    await downloadFBX2glTF((progress) => {
      if (mainWindow) {
        mainWindow.webContents.send('fbx2gltf-download-progress', progress);
      }
    });

    if (mainWindow) {
      mainWindow.webContents.send('fbx2gltf-download-complete');
    }
  } catch (error) {
    console.error('Failed to download FBX2glTF:', error);
    if (mainWindow) {
      mainWindow.webContents.send('fbx2gltf-download-error', error.message);
    }
  }
}

// Handle FBX to VRMA conversion
ipcMain.handle('convert-fbx-to-vrma', async (event, fbxPath) => {
  try {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    const os = require('os');
    const crypto = require('crypto');
    
    // Send progress updates
    const sendProgress = (progress) => {
      event.sender.send('conversion-progress', progress);
    };
    
    sendProgress(10);
    
    // Step 1: Convert FBX to glTF using FBX2glTF
    const platform = process.platform;
    const binaryName = platform === 'win32' ? 'FBX2glTF.exe' : 'FBX2glTF';
    
    // Determine binary path based on whether app is packaged or not
    let binaryPath;
    if (app.isPackaged) {
      // In packaged app, binaries are in extraResources
      binaryPath = path.join(process.resourcesPath, 'binaries', binaryName);
    } else {
      // In development, binaries are in project root
      binaryPath = path.join(__dirname, '..', 'binaries', binaryName);
    }
    
    // Create temp file for glTF output
    const tempId = crypto.randomBytes(8).toString('hex');
    const gltfPath = path.join(os.tmpdir(), `temp_${tempId}.glb`);
    
    sendProgress(30);
    
    // Execute FBX2glTF
    const command = `"${binaryPath}" --binary --verbose --input "${fbxPath}" --output "${gltfPath}"`;
    await execAsync(command);
    
    sendProgress(60);
    
    // Step 2: Convert glTF to VRMA
    const vrmaData = await convertGltfToVrma(gltfPath);
    
    sendProgress(90);
    
    // Clean up temp files
    try {
      await fs.unlink(gltfPath);
      await fs.unlink(fbxPath); // Clean up temp FBX file
    } catch (error) {
      // Ignore cleanup errors
    }
    
    sendProgress(100);
    
    return vrmaData;
    
  } catch (error) {
    console.error('Conversion error:', error);
    throw new Error(`Conversion failed: ${error.message}`);
  }
});