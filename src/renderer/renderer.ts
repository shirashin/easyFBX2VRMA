import { VRMViewer } from './components/VRMViewer.js';
import { VRMAnimationManager } from './components/VRMAnimationManager.js';
import Character02VrmUrl from './assets/models/Character02.vrm?url';

declare global {
  interface Window {
    electronAPI: {
      selectFile: () => Promise<string | null>;
      saveFile: (fileName: string) => Promise<string | null>;
      readFile: (filePath: string) => Promise<ArrayBuffer>;
      writeFile: (filePath: string, data: ArrayBuffer) => Promise<boolean>;
      saveTempFile: (fileName: string, fileData: ArrayBuffer) => Promise<string>;
      onConvertProgress: (callback: (progress: number) => void) => void;
      onFileDropped: (callback: (filePath: string) => void) => void;
      convertFbxToVrma: (fbxPath: string) => Promise<ArrayBuffer>;
      loadConfig: () => Promise<any>;
      onConversionProgress: (callback: (progress: number) => void) => void;
      resizeWindow: (width: number, height: number) => Promise<void>;
      selectVrmFile: () => Promise<string | null>;
    };
  }
}

// Converter functions will be called via IPC from main process

const dropZone = document.getElementById('drop-zone') as HTMLDivElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const progressSection = document.getElementById('progress-section') as HTMLDivElement;
// const resultSection = document.getElementById('result-section') as HTMLDivElement; // Removed - not needed anymore
const errorSection = document.getElementById('error-section') as HTMLDivElement;
const progressFill = document.getElementById('progress-fill') as HTMLDivElement;
const statusText = document.getElementById('status-text') as HTMLSpanElement;
const fileName = document.getElementById('file-name') as HTMLSpanElement;
// const outputPath = document.getElementById('output-path') as HTMLParagraphElement; // Removed - element no longer exists
const errorMessage = document.getElementById('error-message') as HTMLParagraphElement;
const tryAgain = document.getElementById('try-again') as HTMLButtonElement;

// Setup elements
const setupSection = document.getElementById('setup-section') as HTMLDivElement;
const setupMessage = document.getElementById('setup-message') as HTMLParagraphElement;
const setupProgressFill = document.getElementById('setup-progress-fill') as HTMLDivElement;
const setupProgressText = document.getElementById('setup-progress-text') as HTMLDivElement;

// VRM Preview elements
const vrmViewerContainer = document.getElementById('vrm-viewer') as HTMLDivElement;
const toggleAnimationBtn = document.getElementById('toggle-animation') as HTMLButtonElement;
const changeCharacterBtn = document.getElementById('change-character') as HTMLButtonElement;
const backgroundColorBtn = document.getElementById('background-color') as HTMLButtonElement;
const animationStatus = document.getElementById('animation-status') as HTMLDivElement;

// Color picker elements
const colorPickerModal = document.getElementById('color-picker-modal') as HTMLDivElement;
const colorPresets = document.querySelectorAll('.color-preset') as NodeListOf<HTMLButtonElement>;
const colorInput = document.getElementById('color-input') as HTMLInputElement;
const applyColorBtn = document.getElementById('apply-color') as HTMLButtonElement;
const cancelColorBtn = document.getElementById('cancel-color') as HTMLButtonElement;

// Batch conversion elements
const batchProgressSection = document.getElementById('batch-progress-section') as HTMLDivElement;
const batchFileCount = document.getElementById('batch-file-count') as HTMLSpanElement;
const batchProgressFill = document.getElementById('batch-progress-fill') as HTMLDivElement;
const batchStatusText = document.getElementById('batch-status-text') as HTMLSpanElement;

// Log elements
const logSection = document.getElementById('log-section') as HTMLDivElement;
const conversionLog = document.getElementById('conversion-log') as HTMLDivElement;

// File selector elements
const fileSelector = document.getElementById('file-selector') as HTMLDivElement;
const fileButtons = document.getElementById('file-buttons') as HTMLDivElement;

