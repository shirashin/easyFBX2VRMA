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
      onConversionProgress: (callback: (progress: number) => void) => void;
    };
  }
}

// Converter functions will be called via IPC from main process

const dropZone = document.getElementById('drop-zone') as HTMLDivElement;
const fileInput = document.getElementById('file-input') as HTMLInputElement;
const progressSection = document.getElementById('progress-section') as HTMLDivElement;
const resultSection = document.getElementById('result-section') as HTMLDivElement;
const errorSection = document.getElementById('error-section') as HTMLDivElement;
const progressFill = document.getElementById('progress-fill') as HTMLDivElement;
const statusText = document.getElementById('status-text') as HTMLSpanElement;
const fileName = document.getElementById('file-name') as HTMLSpanElement;
const outputPath = document.getElementById('output-path') as HTMLParagraphElement;
const errorMessage = document.getElementById('error-message') as HTMLParagraphElement;
const convertAnother = document.getElementById('convert-another') as HTMLButtonElement;
const tryAgain = document.getElementById('try-again') as HTMLButtonElement;

// VRM Preview elements
const vrmViewerContainer = document.getElementById('vrm-viewer') as HTMLDivElement;
const playAnimationBtn = document.getElementById('play-animation') as HTMLButtonElement;
const stopAnimationBtn = document.getElementById('stop-animation') as HTMLButtonElement;
const resetAnimationBtn = document.getElementById('reset-animation') as HTMLButtonElement;
const animationStatus = document.getElementById('animation-status') as HTMLDivElement;

let currentFilePath: string | null = null;
let currentVrmaData: ArrayBuffer | null = null;
let vrmViewer: VRMViewer | null = null;
let animationManager: VRMAnimationManager | null = null;

// Initialize controls as disabled
playAnimationBtn.disabled = true;
stopAnimationBtn.disabled = true;
resetAnimationBtn.disabled = true;

function showSection(section: 'drop' | 'progress' | 'result' | 'error') {
  dropZone.classList.toggle('hidden', section !== 'drop');
  progressSection.classList.toggle('hidden', section !== 'progress');
  resultSection.classList.toggle('hidden', section !== 'result');
  errorSection.classList.toggle('hidden', section !== 'error');
}

function updateProgress(percent: number) {
  progressFill.style.width = `${percent}%`;
}

async function handleFile(filePath: string) {
  currentFilePath = filePath;
  const name = filePath.split(/[\\/]/).pop() || 'Unknown file';
  fileName.textContent = `Converting: ${name}`;
  
  showSection('progress');
  updateProgress(0);
  
  try {
    statusText.textContent = 'Reading FBX file...';
    updateProgress(10);
    
    statusText.textContent = 'Converting to glTF...';
    updateProgress(30);
    
    statusText.textContent = 'Processing animation data...';
    updateProgress(60);
    
    // Convert FBX to VRMA using the actual converter
    statusText.textContent = 'Converting FBX to VRMA...';
    const vrmaData = await window.electronAPI.convertFbxToVrma(filePath);
    
    statusText.textContent = 'Saving VRMA file...';
    updateProgress(90);
    
    const baseName = name.replace(/\.fbx$/i, '');
    const savePath = await window.electronAPI.saveFile(`${baseName}.vrma`);
    
    if (savePath) {
      await window.electronAPI.writeFile(savePath, vrmaData);
      updateProgress(100);
      
      outputPath.textContent = `Saved to: ${savePath}`;
      
      // Store VRMA data for preview
      currentVrmaData = vrmaData;
      
      // Initialize VRM preview
      await initializeVRMPreview();
      
      showSection('result');
    } else {
      throw new Error('Save cancelled');
    }
  } catch (error) {
    console.error('Conversion error:', error);
    errorMessage.textContent = error instanceof Error ? error.message : 'Unknown error occurred';
    showSection('error');
  }
}

