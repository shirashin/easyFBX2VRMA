import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRM, VRMUtils } from '@pixiv/three-vrm';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

export interface VRMViewerOptions {
  background?: number;
  cameraPosition?: { x: number; y: number; z: number };
  cameraTarget?: { x: number; y: number; z: number };
  enableShadows?: boolean;
  enableOrbitControls?: boolean;
  enableGround?: boolean;
  groundColor?: number;
  ambientLightIntensity?: number;
  directionalLightIntensity?: number;
}

/**
 * VRM Model Viewer Class
 * Three.jsベースの3Dビューア
 */
export class VRMViewer {
  private container: HTMLElement;
  private options: Required<VRMViewerOptions>;
  private scene: THREE.Scene | null = null;
  private camera: THREE.PerspectiveCamera | null = null;
  private renderer: THREE.WebGLRenderer | null = null;
  private controls: OrbitControls | null = null;
  private vrm: VRM | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private clock: THREE.Clock;
  private resizeObserver: ResizeObserver | null = null;
  private animationId: number | null = null;

  constructor(container: HTMLElement, options: VRMViewerOptions = {}) {
    this.container = container;
    this.options = {
      background: options.background ?? 0x212121,
      cameraPosition: options.cameraPosition ?? { x: 0, y: 1.3, z: 1.5 },
      cameraTarget: options.cameraTarget ?? { x: 0, y: 1, z: 0 },
      enableShadows: options.enableShadows ?? true,
      enableOrbitControls: options.enableOrbitControls ?? true,
      enableGround: options.enableGround ?? true,
      groundColor: options.groundColor ?? 0x333333,
      ambientLightIntensity: options.ambientLightIntensity ?? 0.4,
      directionalLightIntensity: options.directionalLightIntensity ?? 1.0,
    };

    this.clock = new THREE.Clock();
  }

  /**
   * ビューアを初期化
   */
  async initialize(): Promise<void> {
    try {
      this.setupScene();
      this.setupCamera();
      this.setupRenderer();
      this.setupLights();
      this.setupGround();
      this.setupControls();
      this.setupResizeObserver();
      this.startRenderLoop();
      
      console.log('VRMViewer initialized successfully');
    } catch (error) {
      console.error('Failed to initialize VRMViewer:', error);
      throw error;
    }
  }

  /**
   * シーンのセットアップ
   */
  private setupScene(): void {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(this.options.background);
  }

  /**
   * カメラのセットアップ
   */
  private setupCamera(): void {
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(75, aspect, 0.1, 1000);
    
    const pos = this.options.cameraPosition;
    this.camera.position.set(pos.x, pos.y, pos.z);
    
    const target = this.options.cameraTarget;
    this.camera.lookAt(target.x, target.y, target.z);
  }

  /**
   * レンダラーのセットアップ
   */
  private setupRenderer(): void {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(window.devicePixelRatio);
    
    if (this.options.enableShadows) {
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }
    
    this.container.appendChild(this.renderer.domElement);
  }

  /**
   * ライトのセットアップ
   */
  private setupLights(): void {
    if (!this.scene) return;

    // 環境光
    const ambientLight = new THREE.AmbientLight(0xffffff, this.options.ambientLightIntensity);
    this.scene.add(ambientLight);

    // 指向性ライト
    const directionalLight = new THREE.DirectionalLight(0xffffff, this.options.directionalLightIntensity);
    directionalLight.position.set(1, 2, 1);
    
    if (this.options.enableShadows) {
      directionalLight.castShadow = true;
      directionalLight.shadow.mapSize.width = 2048;
      directionalLight.shadow.mapSize.height = 2048;
      directionalLight.shadow.camera.near = 0.5;
      directionalLight.shadow.camera.far = 500;
      directionalLight.shadow.camera.left = -10;
      directionalLight.shadow.camera.right = 10;
      directionalLight.shadow.camera.top = 10;
      directionalLight.shadow.camera.bottom = -10;
    }
    
    this.scene.add(directionalLight);
  }

  /**
   * グラウンド（床）のセットアップ
   */
  private setupGround(): void {
    if (!this.scene || !this.options.enableGround) return;

    const groundGeometry = new THREE.PlaneGeometry(20, 20);
    const groundMaterial = new THREE.MeshLambertMaterial({ color: this.options.groundColor });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    
    ground.rotation.x = -Math.PI / 2;
    
    if (this.options.enableShadows) {
      ground.receiveShadow = true;
    }
    
    this.scene.add(ground);
  }

  /**
   * OrbitControlsのセットアップ
   */
  private setupControls(): void {
    if (!this.camera || !this.renderer || !this.options.enableOrbitControls) return;

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    
    const target = this.options.cameraTarget;
    this.controls.target.set(target.x, target.y, target.z);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.update();
  }

  /**
   * リサイズオブザーバーのセットアップ
   */
  private setupResizeObserver(): void {
    this.resizeObserver = new ResizeObserver(() => {
      this.handleResize();
    });
    this.resizeObserver.observe(this.container);
  }