let currentFilePath: string | null = null;
let currentVrmaData: ArrayBuffer | null = null;
let vrmViewer: VRMViewer | null = null;
let animationManager: VRMAnimationManager | null = null;

// Animation state for character swapping
let currentAnimationClip: any = null;
let isAnimationPlaying = false;

// Current character and background settings
let currentVrmPath: string | null = null;
let currentBackgroundColor: number = 0x212121;

// Batch conversion state
let batchConversionFiles: string[] = [];
let convertedFiles: {name: string, data: ArrayBuffer}[] = [];
let currentBatchIndex = 0;
let maxFilesLimit = 30;

// Initialize controls as disabled
toggleAnimationBtn.disabled = true;

function showSection(section: 'setup' | 'drop' | 'progress' | 'error' | 'batch') {
  // Setup section is handled differently (full screen overlay)
  setupSection.classList.toggle('hidden', section !== 'setup');
  
  // For main app, show drop zone unless it's setup
  dropZone.classList.toggle('hidden', section === 'setup');
  
  // Hide all status sections first
  progressSection.classList.add('hidden');
  batchProgressSection.classList.add('hidden');
  errorSection.classList.add('hidden');
  
  // Show appropriate status section
  if (section === 'progress') {
    progressSection.classList.remove('hidden');
  } else if (section === 'batch') {
    batchProgressSection.classList.remove('hidden');
  } else if (section === 'error') {
    errorSection.classList.remove('hidden');
  }
}

function updateProgress(percent: number) {
  progressFill.style.width = `${percent}%`;
}

function updateSetupProgress(percent: number, message?: string) {
  setupProgressFill.style.width = `${percent}%`;
  setupProgressText.textContent = `${percent}%`;
  if (message) {
    setupMessage.textContent = message;
  }
}

// Batch conversion helper functions
function updateBatchProgress(current: number, total: number) {
  const percent = total > 0 ? Math.round((current / total) * 100) : 0;
  batchProgressFill.style.width = `${percent}%`;
  batchFileCount.textContent = `${current}/${total} files processed`;
}

function addLogEntry(message: string, type: 'info' | 'success' | 'error' | 'warning' = 'info') {
  const timestamp = new Date().toLocaleTimeString();
  const logEntry = document.createElement('div');
  logEntry.className = `log-entry ${type}`;
  logEntry.textContent = `[${timestamp}] ${message}`;
  conversionLog.appendChild(logEntry);
  
  // Auto-scroll to bottom
  conversionLog.scrollTop = conversionLog.scrollHeight;
}

async function loadConfig(): Promise<any> {
  try {
    if (window.electronAPI && window.electronAPI.loadConfig) {
      const config = await window.electronAPI.loadConfig();
      maxFilesLimit = config.batchConversion?.maxFiles || 30;
      return config;
    } else {
      console.warn('electronAPI.loadConfig not available, using defaults');
      return { batchConversion: { maxFiles: 30 } };
    }
  } catch (error) {
    console.warn('Could not load config.json, using defaults:', error);
    return { batchConversion: { maxFiles: 30 } };
  }
}

function validateFileCount(files: FileList | File[] | string[]): boolean {
  if (files.length > maxFilesLimit) {
    alert(`最大${maxFilesLimit}ファイルまで対応しています。選択されたファイル数: ${files.length}`);
    return false;
  }
  return true;
}

function getFileNameWithoutExtension(fileName: string): string {
  return fileName.replace(/\.[^/.]+$/, '');
}

function updateFileSelector() {
  // Always show file selector now
  fileSelector.classList.remove('hidden');
  fileButtons.innerHTML = '';
  
  convertedFiles.forEach((file, index) => {
    const button = document.createElement('button');
    button.className = 'file-button';
    button.textContent = getFileNameWithoutExtension(file.name);
    button.onclick = () => switchToAnimation(index);
    
    if (index === 0) {
      button.classList.add('active');
    }
    
    fileButtons.appendChild(button);
  });
}

