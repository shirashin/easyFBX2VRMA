import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRM } from '@pixiv/three-vrm';
import { VRMAnimationLoaderPlugin, createVRMAnimationClip, VRMAnimation } from '@pixiv/three-vrm-animation';

/**
 * VRM Animation Manager
 * VRMAファイルの読み込みとアニメーション制御
 */
export class VRMAnimationManager {
  private vrm: VRM;
  private mixer: THREE.AnimationMixer;
  private currentAction: THREE.AnimationAction | null = null;
  private currentClip: THREE.AnimationClip | null = null;
  private isPlaying: boolean = false;

  constructor(vrm: VRM, mixer: THREE.AnimationMixer) {
    this.vrm = vrm;
    this.mixer = mixer;
  }

  /**
   * VRMAファイルを読み込む
   */
  async loadVRMA(vrmaUrl: string | ArrayBuffer): Promise<THREE.AnimationClip> {
    // 既存のアニメーションを停止
    this.stopAnimation();
    
    let gltf;
    
    if (typeof vrmaUrl === 'string') {
      // URLから読み込み
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
      gltf = await loader.loadAsync(vrmaUrl);
    } else {
      // ArrayBufferから読み込み - バイナリglTF形式であることを確認
      const header = new Uint8Array(vrmaUrl.slice(0, 12));
      const magic = new TextDecoder().decode(header.slice(0, 4));
      
      if (magic !== 'glTF') {
        throw new Error('Invalid VRMA file format. Expected binary glTF file.');
      }
      
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
      
      const blob = new Blob([vrmaUrl]);
      const url = URL.createObjectURL(blob);
      try {
        gltf = await loader.loadAsync(url);
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    // VRMAアニメーションが正しく読み込まれた場合
    if (!gltf || !gltf.animations || gltf.animations.length === 0) {
      throw new Error('No animations found in VRMA file');
    }
    
    // VRMAnimation拡張をチェック
    if (gltf.userData && gltf.userData.vrmAnimations && gltf.userData.vrmAnimations.length > 0) {
      // VRMアニメーションとして読み込む
      const vrmAnimation = gltf.userData.vrmAnimations[0] as VRMAnimation;
      console.log('VRM Animation found:', vrmAnimation);
      
      // createVRMAnimationClipでVRMに適用可能なAnimationClipに変換
      const clip = createVRMAnimationClip(vrmAnimation, this.vrm);
      this.currentClip = clip;
      console.log('VRMA animation loaded successfully:', clip);
      
      // 新しいアニメーションを自動再生
      await this.playAnimation(clip);
      
      return clip;
    } else {
      // 標準のglTFアニメーションとして処理
      const clip = gltf.animations[0];
      this.currentClip = clip;
      console.log('Standard glTF animation loaded:', clip);
      
      // 新しいアニメーションを自動再生
      await this.playAnimation(clip);
      
      return clip;
    }
  }



  /**
   * アニメーションを再生
   */
  async playAnimation(clip?: THREE.AnimationClip, loop: boolean = true): Promise<void> {
    const animationClip = clip || this.currentClip;
    
    if (!animationClip) {
      throw new Error('No animation clip available');
    }

    console.log('Playing animation clip:', animationClip);
    console.log('Animation tracks:', animationClip.tracks?.length || 0);

    // 既存のアニメーションを停止
    this.stopAnimation();

    // 新しいアニメーションアクションを作成
    this.currentAction = this.mixer.clipAction(animationClip);
    
    if (loop) {
      this.currentAction.setLoop(THREE.LoopRepeat, Infinity);
    } else {
      this.currentAction.setLoop(THREE.LoopOnce, 1);
      this.currentAction.clampWhenFinished = true;
    }

    // アニメーション開始
    this.currentAction.reset();
    this.currentAction.play();
    this.isPlaying = true;

    console.log('Animation started:', {
      name: animationClip.name,
      duration: animationClip.duration,
      loop,
      tracks: animationClip.tracks?.length || 0
    });
  }

  /**
   * アニメーションを一時停止/再開
   */
  toggleAnimation(): void {
    if (!this.currentAction) return;

    if (this.isPlaying) {
      this.currentAction.paused = true;
      this.isPlaying = false;
      console.log('Animation paused');
    } else {
      this.currentAction.paused = false;
      this.isPlaying = true;
      console.log('Animation resumed');
    }
  }

  /**
   * アニメーションを完全停止
   */
  stopAnimation(): void {
    if (this.currentAction) {
      this.currentAction.stop();
      this.currentAction = null;
    }
    this.isPlaying = false;
    console.log('Animation stopped');
  }

  /**
   * ポーズをリセット（Tポーズに戻す）
   */
  resetPose(): void {
    if (this.currentAction) {
      this.currentAction.stop();
      this.currentAction.reset();
      this.currentAction = null;
    }
    
    // VRMの表情もリセット
    if (this.vrm.expressionManager) {
      // Reset all expressions to 0
      Object.keys(this.vrm.expressionManager.expressions).forEach(expressionName => {
        this.vrm.expressionManager?.setValue(expressionName, 0);
      });
    }
    
    this.isPlaying = false;
    console.log('Pose reset to T-pose');
  }

  /**
   * 現在のアニメーション状態を取得
   */
  getPlayState(): {
    isPlaying: boolean;
    currentTime: number;
    duration: number;
    clipName: string | null;
  } {
    return {
      isPlaying: this.isPlaying,
      currentTime: this.currentAction?.time || 0,
      duration: this.currentClip?.duration || 0,
      clipName: this.currentClip?.name || null,
    };
  }

  /**
   * アニメーション時間を設定
   */
  setAnimationTime(time: number): void {
    if (this.currentAction) {
      this.currentAction.time = Math.max(0, Math.min(time, this.currentClip?.duration || 0));
    }
  }

  /**
   * アニメーション速度を設定
   */
  setAnimationSpeed(speed: number): void {
    if (this.currentAction) {
      this.currentAction.timeScale = speed;
    }
  }

  /**
   * 現在読み込まれているアニメーションクリップを取得
   */
  getCurrentClip(): THREE.AnimationClip | null {
    return this.currentClip;
  }

  /**
   * リソースを解放
   */
  dispose(): void {
    this.stopAnimation();
    this.currentClip = null;
    console.log('VRMAnimationManager disposed');
  }
}