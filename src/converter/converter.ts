import { ipcRenderer } from 'electron';
import path from 'path';
import fs from 'fs/promises';
import { fbx2gltfManager } from './fbx2gltf-manager';
import { gltfToVRMAConverter } from './gltf-to-vrma';
import os from 'os';

export async function convertFBXToVRMA(
  fbxPath: string,
  onProgress?: (progress: number) => void
): Promise<ArrayBuffer> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fbx2vrma-'));
  const gltfPath = path.join(tempDir, 'temp.glb');
  
  try {
    onProgress?.(10);
    
    await fbx2gltfManager.convertToGLTF(fbxPath, gltfPath);
    
    onProgress?.(50);
    
    const vrmaBuffer = await gltfToVRMAConverter.convert(gltfPath, {
      onProgress: (gltfProgress) => {
        const totalProgress = 50 + (gltfProgress * 0.5);
        onProgress?.(totalProgress);
      },
    });
    
    return vrmaBuffer;
  } finally {
    try {
      await fs.rm(tempDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to clean up temp directory:', error);
    }
  }
}

export async function convertWithIPC(
  fbxPath: string
): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    let vrmaData: ArrayBuffer | null = null;
    
    const handleProgress = (_: any, progress: number) => {
      ipcRenderer.send('conversion-progress', progress);
    };
    
    ipcRenderer.on('convert-progress', handleProgress);
    
    convertFBXToVRMA(fbxPath, (progress) => {
      ipcRenderer.send('conversion-progress', progress);
    })
      .then((data) => {
        vrmaData = data;
        ipcRenderer.removeListener('convert-progress', handleProgress);
        resolve(data);
      })
      .catch((error) => {
        ipcRenderer.removeListener('convert-progress', handleProgress);
        reject(error);
      });
  });
}