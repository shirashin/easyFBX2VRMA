import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { VRMAnimationExporter } from '@pixiv/three-vrm-animation';
import { VRMHumanBoneName } from '@pixiv/three-vrm';
import fs from 'fs/promises';

export interface ConversionOptions {
  onProgress?: (progress: number) => void;
}

export class GLTFToVRMAConverter {
  private loader: GLTFLoader;
  private exporter: VRMAnimationExporter;

  constructor() {
    this.loader = new GLTFLoader();
    this.exporter = new VRMAnimationExporter();
  }

  async convert(gltfPath: string, options?: ConversionOptions): Promise<ArrayBuffer> {
    try {
      options?.onProgress?.(0);
      
      const gltfData = await fs.readFile(gltfPath);
      const gltfBuffer = Buffer.from(gltfData);
      
      options?.onProgress?.(20);
      
      const gltf = await this.loadGLTF(gltfBuffer);
      
      options?.onProgress?.(40);
      
      const animation = this.extractAnimation(gltf);
      
      options?.onProgress?.(60);
      
      const vrmaAnimation = this.createVRMAnimation(animation);
      
      options?.onProgress?.(80);
      
      const vrmaBuffer = await this.exportVRMA(vrmaAnimation);
      
      options?.onProgress?.(100);
      
      return vrmaBuffer;
    } catch (error) {
      console.error('GLTF to VRMA conversion error:', error);
      throw new Error(`Failed to convert GLTF to VRMA: ${error}`);
    }
  }

  private async loadGLTF(buffer: Buffer): Promise<any> {
    return new Promise((resolve, reject) => {
      const blob = new Blob([buffer], { type: 'model/gltf-binary' });
      const url = URL.createObjectURL(blob);
      
      this.loader.load(
        url,
        (gltf) => {
          URL.revokeObjectURL(url);
          resolve(gltf);
        },
        undefined,
        (error) => {
          URL.revokeObjectURL(url);
          reject(error);
        }
      );
    });
  }

  private extractAnimation(gltf: any): THREE.AnimationClip | null {
    if (!gltf.animations || gltf.animations.length === 0) {
      throw new Error('No animations found in GLTF file');
    }
    
    return gltf.animations[0];
  }

  private createVRMAnimation(clip: THREE.AnimationClip): any {
    const humanoidTracks: any[] = [];
    const expressionTracks: any[] = [];
    
    clip.tracks.forEach((track) => {
      const boneName = this.mapToVRMBone(track.name);
      if (boneName) {
        const vrmaTrack = {
          node: boneName,
          track: track,
        };
        humanoidTracks.push(vrmaTrack);
      }
    });
    
    const vrmaAnimation = {
      humanoid: humanoidTracks,
      expressions: expressionTracks,
      duration: clip.duration,
      name: clip.name || 'animation',
    };
    
    return vrmaAnimation;
  }

  private mapToVRMBone(trackName: string): VRMHumanBoneName | null {
    const boneMapping: Record<string, VRMHumanBoneName> = {
      'mixamorigHips': VRMHumanBoneName.Hips,
      'mixamorigSpine': VRMHumanBoneName.Spine,
      'mixamorigSpine1': VRMHumanBoneName.Chest,
      'mixamorigSpine2': VRMHumanBoneName.UpperChest,
      'mixamorigNeck': VRMHumanBoneName.Neck,
      'mixamorigHead': VRMHumanBoneName.Head,
      'mixamorigLeftShoulder': VRMHumanBoneName.LeftShoulder,
      'mixamorigLeftArm': VRMHumanBoneName.LeftUpperArm,
      'mixamorigLeftForeArm': VRMHumanBoneName.LeftLowerArm,
      'mixamorigLeftHand': VRMHumanBoneName.LeftHand,
      'mixamorigRightShoulder': VRMHumanBoneName.RightShoulder,
      'mixamorigRightArm': VRMHumanBoneName.RightUpperArm,
      'mixamorigRightForeArm': VRMHumanBoneName.RightLowerArm,
      'mixamorigRightHand': VRMHumanBoneName.RightHand,
      'mixamorigLeftUpLeg': VRMHumanBoneName.LeftUpperLeg,
      'mixamorigLeftLeg': VRMHumanBoneName.LeftLowerLeg,
      'mixamorigLeftFoot': VRMHumanBoneName.LeftFoot,
      'mixamorigLeftToeBase': VRMHumanBoneName.LeftToes,
      'mixamorigRightUpLeg': VRMHumanBoneName.RightUpperLeg,
      'mixamorigRightLeg': VRMHumanBoneName.RightLowerLeg,
      'mixamorigRightFoot': VRMHumanBoneName.RightFoot,
      'mixamorigRightToeBase': VRMHumanBoneName.RightToes,
    };
    
    for (const [key, value] of Object.entries(boneMapping)) {
      if (trackName.includes(key)) {
        return value;
      }
    }
    
    return null;
  }

  private async exportVRMA(animation: any): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
      this.exporter.export(animation, (buffer: ArrayBuffer) => {
        resolve(buffer);
      });
    });
  }
}

export const gltfToVRMAConverter = new GLTFToVRMAConverter();