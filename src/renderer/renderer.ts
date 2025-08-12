declare global {
  interface Window {
    electronAPI: {
      selectFile: () => Promise<string | null>;
      saveFile: (fileName: string) => Promise<string | null>;
      readFile: (filePath: string) => Promise<ArrayBuffer>;
      writeFile: (filePath: string, data: ArrayBuffer) => Promise<boolean>;
      onConvertProgress: (callback: (progress: number) => void) => void;
    };
  }
}

import { convertFBXToVRMA } from '../converter/converter';

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

let currentFilePath: string | null = null;

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
    
    const vrmaData = await convertFBXToVRMA(filePath, (progress) => {
      updateProgress(30 + progress * 0.5);
    });
    
    statusText.textContent = 'Saving VRMA file...';
    updateProgress(90);
    
    const baseName = name.replace(/\.fbx$/i, '');
    const savePath = await window.electronAPI.saveFile(`${baseName}.vrma`);
    
    if (savePath) {
      await window.electronAPI.writeFile(savePath, vrmaData);
      updateProgress(100);
      
      outputPath.textContent = `Saved to: ${savePath}`;
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
  const filePath = await window.electronAPI.selectFile();
  if (filePath) {
    handleFile(filePath);
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
  dropZone.classList.remove('dragover');
  
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    const file = files[0];
    if (file.path && file.path.toLowerCase().endsWith('.fbx')) {
      handleFile(file.path);
    } else {
      alert('Please drop an FBX file');
    }
  }
});

fileInput.addEventListener('change', async (e) => {
  const target = e.target as HTMLInputElement;
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