  /**
   * リサイズ処理
   */
  private handleResize(): void {
    if (!this.camera || !this.renderer) return;

    const width = this.container.clientWidth;
    const height = this.container.clientHeight;

    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  /**
   * レンダリングループ開始
   */
  private startRenderLoop(): void {
    const animate = () => {
      this.animationId = requestAnimationFrame(animate);

      const deltaTime = this.clock.getDelta();

      // AnimationMixerの更新
      if (this.mixer) {
        this.mixer.update(deltaTime);
      }

      // VRMの更新
      if (this.vrm) {
        this.vrm.update(deltaTime);
      }

      // コントロールの更新
      if (this.controls) {
        this.controls.update();
      }

      // レンダリング
      if (this.scene && this.camera && this.renderer) {
        this.renderer.render(this.scene, this.camera);
      }
    };

    animate();
  }

  /**
   * VRMモデルを読み込む
   */
  async loadVRM(vrmUrl: string): Promise<VRM> {
    if (!this.scene) {
      throw new Error('Scene not initialized');
    }

    try {
      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));

      const gltf = await loader.loadAsync(vrmUrl);
      const vrm = gltf.userData.vrm as VRM;

      if (!vrm) {
        throw new Error('No VRM data found in the loaded file');
      }

      // 既存のVRMがあれば削除
      if (this.vrm) {
        this.scene.remove(this.vrm.scene);
      }

      // VRM 0.x系の向き補正を適用
      this.applyVRMCorrection(vrm);

      // 新しいVRMを追加
      this.vrm = vrm;
      this.scene.add(vrm.scene);

      // AnimationMixerを作成
      this.mixer = new THREE.AnimationMixer(vrm.scene);

      // シャドウの設定
      if (this.options.enableShadows) {
        vrm.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
      }

      console.log('VRM model loaded successfully:', vrm);
      return vrm;
    } catch (error) {
      console.error('Failed to load VRM:', error);
      throw error;
    }
  }

  /**
   * AnimationMixerを取得
   */
  getMixer(): THREE.AnimationMixer | null {
    return this.mixer;
  }

  /**
   * 現在のVRMモデルを取得
   */
  getVRM(): VRM | null {
    return this.vrm;
  }

  /**
   * 背景色を変更
   */
  setBackgroundColor(color: number): void {
    if (this.scene) {
      this.scene.background = new THREE.Color(color);
    }
  }

  /**
   * VRMバージョンを判定
   */
  private getVRMVersion(vrm: VRM): string {
    // VRM 1.0の場合、meta.metaVersionが存在する
    if (vrm.meta && (vrm.meta as any).metaVersion) {
      return '1.0';
    }
    // VRM 0.xの場合
    return '0.x';
  }

  /**
   * VRMの向き補正を適用（VRMUtils.rotateVRM0を使用）
   */
  private applyVRMCorrection(vrm: VRM): void {
    // バージョンに関わらず、すべてのVRMにrotateVRM0を適用
    // カメラが正面（z: 1.5）にあるため、180度回転で前面を向かせる
    VRMUtils.rotateVRM0(vrm);
  }

  /**
   * 新しいVRMファイルでキャラクターを交換
   */
  async swapCharacter(vrmFilePath: string): Promise<VRM> {
    if (!this.scene) {
      throw new Error('Scene not initialized');
    }

    try {
      // 現在のアニメーション状態を保存
      const currentAnimationTime = this.mixer ? this.mixer.time : 0;
      const wasPlaying = this.mixer && this.mixer.timeScale > 0;

      const loader = new GLTFLoader();
      loader.register((parser) => new VRMLoaderPlugin(parser));

      const gltf = await loader.loadAsync(vrmFilePath);
      const newVrm = gltf.userData.vrm as VRM;

      if (!newVrm) {
        throw new Error('No VRM data found in the loaded file');
      }

      // VRM 0.x系の向き補正を適用
      this.applyVRMCorrection(newVrm);

      // 既存のVRMがあれば削除
      if (this.vrm) {
        this.scene.remove(this.vrm.scene);
      }

      // 新しいVRMを追加
      this.vrm = newVrm;
      this.scene.add(newVrm.scene);

      // 新しいAnimationMixerを作成
      this.mixer = new THREE.AnimationMixer(newVrm.scene);

      // アニメーション状態を復元（必要に応じて）
      if (wasPlaying && currentAnimationTime > 0) {
        // アニメーションが再生中だった場合、時間を設定
        this.mixer.setTime(currentAnimationTime);
      }

      // シャドウの設定
      if (this.options.enableShadows) {
        newVrm.scene.traverse((child) => {
          if (child instanceof THREE.Mesh) {
            child.castShadow = true;
            child.receiveShadow = true;
          }
        });
      }

      console.log('VRM character swapped successfully');
      return newVrm;

    } catch (error) {
      console.error('Error swapping VRM character:', error);
      throw error;
    }
  }

  /**
   * リソースを解放
   */
  dispose(): void {
    // アニメーション停止
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }

    // リサイズオブザーバーを停止
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }

    // VRMを解放
    if (this.vrm) {
      this.vrm = null;
    }

    // AnimationMixerを解放
    if (this.mixer) {
      this.mixer.stopAllAction();
      this.mixer = null;
    }

    // コントロールを解放
    if (this.controls) {
      this.controls.dispose();
      this.controls = null;
    }

    // レンダラーを解放
    if (this.renderer) {
      this.renderer.dispose();
      if (this.renderer.domElement.parentNode) {
        this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
      }
      this.renderer = null;
    }

    // シーンをクリア
    if (this.scene) {
      this.scene.clear();
      this.scene = null;
    }

    this.camera = null;
  }
}