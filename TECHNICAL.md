# 技術ドキュメント - EasyFBX2VRMA

このドキュメントは、EasyFBX2VRMAの内部実装と技術的な詳細について説明します。

## 目次

1. [アーキテクチャ概要](#アーキテクチャ概要)
2. [変換パイプライン](#変換パイプライン)
3. [ボーンマッピング](#ボーンマッピング)
4. [データフォーマット](#データフォーマット)
5. [モジュール構成](#モジュール構成)
6. [技術的な制限事項](#技術的な制限事項)
7. [開発者向けガイド](#開発者向けガイド)

## アーキテクチャ概要

### プロセス構成

```
┌─────────────────────────────────────────────────┐
│                  Main Process                    │
│              (electron/main.js)                  │
│  - Window管理                                    │
│  - ファイルシステムアクセス                      │
│  - FBX→glTF→VRMA変換処理                        │
│  - FBX2glTF自動ダウンロード                      │
└─────────────────────────────────────────────────┘
                        ↕ IPC
┌─────────────────────────────────────────────────┐
│                Renderer Process                  │
│           (src/renderer/renderer.ts)             │
│  - UI制御                                        │
│  - ドラッグ&ドロップ処理                        │
│  - VRMプレビュー (Three.js)                      │
│  - アニメーション再生制御                        │
└─────────────────────────────────────────────────┘
```

### 通信フロー

1. **Preload Script** (`electron/preload.js`)
   - contextBridgeを使用した安全なIPC通信
   - ファイル操作APIの公開
   - 変換進捗の通知

2. **IPC通信チャンネル**
   - `convert-fbx-to-vrma`: FBX変換要求
   - `conversion-progress`: 変換進捗通知
   - `fbx2gltf-download-*`: バイナリダウンロード関連

## 変換パイプライン

### 1. FBX → glTF変換

```javascript
// FBX2glTFバイナリを使用
const command = `"${binaryPath}" --binary --verbose --input "${fbxPath}" --output "${gltfPath}"`;
```

**FBX2glTF設定:**
- `--binary`: バイナリglTF（.glb）形式で出力
- `--verbose`: 詳細ログ出力
- バージョン: v0.9.7

### 2. glTF → VRMA変換

変換プロセスの詳細：

```
1. GLBファイル解析
   ├─ ヘッダー検証（magic: 0x46546C67 = 'glTF'）
   ├─ JSONチャンク抽出
   └─ バイナリチャンク抽出

2. VRMC_vrm_animation拡張追加
   ├─ extensionsUsed配列に追加
   ├─ extensionsRequired配列に追加
   └─ humanoidボーンマッピング生成

3. 新しいGLBファイル生成
   ├─ GLBヘッダー（12バイト）
   ├─ JSONチャンク（パディング付き）
   └─ バイナリチャンク（元データ保持）
```

### 3. バイナリglTFフォーマット

```
GLBファイル構造:
┌──────────────────────────────┐
│  GLB Header (12 bytes)        │
│  - magic: 4 bytes (0x46546C67)│
│  - version: 4 bytes (2)       │
│  - length: 4 bytes            │
├──────────────────────────────┤
│  JSON Chunk                   │
│  - length: 4 bytes            │
│  - type: 4 bytes (0x4E4F534A) │
│  - data: JSON content         │
│  - padding: 0x20 (space)      │
├──────────────────────────────┤
│  Binary Chunk (optional)      │
│  - length: 4 bytes            │
│  - type: 4 bytes (0x004E4942) │
│  - data: binary data          │
│  - padding: 0x00              │
└──────────────────────────────┘
```

## ボーンマッピング

### Mixamo → VRM ボーン対応表

| Mixamoボーン名 | VRMボーン名 | 説明 |
|---|---|---|
| **胴体** |
| mixamorig:Hips | hips | 腰（ルートボーン） |
| mixamorig:Spine | spine | 脊椎下部 |
| mixamorig:Spine1 | chest | 胸部 |
| mixamorig:Spine2 | upperChest | 上胸部 |
| mixamorig:Neck | neck | 首 |
| mixamorig:Head | head | 頭 |
| **左腕** |
| mixamorig:LeftShoulder | leftShoulder | 左肩 |
| mixamorig:LeftArm | leftUpperArm | 左上腕 |
| mixamorig:LeftForeArm | leftLowerArm | 左前腕 |
| mixamorig:LeftHand | leftHand | 左手 |
| **右腕** |
| mixamorig:RightShoulder | rightShoulder | 右肩 |
| mixamorig:RightArm | rightUpperArm | 右上腕 |
| mixamorig:RightForeArm | rightLowerArm | 右前腕 |
| mixamorig:RightHand | rightHand | 右手 |
| **左脚** |
| mixamorig:LeftUpLeg | leftUpperLeg | 左大腿 |
| mixamorig:LeftLeg | leftLowerLeg | 左下腿 |
| mixamorig:LeftFoot | leftFoot | 左足 |
| mixamorig:LeftToeBase | leftToes | 左つま先 |
| **右脚** |
| mixamorig:RightUpLeg | rightUpperLeg | 右大腿 |
| mixamorig:RightLeg | rightLowerLeg | 右下腿 |
| mixamorig:RightFoot | rightFoot | 右足 |
| mixamorig:RightToeBase | rightToes | 右つま先 |

### 未実装のVRMボーン

現在サポートされていないVRMボーン：

- **指ボーン**: LeftThumb*, LeftIndex*, LeftMiddle*, LeftRing*, LeftLittke*, Right*
- **目ボーン**: LeftEye, RightEye
- **顎ボーン**: Jaw

### ボーンマッピングの実装箇所

1. **electron/main.js** - `mapToVrmBoneByName()`関数
   - glTFノード名からVRMボーン名へのマッピング
   - VRMC_vrm_animation拡張の生成

2. **src/converter/gltf-to-vrma.ts** - `mapToVRMBone()`メソッド
   - トラック名からVRMボーン名へのマッピング
   - TypeScript環境での型安全な実装

## データフォーマット

### VRMC_vrm_animation拡張

```json
{
  "extensions": {
    "VRMC_vrm_animation": {
      "specVersion": "1.0",
      "humanoid": {
        "humanBones": {
          "hips": { "node": 0 },
          "spine": { "node": 1 },
          "chest": { "node": 2 },
          // ... 他のボーンマッピング
        }
      }
    }
  },
  "extensionsUsed": ["VRMC_vrm_animation"],
  "extensionsRequired": ["VRMC_vrm_animation"]
}
```

## モジュール構成

### コンバーター関連

```
src/converter/
├── converter.ts          # メインコンバータークラス
├── fbx2gltf-manager.ts   # FBX2glTFバイナリ管理
└── gltf-to-vrma.ts      # glTF→VRMA変換ロジック
```

### レンダラー関連

```
src/renderer/
├── renderer.ts           # メインレンダラーロジック
├── components/
│   ├── VRMViewer.ts     # Three.js VRMビューワー
│   └── VRMAnimationManager.ts  # アニメーション管理
└── assets/
    └── models/
        └── Character02.vrm  # デフォルトVRMモデル
```

## 技術的な制限事項

### サポートされるファイル形式

- **入力**: FBXファイル（アニメーション付き）
  - FBX SDK 2020以降推奨
  - ASCII/Binary両対応

- **出力**: VRMAファイル
  - VRMC_vrm_animation 1.0仕様準拠
  - バイナリglTF形式

### パフォーマンス

- **メモリ使用量**: ファイルサイズの約3-4倍
- **処理時間**: 
  - 10MBのFBX: 約2-3秒
  - 100MBのFBX: 約10-15秒

### 制限事項

1. **ボーン数**: Mixamoスケルトン（22ボーン）のみ対応
2. **アニメーション**: 
   - 単一アニメーションのみ（複数アニメーションは最初のみ使用）
   - ブレンドシェイプアニメーション未対応
3. **テクスチャ**: アニメーションのみ変換（テクスチャは含まれない）

## 開発者向けガイド

### ビルドシステム

```
開発環境:
├── TypeScript  → JavaScript変換
├── Vite        → レンダラープロセスのバンドル
└── Electron    → デスクトップアプリ化
```

### TypeScript設定

**tsconfig.json** - レンダラープロセス用
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"]
  }
}
```

**tsconfig.main.json** - メインプロセス用
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "CommonJS"
  }
}
```

### デバッグ方法

1. **開発者ツール**: 
   - 開発モードで自動的に開く
   - `Ctrl+Shift+I`でも開ける

2. **ログ出力**:
   ```javascript
   // メインプロセス
   console.log() → ターミナルに出力
   
   // レンダラープロセス
   console.log() → DevToolsコンソールに出力
   ```

3. **変換処理のデバッグ**:
   - `electron/main.js`の各関数にconsole.log追加
   - glTFデータ構造の確認

### トラブルシューティング

#### よくあるエラー

1. **"No animations found in glTF file"**
   - 原因: FBXファイルにアニメーションが含まれていない
   - 解決: アニメーション付きFBXファイルを使用

2. **"Invalid VRMA file format"**
   - 原因: JSON形式で出力されている
   - 解決: バイナリglTF形式で出力を確認

3. **"FBX2glTF binary not found"**
   - 原因: FBX2glTFが未ダウンロード
   - 解決: アプリ再起動で自動ダウンロード

#### ログファイル

- Windows: `%APPDATA%\EasyFBX2VRMA\logs\`
- macOS: `~/Library/Logs/EasyFBX2VRMA/`
- Linux: `~/.config/EasyFBX2VRMA/logs/`

※現在のバージョンではログファイル出力未実装

## 参考資料

- [VRM仕様書](https://github.com/vrm-c/vrm-specification)
- [VRMC_vrm_animation仕様](https://github.com/vrm-c/vrm-specification/tree/master/specification/VRMC_vrm_animation-1.0)
- [glTF 2.0仕様](https://www.khronos.org/gltf/)
- [FBX2glTF](https://github.com/facebookincubator/FBX2glTF)
- [@pixiv/three-vrm](https://github.com/pixiv/three-vrm)