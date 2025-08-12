import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { fileURLToPath } from 'url';
import { app } from 'electron';

const execAsync = promisify(exec);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class FBX2glTFManager {
  private binaryPath: string;

  constructor() {
    const platform = process.platform;
    const binaryName = platform === 'win32' ? 'FBX2glTF.exe' : 'FBX2glTF';
    
    if (app.isPackaged) {
      this.binaryPath = path.join(process.resourcesPath, 'binaries', binaryName);
    } else {
      this.binaryPath = path.join(__dirname, '../../binaries', binaryName);
    }
  }

  async checkBinary(): Promise<boolean> {
    try {
      await fs.access(this.binaryPath);
      return true;
    } catch {
      return false;
    }
  }

  async convertToGLTF(fbxPath: string, outputPath: string): Promise<void> {
    if (!(await this.checkBinary())) {
      throw new Error('FBX2glTF binary not found. Please ensure it is in the binaries folder.');
    }

    const command = `"${this.binaryPath}" --binary --verbose --input "${fbxPath}" --output "${outputPath}"`;
    
    try {
      const { stdout, stderr } = await execAsync(command);
      if (stderr && !stderr.includes('Warning')) {
        console.warn('FBX2glTF warnings:', stderr);
      }
      console.log('FBX2glTF output:', stdout);
    } catch (error) {
      console.error('FBX2glTF error:', error);
      throw new Error(`Failed to convert FBX to glTF: ${error}`);
    }
  }
}

export const fbx2gltfManager = new FBX2glTFManager();