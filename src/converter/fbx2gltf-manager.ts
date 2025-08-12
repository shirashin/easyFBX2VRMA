import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { app } from 'electron';
import https from 'https';

const execAsync = promisify(exec);

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

export class FBX2glTFManager {
  private binaryPath: string;
  private binaryDir: string;

  constructor() {
    const platform = process.platform;
    const binaryName = platform === 'win32' ? 'FBX2glTF.exe' : 'FBX2glTF';
    
    if (app.isPackaged) {
      this.binaryDir = path.join(process.resourcesPath, 'binaries');
      this.binaryPath = path.join(this.binaryDir, binaryName);
    } else {
      this.binaryDir = path.join(__dirname, '../../../binaries');
      this.binaryPath = path.join(this.binaryDir, binaryName);
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

  async downloadBinary(progressCallback?: (progress: number) => void): Promise<void> {
    const platform = process.platform;
    const download = DOWNLOADS[platform as keyof typeof DOWNLOADS];
    
    if (!download) {
      throw new Error(`Unsupported platform: ${platform}`);
    }

    try {
      // Create binaries directory if it doesn't exist
      await fs.mkdir(this.binaryDir, { recursive: true });
    } catch (error) {
      // Directory already exists, continue
    }

    console.log(`Downloading FBX2glTF for ${platform}...`);
    console.log(`URL: ${download.url}`);

    await this.downloadFile(download.url, this.binaryPath, progressCallback);
    console.log(`Downloaded to ${this.binaryPath}`);

    // Make executable on Unix systems
    if (platform !== 'win32') {
      await execAsync(`chmod +x "${this.binaryPath}"`);
      console.log('Made executable');
    }

    console.log('FBX2glTF installation complete!');
  }

  private async downloadFile(url: string, dest: string, progressCallback?: (progress: number) => void): Promise<void> {
    return new Promise((resolve, reject) => {
      https.get(url, (response) => {
        if (response.statusCode === 302 || response.statusCode === 301) {
          // Handle redirect
          https.get(response.headers.location!, (redirectResponse) => {
            this.handleDownloadResponse(redirectResponse, dest, progressCallback, resolve, reject);
          }).on('error', reject);
        } else {
          this.handleDownloadResponse(response, dest, progressCallback, resolve, reject);
        }
      }).on('error', reject);
    });
  }

  private handleDownloadResponse(
    response: any, 
    dest: string, 
    progressCallback: ((progress: number) => void) | undefined,
    resolve: () => void,
    reject: (error: any) => void
  ): void {
    const totalSize = parseInt(response.headers['content-length'] || '0', 10);
    let downloadedSize = 0;

    const file = require('fs').createWriteStream(dest);

    response.on('data', (chunk: Buffer) => {
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

    file.on('error', (error: any) => {
      file.close();
      reject(error);
    });
  }

  async ensureBinaryExists(progressCallback?: (progress: number) => void): Promise<void> {
    if (!(await this.checkBinary())) {
      await this.downloadBinary(progressCallback);
    }
  }

  async convertToGLTF(fbxPath: string, outputPath: string): Promise<void> {
    await this.ensureBinaryExists();

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