dropZone.addEventListener('click', async () => {
  if (window.electronAPI) {
    const filePath = await window.electronAPI.selectFile();
    if (filePath) {
      handleFile(filePath);
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
  
  // Try to get file path from different sources
  let filePath: string | undefined;
  
  // Method 1: Try webkitGetAsEntry for Electron
  if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
    const item = e.dataTransfer.items[0];
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) {
        // Try multiple ways to get the path
        filePath = (file as any).path || (file as any).filepath;
        
        
        if (!filePath && file.name.toLowerCase().endsWith('.fbx')) {
          // Try to use the webkitRelativePath or other properties
          const fileWithPath = file as any;
          filePath = fileWithPath.webkitRelativePath || fileWithPath.mozFullPath || fileWithPath.path;
        }
      }
    }
  }
  
  // Method 2: Try files array
  if (!filePath && e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    filePath = (file as any).path || (file as any).filepath;
    
  }
  
  // Handle the file
  if (filePath && filePath.toLowerCase().endsWith('.fbx')) {
    handleFile(filePath);
  } else if (e.dataTransfer?.files[0]?.name.toLowerCase().endsWith('.fbx')) {
    const file = e.dataTransfer.files[0];
    
    if (window.electronAPI) {
      // Alternative approach: save file temporarily and get path
      try {
        // Create a temporary file path
        const tempFileName = `temp_${Date.now()}_${file.name}`;
        
        // Read file as ArrayBuffer
        const fileBuffer = await file.arrayBuffer();
        
        // Save file to temporary location and get path
        const tempFilePath = await window.electronAPI.saveTempFile(file.name, fileBuffer);
        handleFile(tempFilePath);
      } catch (error) {
        console.error('Error processing file:', error);
        alert('Error processing dropped file. Please use the file selector.');
      }
    } else {
      // Browser environment
      alert('File dropped: ' + file.name + '\nNote: Please run as Electron app for full functionality.');
    }
  } else {
    alert('Please drop an FBX file');
  }
});

fileInput.addEventListener('change', async (e) => {
  const target = e.target as HTMLInputElement;
  const files = target.files;
  if (files && files.length > 0) {
    const file = files[0];
    const filePath = (file as any).path;
    if (filePath) {
      handleFile(filePath);
    }
  }
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

    // Initialize VRM viewer
    vrmViewer = new VRMViewer(vrmViewerContainer, {
      background: 0x212121,
      cameraPosition: { x: 0, y: 1.3, z: -3 },
      cameraTarget: { x: 0, y: 1, z: 0 },
      enableShadows: true,
      enableOrbitControls: true,
      enableGround: true,
    });

    await vrmViewer.initialize();

    // Load VRM model
    const vrm = await vrmViewer.loadVRM(Character02VrmUrl);
    const mixer = vrmViewer.getMixer();

    if (mixer) {
      animationManager = new VRMAnimationManager(vrm, mixer);
    }

    vrmViewerContainer.classList.add('loaded');
    updateAnimationStatus('VRM model loaded. Ready to preview animation.');

    // Enable controls
    playAnimationBtn.disabled = false;
    stopAnimationBtn.disabled = false;
    resetAnimationBtn.disabled = false;

    console.log('VRM preview initialized successfully');
  } catch (error) {
    console.error('Failed to initialize VRM preview:', error);
    updateAnimationStatus(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

function updateAnimationStatus(message: string): void {
  animationStatus.textContent = message;
}

// VRM Animation Control Event Listeners
playAnimationBtn.addEventListener('click', async () => {
  if (!animationManager || !currentVrmaData) {
    updateAnimationStatus('No animation data available');
    return;
  }

  try {
    playAnimationBtn.disabled = true;
    updateAnimationStatus('Loading animation...');

    const clip = await animationManager.loadVRMA(currentVrmaData);
    await animationManager.playAnimation(clip, true);

    updateAnimationStatus(`Playing: ${clip.name} (${clip.duration.toFixed(1)}s)`);
  } catch (error) {
    console.error('Failed to play animation:', error);
    updateAnimationStatus(`Error: ${error instanceof Error ? error.message : 'Failed to play'}`);
  } finally {
    playAnimationBtn.disabled = false;
  }
});

stopAnimationBtn.addEventListener('click', () => {
  if (!animationManager) {
    updateAnimationStatus('No animation manager available');
    return;
  }

  animationManager.stopAnimation();
  updateAnimationStatus('Animation stopped');
});

resetAnimationBtn.addEventListener('click', () => {
  if (!animationManager) {
    updateAnimationStatus('No animation manager available');
    return;
  }

  animationManager.resetPose();
  updateAnimationStatus('Pose reset to T-pose');
});

convertAnother.addEventListener('click', () => {
  // Dispose VRM preview
  if (vrmViewer) {
    vrmViewer.dispose();
    vrmViewer = null;
    animationManager = null;
  }
  
  showSection('drop');
  currentFilePath = null;
  currentVrmaData = null;
  
  // Reset controls
  playAnimationBtn.disabled = true;
  stopAnimationBtn.disabled = true;
  resetAnimationBtn.disabled = true;
  updateAnimationStatus('');
});

tryAgain.addEventListener('click', () => {
  if (currentFilePath) {
    handleFile(currentFilePath);
  } else {
    showSection('drop');
  }
});

// Listen for native Electron file drop events
if (window.electronAPI && window.electronAPI.onFileDropped) {
  window.electronAPI.onFileDropped((filePath: string) => {
    handleFile(filePath);
  });
}

// Listen for conversion progress updates
if (window.electronAPI && window.electronAPI.onConversionProgress) {
  window.electronAPI.onConversionProgress((progress: number) => {
    updateProgress(progress);
  });
}