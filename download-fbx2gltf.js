const https = require('https');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const BINARIES_DIR = path.join(__dirname, 'binaries');
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

async function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        https.get(response.headers.location, (redirectResponse) => {
          redirectResponse.pipe(file);
          file.on('finish', () => {
            file.close(resolve);
          });
        }).on('error', reject);
      } else {
        response.pipe(file);
        file.on('finish', () => {
          file.close(resolve);
        });
      }
    }).on('error', reject);
  });
}

async function main() {
  const platform = process.platform;
  const download = DOWNLOADS[platform];
  
  if (!download) {
    console.error(`Unsupported platform: ${platform}`);
    process.exit(1);
  }
  
  if (!fs.existsSync(BINARIES_DIR)) {
    fs.mkdirSync(BINARIES_DIR, { recursive: true });
  }
  
  const destPath = path.join(BINARIES_DIR, download.filename);
  
  if (fs.existsSync(destPath)) {
    console.log(`FBX2glTF already exists at ${destPath}`);
    return;
  }
  
  console.log(`Downloading FBX2glTF for ${platform}...`);
  console.log(`URL: ${download.url}`);
  
  try {
    await downloadFile(download.url, destPath);
    console.log(`Downloaded to ${destPath}`);
    
    if (platform !== 'win32') {
      await execAsync(`chmod +x "${destPath}"`);
      console.log('Made executable');
    }
    
    console.log('FBX2glTF installation complete!');
  } catch (error) {
    console.error('Failed to download FBX2glTF:', error);
    process.exit(1);
  }
}

main();