async function switchToAnimation(index: number) {
  if (index < 0 || index >= convertedFiles.length) return;
  
  // Update active button
  const buttons = fileButtons.querySelectorAll('.file-button');
  buttons.forEach((btn, i) => {
    btn.classList.toggle('active', i === index);
  });
  
  // Load selected animation
  const selectedFile = convertedFiles[index];
  currentVrmaData = selectedFile.data;
  
  if (vrmViewer && animationManager) {
    try {
      updateAnimationStatus(`Loading: ${getFileNameWithoutExtension(selectedFile.name)}...`);
      
      // Load and automatically play the new animation
      const clip = await animationManager.loadVRMA(selectedFile.data);
      
      // Update UI to reflect playing state
      updateToggleButton('Stop', '⏸');
      toggleAnimationBtn.disabled = false;
      updateAnimationStatus(`Playing: ${getFileNameWithoutExtension(selectedFile.name)} (${clip.duration.toFixed(1)}s)`);
      
      console.log(`Switched to animation: ${selectedFile.name}`);
    } catch (error) {
      console.error('Error switching animation:', error);
      updateAnimationStatus(`Error loading: ${getFileNameWithoutExtension(selectedFile.name)}`);
    }
  }
}

// Unified conversion handler - replaces both handleFile and handleBatchFiles
async function handleConversion(filePaths: string[]) {
  if (!validateFileCount(filePaths)) {
    return;
  }
  
  // Reset state
  convertedFiles = [];
  currentBatchIndex = 0;
  
  // Determine if single or batch conversion
  const isBatch = filePaths.length > 1;
  
  if (isBatch) {
    showSection('batch');
    addLogEntry(`一括変換開始: ${filePaths.length}ファイル`, 'info');
    batchStatusText.textContent = '一括変換中...';
    updateBatchProgress(0, filePaths.length);
  } else {
    showSection('progress');
    const name = filePaths[0].split(/[\\/]/).pop() || 'Unknown file';
    fileName.textContent = `Converting: ${name}`;
    updateProgress(0);
    addLogEntry(`変換開始: ${name}`, 'info');
  }
  
  // Process all files
  for (let i = 0; i < filePaths.length; i++) {
    const filePath = filePaths[i];
    const fileName = filePath.split(/[\\/]/).pop() || `File${i + 1}`;
    
    try {
      if (isBatch) {
        addLogEntry(`${fileName} 変換開始`, 'info');
        batchStatusText.textContent = `Converting: ${fileName}`;
      } else {
        statusText.textContent = 'Reading FBX file...';
        updateProgress(10);
        addLogEntry(`${fileName} 変換処理中...`, 'info');
      }
      
      // Convert FBX to VRMA
      const vrmaData = await window.electronAPI.convertFbxToVrma(filePath);
      
      // Store converted data
      convertedFiles.push({
        name: fileName,
        data: vrmaData
      });
      
      if (isBatch) {
        addLogEntry(`${fileName} 変換完了`, 'success');
        updateBatchProgress(i + 1, filePaths.length);
      } else {
        statusText.textContent = 'Conversion completed!';
        updateProgress(100);
        addLogEntry(`${fileName} 変換完了`, 'success');
      }
      
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      
      if (isBatch) {
        addLogEntry(`${fileName} エラー: ${errorMsg}`, 'error');
        console.error(`Error converting ${fileName}:`, error);
        updateBatchProgress(i + 1, filePaths.length);
      } else {
        addLogEntry(`${fileName} エラー: ${errorMsg}`, 'error');
        console.error('Conversion error:', error);
        errorMessage.textContent = errorMsg;
        showSection('error');
        return;
      }
    }
  }
  
  // Save results
  if (convertedFiles.length > 0) {
    await saveResults(convertedFiles, isBatch);
    
    // Initialize VRM preview with first file
    currentVrmaData = convertedFiles[0].data;
    await initializeVRMPreview();
    updateFileSelector();
    
    if (isBatch) {
      batchStatusText.textContent = `完了: ${convertedFiles.length}/${filePaths.length}ファイル変換成功`;
      addLogEntry(`一括変換完了: ${convertedFiles.length}/${filePaths.length}ファイル成功`, 'success');
    } else {
      addLogEntry(`変換完了: ${convertedFiles[0].name}`, 'success');
    }
    
    showSection('drop');
  } else if (isBatch) {
    addLogEntry('すべてのファイルの変換に失敗しました', 'error');
    errorMessage.textContent = 'すべてのファイルの変換に失敗しました';
    showSection('error');
  }
}

