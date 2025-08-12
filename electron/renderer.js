const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const progressSection = document.getElementById('progress-section');
const resultSection = document.getElementById('result-section');
const errorSection = document.getElementById('error-section');
const progressFill = document.getElementById('progress-fill');
const statusText = document.getElementById('status-text');
const fileName = document.getElementById('file-name');
const outputPath = document.getElementById('output-path');
const errorMessage = document.getElementById('error-message');
const convertAnother = document.getElementById('convert-another');
const tryAgain = document.getElementById('try-again');

// VRM Viewer elements
const vrmViewer = document.getElementById('vrm-viewer');
const playAnimation = document.getElementById('play-animation');
const pauseAnimation = document.getElementById('pause-animation');
const resetAnimation = document.getElementById('reset-animation');

let currentFilePath = null;
let currentVrmaPath = null;

// Three.js scene variables
let scene, camera, renderer, vrm, mixer, clock;
let animationAction = null;

function showSection(section) {
  dropZone.classList.toggle('hidden', section !== 'drop');
  progressSection.classList.toggle('hidden', section !== 'progress');
  resultSection.classList.toggle('hidden', section !== 'result');
  errorSection.classList.toggle('hidden', section !== 'error');
}

function updateProgress(percent) {
  progressFill.style.width = `${percent}%`;
}

// Placeholder functions for future 3D implementation

async function handleFile(filePath) {
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
      
      currentVrmaPath = savePath;
      outputPath.textContent = `Saved to: ${savePath}`;
      
      // Show preview section (simplified version for now)
      const previewSection = document.querySelector('.preview-section');
      if (previewSection) {
        const viewerElement = document.getElementById('vrm-viewer');
        viewerElement.innerHTML = '<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: white; font-size: 14px; text-align: center;"><div style="margin-bottom: 10px;">✅ VRMA File Generated Successfully</div><div style="font-size: 12px; opacity: 0.8;">3D Preview: Coming in future update</div></div>';
      }
      
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
  let filePath;
  
  // Method 1: Try webkitGetAsEntry for Electron
  if (e.dataTransfer?.items && e.dataTransfer.items.length > 0) {
    const item = e.dataTransfer.items[0];
    if (item.kind === 'file') {
      const file = item.getAsFile();
      if (file) {
        // Try multiple ways to get the path
        filePath = file.path || file.filepath;
        
        if (!filePath && file.name.toLowerCase().endsWith('.fbx')) {
          // Try to use the webkitRelativePath or other properties
          const fileWithPath = file;
          filePath = fileWithPath.webkitRelativePath || fileWithPath.mozFullPath || fileWithPath.path;
        }
      }
    }
  }
  
  // Method 2: Try files array
  if (!filePath && e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
    const file = e.dataTransfer.files[0];
    filePath = file.path || file.filepath;
  }
  
  // Handle the file
  if (filePath && filePath.toLowerCase().endsWith('.fbx')) {
    handleFile(filePath);
  } else if (e.dataTransfer?.files[0]?.name.toLowerCase().endsWith('.fbx')) {
    const file = e.dataTransfer.files[0];
    
    if (window.electronAPI) {
      // Alternative approach: save file temporarily and get path
      try {
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
  const target = e.target;
  const files = target.files;
  if (files && files.length > 0) {
    const file = files[0];
    if (file.path) {
      handleFile(file.path);
    }
  }
});

convertAnother.addEventListener('click', () => {
  showSection('drop');
  currentFilePath = null;
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
  window.electronAPI.onFileDropped((filePath) => {
    handleFile(filePath);
  });
}

// Listen for conversion progress updates
if (window.electronAPI && window.electronAPI.onConversionProgress) {
  window.electronAPI.onConversionProgress((progress) => {
    updateProgress(progress);
  });
}

// Animation control event listeners (placeholder for future implementation)
playAnimation.addEventListener('click', () => {
  console.log('Animation controls coming in future update');
});

pauseAnimation.addEventListener('click', () => {
  console.log('Animation controls coming in future update');
});

resetAnimation.addEventListener('click', () => {
  console.log('Animation controls coming in future update');
});