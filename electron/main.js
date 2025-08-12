const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs').promises;

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 700,
    acceptFirstMouse: true,
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
    properties: ['openFile'],
    filters: [
      { name: 'FBX Files', extensions: ['fbx'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  
  if (!result.canceled && result.filePaths.length > 0) {
    return result.filePaths[0];
  }
  return null;
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
  try {
    // Read the glTF file (binary format)
    const gltfData = await fs.readFile(gltfPath);
    
    // Parse binary glTF (.glb) file
    const gltf = parseGlbFile(gltfData);
    
    // Debug: log the parsed glTF structure
    console.log('Parsed glTF structure:');
    console.log('- Nodes:', gltf.nodes ? gltf.nodes.length : 0);
    console.log('- Animations:', gltf.animations ? gltf.animations.length : 0);
    if (gltf.nodes && gltf.nodes.length > 0) {
      console.log('- Sample node names:', gltf.nodes.slice(0, 5).map(n => n.name));
    }
    
    // Create VRMA structure
    const vrma = {
      asset: {
        generator: "EasyFBX2VRMA",
        version: "2.0"
      },
      extensionsUsed: ["VRMC_vrm_animation"],
      extensionsRequired: ["VRMC_vrm_animation"],
      extensions: {
        VRMC_vrm_animation: {
          specVersion: "1.0",
          humanoid: {
            humanBones: []
          }
        }
      }
    };
    
    // Extract animations from glTF
    if (gltf.animations && gltf.animations.length > 0) {
      const animation = gltf.animations[0];
      
      // Map glTF animation tracks to VRM humanoid bones
      const humanoidTracks = [];
      
      if (animation.channels) {
        console.log('Processing', animation.channels.length, 'animation channels');
        animation.channels.forEach((channel, index) => {
          const sampler = animation.samplers[channel.sampler];
          if (sampler) {
            // Map bone name to VRM humanoid
            const nodeName = gltf.nodes[channel.target.node]?.name || 'unnamed';
            const boneName = mapToVrmBoneByName(gltf, channel.target.node);
            console.log(`Channel ${index}: node ${channel.target.node} (${nodeName}) -> ${boneName}`);
            if (boneName) {
              humanoidTracks.push({
                node: boneName,
                sampler: channel.sampler,
                target: channel.target
              });
            }
          }
        });
      }
      
      console.log('Mapped', humanoidTracks.length, 'humanoid tracks');
      
      vrma.extensions.VRMC_vrm_animation.humanoid.humanBones = humanoidTracks;
      vrma.animations = gltf.animations;
      vrma.accessors = gltf.accessors;
      vrma.bufferViews = gltf.bufferViews;
      vrma.buffers = gltf.buffers;
    }
    
    return Buffer.from(JSON.stringify(vrma, null, 2));
    
  } catch (error) {
    console.error('glTF to VRMA conversion error:', error);
    // Fallback: return original glTF data
    return await fs.readFile(gltfPath);
  }
}

// Map glTF bone by name to VRM humanoid bone names
function mapToVrmBoneByName(gltf, nodeIndex) {
  try {
    if (!gltf.nodes || !gltf.nodes[nodeIndex]) {
      return null;
    }
    
    const nodeName = gltf.nodes[nodeIndex].name || '';
    const lowerName = nodeName.toLowerCase();
    
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
      return mixamoToVrm[nodeName];
    }
    
    // Fuzzy matching for variations
    for (const [mixamoName, vrmName] of Object.entries(mixamoToVrm)) {
      if (lowerName.includes(mixamoName.toLowerCase()) || 
          nodeName.includes(mixamoName)) {
        return vrmName;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error mapping bone name:', error);
    return null;
  }
}

// Parse binary glTF (.glb) file
function parseGlbFile(buffer) {
  try {
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
    
    console.log('JSON string length:', jsonString.length);
    console.log('JSON preview:', jsonString.substring(0, 200) + '...');
    
    return JSON.parse(jsonString);
  } catch (error) {
    console.error('Failed to parse GLB file:', error);
    // Fallback: return original glTF data as buffer for inspection
    console.log('Attempting to save GLB file for manual inspection...');
    
    // Save the GLB file temporarily for inspection
    const tempPath = require('path').join(require('os').tmpdir(), 'debug_gltf.glb');
    require('fs').writeFileSync(tempPath, buffer);
    console.log('GLB file saved to:', tempPath);
    
    return {
      asset: { version: "2.0" },
      animations: [],
      nodes: []
    };
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
    const binaryPath = path.join(__dirname, '..', 'binaries', binaryName);
    
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