// Save results as single file or ZIP
async function saveResults(convertedFiles: {name: string, data: ArrayBuffer}[], isBatch: boolean) {
  try {
    if (isBatch) {
      // Save as ZIP
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      
      convertedFiles.forEach(file => {
        const baseName = getFileNameWithoutExtension(file.name);
        zip.file(`${baseName}.vrma`, file.data);
      });
      
      const zipContent = await zip.generateAsync({ type: 'uint8array' });
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:.]/g, '-');
      const zipFileName = `converted_animations_${timestamp}.zip`;
      const savePath = await window.electronAPI.saveFile(zipFileName);
      
      if (savePath) {
        const arrayBuffer = new ArrayBuffer(zipContent.byteLength);
        const view = new Uint8Array(arrayBuffer);
        view.set(zipContent);
        await window.electronAPI.writeFile(savePath, arrayBuffer);
        // outputPath.textContent = `Saved to: ${savePath}`; // Removed - using log instead
        addLogEntry(`ZIPファイル保存完了: ${savePath}`, 'success');
      } else {
        throw new Error('ZIP保存がキャンセルされました');
      }
    } else {
      // Save single VRMA file
      const file = convertedFiles[0];
      const baseName = getFileNameWithoutExtension(file.name);
      const savePath = await window.electronAPI.saveFile(`${baseName}.vrma`);
      
      if (savePath) {
        await window.electronAPI.writeFile(savePath, file.data);
        // outputPath.textContent = `Saved to: ${savePath}`; // Removed - using log instead
        addLogEntry(`VRMAファイル保存完了: ${savePath}`, 'success');
      } else {
        throw new Error('Save cancelled');
      }
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Save error';
    addLogEntry(`保存エラー: ${errorMsg}`, 'error');
    throw error;
  }
}

// Legacy function for backward compatibility - now calls unified handler
async function handleFile(filePath: string) {
  await handleConversion([filePath]);
}

// Legacy function for backward compatibility - now calls unified handler
async function handleBatchFiles(filePaths: string[]) {
  await handleConversion(filePaths);
}

dropZone.addEventListener('click', async () => {
  if (window.electronAPI) {
    const filePath = await window.electronAPI.selectFile();
    if (filePath) {
      handleConversion([filePath]);
    }
  } else {
    // Browser fallback
    fileInput.click();
  }
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});

dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});

dropZone.addEventListener('drop', async (e) => {
  e.preventDefault();
  e.stopPropagation();
  dropZone.classList.remove('dragover');
  
  if (!e.dataTransfer?.files || e.dataTransfer.files.length === 0) {
    alert('ファイルが見つかりません');
    return;
  }
  
  // Filter only FBX files
  const files = Array.from(e.dataTransfer.files);
  const fbxFiles = files.filter(file => file.name.toLowerCase().endsWith('.fbx'));
  
  if (fbxFiles.length === 0) {
    alert('FBXファイルをドロップしてください');
    return;
  }
  
  // Get file paths for all FBX files
  const filePaths: string[] = [];
  
  for (const file of fbxFiles) {
    let filePath: string | undefined = (file as any).path || (file as any).filepath;
    
    if (!filePath && window.electronAPI) {
      // Fallback: save file temporarily and get path
      try {
        const fileBuffer = await file.arrayBuffer();
        const tempFilePath = await window.electronAPI.saveTempFile(file.name, fileBuffer);
        filePath = tempFilePath;
      } catch (error) {
        console.error('Error processing file:', file.name, error);
        continue;
      }
    }
    
    if (filePath) {
      filePaths.push(filePath);
    }
  }
  
  if (filePaths.length === 0) {
    alert('ファイルパスの取得に失敗しました');
    return;
  }
  
  // Use unified conversion handler
  handleConversion(filePaths);
});

fileInput.addEventListener('change', async (e) => {
  const target = e.target as HTMLInputElement;
  const files = target.files;
  
  if (!files || files.length === 0) {
    return;
  }
  
  // Filter only FBX files
  const fbxFiles = Array.from(files).filter(file => file.name.toLowerCase().endsWith('.fbx'));
  
  if (fbxFiles.length === 0) {
    alert('FBXファイルを選択してください');
    return;
  }
  
  // Get file paths
  const filePaths: string[] = [];
  
  for (const file of fbxFiles) {
    const filePath = (file as any).path;
    if (filePath) {
      filePaths.push(filePath);
    }
  }
  
  if (filePaths.length === 0) {
    alert('ファイルパスの取得に失敗しました');
    return;
  }
  
  // Use unified conversion handler
  handleConversion(filePaths);
  
  // Reset file input
  target.value = '';
});

// VRM Preview Functions
async function initializeVRMPreview(): Promise<void> {
  try {
    // Dispose existing viewer
    if (vrmViewer) {
      vrmViewer.dispose();
      vrmViewer = null;
      animationManager = null;
    }

    // Clear container
    vrmViewerContainer.innerHTML = '';
    vrmViewerContainer.classList.remove('loaded');

    // Initialize VRM viewer with current background color
    vrmViewer = new VRMViewer(vrmViewerContainer, {
      background: currentBackgroundColor,
      cameraPosition: { x: 0, y: 1.3, z: 1.5 },
      cameraTarget: { x: 0, y: 1, z: 0 },
      enableShadows: true,
      enableOrbitControls: true,
      enableGround: false,
    });

    await vrmViewer.initialize();

    // Load VRM model (use custom character if set, otherwise default)
    const vrmUrl = currentVrmPath || Character02VrmUrl;
    const vrm = currentVrmPath ? 
      await vrmViewer.swapCharacter(currentVrmPath) : 
      await vrmViewer.loadVRM(vrmUrl);
    const mixer = vrmViewer.getMixer();

    if (mixer) {
      animationManager = new VRMAnimationManager(vrm, mixer);
    }

    vrmViewerContainer.classList.add('loaded');

    // Auto-play animation if VRMA data is available
    if (animationManager && currentVrmaData) {
      try {
        updateAnimationStatus('Loading and starting animation...');
        const clip = await animationManager.loadVRMA(currentVrmaData);
        await animationManager.playAnimation(clip, true);
        
        // Set button to Stop since animation is now playing
        updateToggleButton('Stop', '⏸');
        toggleAnimationBtn.disabled = false;
        updateAnimationStatus(`Playing: ${clip.name} (${clip.duration.toFixed(1)}s)`);
        
        console.log('VRM animation auto-started successfully');
      } catch (error) {
        console.error('Failed to auto-start animation:', error);
        updateAnimationStatus('VRM model loaded. Animation auto-start failed.');
        updateToggleButton('Play', '▶');
        toggleAnimationBtn.disabled = false;
      }
    } else {
      updateAnimationStatus('VRM model loaded. Ready to preview animation.');
      toggleAnimationBtn.disabled = false;
    }

    console.log('VRM preview initialized successfully');
  } catch (error) {
    console.error('Failed to initialize VRM preview:', error);
    updateAnimationStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function updateAnimationStatus(message: string): void {
  animationStatus.textContent = message;
}

function updateToggleButton(text: string, icon: string): void {
  const btnText = toggleAnimationBtn.querySelector('.btn-text');
  const btnIcon = toggleAnimationBtn.querySelector('.btn-icon');
  if (btnText) btnText.textContent = text;
  if (btnIcon) btnIcon.textContent = icon;
}

// VRM Animation Control Event Listener
toggleAnimationBtn.addEventListener('click', async () => {
  if (!animationManager) {
    updateAnimationStatus('No animation manager available');
    return;
  }

  try {
    // アニメーションが読み込まれていない場合は最初に読み込む
    if (!animationManager.getCurrentClip() && currentVrmaData) {
      toggleAnimationBtn.disabled = true;
      updateAnimationStatus('Loading animation...');
      
      const clip = await animationManager.loadVRMA(currentVrmaData);
      await animationManager.playAnimation(clip, true);
      
      currentAnimationClip = clip;
      isAnimationPlaying = true;
      updateToggleButton('Stop', '⏸');
      updateAnimationStatus(`Playing: ${clip.name} (${clip.duration.toFixed(1)}s)`);
    } else {
      // 既に読み込まれている場合は一時停止/再開をトグル
      const playState = animationManager.getPlayState();
      
      if (playState.isPlaying) {
        animationManager.toggleAnimation();
        isAnimationPlaying = false;
        updateToggleButton('Play', '▶');
        updateAnimationStatus('Animation paused');
      } else {
        animationManager.toggleAnimation();
        isAnimationPlaying = true;
        updateToggleButton('Stop', '⏸');
        updateAnimationStatus(`Playing: ${playState.clipName || 'Animation'}`);
      }
    }
  } catch (error) {
    console.error('Failed to toggle animation:', error);
    updateAnimationStatus(`Error: ${error instanceof Error ? error.message : 'Failed to toggle'}`);
  } finally {
    toggleAnimationBtn.disabled = false;
  }
});


tryAgain.addEventListener('click', () => {
  if (currentFilePath) {
    handleConversion([currentFilePath]);
  } else {
    showSection('drop');
  }
});

// Character Change Event Handler
changeCharacterBtn.addEventListener('click', async () => {
  try {
    // Fallback to selectFile if selectVrmFile is not available
    const vrmFilePath = window.electronAPI.selectVrmFile ? 
      await window.electronAPI.selectVrmFile() : 
      await window.electronAPI.selectFile();
    if (vrmFilePath && vrmViewer) {
      // Validate file extension
      if (!vrmFilePath.toLowerCase().endsWith('.vrm')) {
        addLogEntry('VRMファイルを選択してください', 'error');
        return;
      }
      // Save current animation state
      if (animationManager) {
        currentAnimationClip = animationManager.getCurrentClip();
        const playState = animationManager.getPlayState();
        isAnimationPlaying = playState.isPlaying;
      }

      // Swap character
      const newVrm = await vrmViewer.swapCharacter(vrmFilePath);
      currentVrmPath = vrmFilePath; // Save current character path
      
      // Recreate animation manager with new VRM
      const mixer = vrmViewer.getMixer();
      if (mixer) {
        animationManager = new VRMAnimationManager(newVrm, mixer);
        
        // Restore animation if it was playing
        if (currentAnimationClip && currentVrmaData) {
          try {
            const clip = await animationManager.loadVRMA(currentVrmaData);
            if (isAnimationPlaying) {
              await animationManager.playAnimation(clip, true);
              updateToggleButton('Stop', '⏸');
              updateAnimationStatus(`Playing: ${clip.name} (${clip.duration.toFixed(1)}s)`);
            } else {
              updateAnimationStatus(`Ready: ${clip.name} (${clip.duration.toFixed(1)}s)`);
            }
          } catch (error) {
            console.error('Failed to restore animation:', error);
            updateAnimationStatus('Animation could not be restored');
          }
        }
      }
      
      addLogEntry('キャラクターを変更しました', 'success');
    }
  } catch (error) {
    console.error('Error changing character:', error);
    addLogEntry(`キャラクター変更エラー: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
  }
});

// Background Color Event Handlers
backgroundColorBtn.addEventListener('click', () => {
  colorPickerModal.classList.remove('hidden');
});

// Color preset selection
colorPresets.forEach(preset => {
  preset.addEventListener('click', () => {
    const color = preset.getAttribute('data-color');
    if (color) {
      colorInput.value = color;
      // Remove selected class from all presets
      colorPresets.forEach(p => p.classList.remove('selected'));
      // Add selected class to clicked preset
      preset.classList.add('selected');
    }
  });
});

applyColorBtn.addEventListener('click', () => {
  const colorValue = colorInput.value;
  const colorNumber = parseInt(colorValue.replace('#', ''), 16);
  
  if (vrmViewer) {
    vrmViewer.setBackgroundColor(colorNumber);
    currentBackgroundColor = colorNumber; // Save current color
    addLogEntry(`背景色を変更しました: ${colorValue}`, 'info');
  }
  
  colorPickerModal.classList.add('hidden');
});

cancelColorBtn.addEventListener('click', () => {
  colorPickerModal.classList.add('hidden');
});

// Close modal when clicking outside
colorPickerModal.addEventListener('click', (e) => {
  if (e.target === colorPickerModal) {
    colorPickerModal.classList.add('hidden');
  }
});

// FBX2glTF Download Event Handlers
if (window.electronAPI) {
  // Handle download start
  if (typeof (window.electronAPI as any).onFBX2glTFDownloadStart === 'function') {
    (window.electronAPI as any).onFBX2glTFDownloadStart(() => {
      showSection('setup');
      updateSetupProgress(0, 'FBX2glTFをダウンロードしています...');
    });
  }

  // Handle download progress
  if (typeof (window.electronAPI as any).onFBX2glTFDownloadProgress === 'function') {
    (window.electronAPI as any).onFBX2glTFDownloadProgress((progress: number) => {
      updateSetupProgress(progress, `FBX2glTFをダウンロード中... (${progress}%)`);
    });
  }

  // Handle download complete
  if (typeof (window.electronAPI as any).onFBX2glTFDownloadComplete === 'function') {
    (window.electronAPI as any).onFBX2glTFDownloadComplete(() => {
      updateSetupProgress(100, 'ダウンロード完了！');
      setTimeout(() => {
        showSection('drop');
      }, 1000);
    });
  }

  // Handle download error
  if (typeof (window.electronAPI as any).onFBX2glTFDownloadError === 'function') {
    (window.electronAPI as any).onFBX2glTFDownloadError((error: string) => {
      setupMessage.textContent = `ダウンロードエラー: ${error}`;
      setupProgressText.textContent = 'エラー';
      setTimeout(() => {
        showSection('drop');
      }, 3000);
    });
  }

  // Handle FBX2glTF ready
  if (typeof (window.electronAPI as any).onFBX2glTFReady === 'function') {
    (window.electronAPI as any).onFBX2glTFReady(() => {
      // FBX2glTF already exists, show normal interface
      showSection('drop');
    });
  }
}

// Listen for native Electron file drop events
if (window.electronAPI && window.electronAPI.onFileDropped) {
  window.electronAPI.onFileDropped((filePath: string) => {
    handleConversion([filePath]);
  });
}

// Listen for conversion progress updates
if (window.electronAPI && window.electronAPI.onConversionProgress) {
  window.electronAPI.onConversionProgress((progress: number) => {
    updateProgress(progress);
  });
}

// Adjust window size to fit content
function adjustWindowSize() {
  if (window.electronAPI) {
    const container = document.querySelector('.main-container') as HTMLElement;
    if (container) {
      const rect = container.getBoundingClientRect();
      const requiredWidth = rect.width + 60; // Add margin for better fit
      const requiredHeight = rect.height + 60;
      
      // Request window resize from main process
      window.electronAPI.resizeWindow(requiredWidth, requiredHeight);
    }
  }
}

// Initialize application
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Load configuration
    await loadConfig();
    
    // Update UI with loaded config
    const dropText = document.querySelector('.drop-text');
    if (dropText) {
      dropText.textContent = `Drag and drop FBX files here (1-${maxFilesLimit} files)`;
    }
    
    // Initialize VRM preview with default T-pose
    await initializeVRMPreview();
    
    // Add initial log message
    addLogEntry('アプリケーションが起動しました。FBXファイルをドラッグ&ドロップして変換を開始してください。', 'info');
    
    // Adjust window size to fit content
    setTimeout(() => {
      adjustWindowSize();
    }, 100);
    
    console.log(`Application initialized. Max files limit: ${maxFilesLimit}`);
  } catch (error) {
    console.error('Initialization error:', error);
  }
});