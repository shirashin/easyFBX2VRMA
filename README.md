# EasyFBX2VRMA

FBXアニメーションファイルをVRMA（VRM Animation）形式に簡単に変換できるデスクトップアプリケーション

## 特徴

- 🎯 **ドラッグ&ドロップ対応** - FBXファイルをウィンドウにドロップするだけで変換開始
- 📊 **リアルタイム進捗表示** - 変換の進行状況を視覚的に確認
- 🎬 **アニメーションプレビュー** - 変換後のVRMAアニメーションをその場で確認可能
- 🚀 **自動セットアップ** - 初回起動時にFBX2glTFバイナリを自動ダウンロード
- 🖥️ **Windows対応** - Windows環境での動作を確認済み
- 🦴 **Mixamoボーン対応** - Mixamoのボーン構造を自動的にVRM規格にマッピング

## 概要

EasyFBX2VRMAは、FBXファイルを使ったアニメーション制作ワークフローを簡素化するツールです。内部でFBX2glTFとThree.jsを使用してFBXファイルをglTF経由でVRMA形式に変換し、Mixamoなどで作成されたアニメーションを簡単にVRMアバターで利用できるようにします。

## ダウンロード

リリースページから最新バージョンをダウンロードできます：
- Windows: `EasyFBX2VRMA-Setup-x.x.x.exe`
- その他のプラットフォーム: 未検証（macOS、Linux版も技術的には対応可能）

## 使用方法

### 初回起動
1. アプリケーションを起動すると、初回セットアップが自動で開始されます
2. FBX2glTFバイナリのダウンロード進捗が表示されます（数秒から数分）
3. セットアップ完了後、メイン画面が表示されます

### アニメーション変換
1. FBXファイルをアプリのウィンドウにドラッグ&ドロップ
   - または「クリックしてファイルを選択」からFBXファイルを選択
2. 自動で変換が開始され、進捗バーが表示されます
3. 変換完了後、保存先を選択してVRMAファイルを保存
4. **アニメーションプレビュー**で変換結果をその場で確認
   - Play/Stopボタンでアニメーションを再生・停止
   - 3Dビューワーでアニメーションの動きを確認

### 対応するFBXファイル
- アニメーションデータが含まれているFBXファイル
- Mixamoからダウンロードしたアニメーション（推奨）
- 他のソフトウェアで作成されたFBXアニメーション

## ビルド方法（開発者向け）

### 事前準備
- Node.js 18以上
- Git

### セットアップ
```bash
# リポジトリをクローン
git clone https://github.com/yourusername/easyfbx2vrma.git
cd easyfbx2vrma

# 依存関係をインストール
npm install
```

### 開発モードで起動
```bash
# ターミナル1: Viteの開発サーバーを起動
npm run dev

# ターミナル2: Electronアプリを起動
npm run electron:dev
```

### アプリケーションのビルド
```bash
# Windows用インストーラーを作成
npm run build:win

# macOS、Linux用（未検証）
npm run build:mac
npm run build:linux
```

ビルドされたアプリケーションは`out`ディレクトリに出力されます。

### アイコンファイルの準備（ビルド時）
`assets`ディレクトリに以下のアイコンファイルを配置：
- `icon.png` - Linux用アイコン
- `icon.ico` - Windows用アイコン  
- `icon.icns` - macOS用アイコン

## 対応ボーン

Mixamoボーンから以下のVRMボーンへの自動マッピングに対応：

- **胴体**: Hips, Spine, Chest, UpperChest, Neck, Head
- **腕**: LeftShoulder/RightShoulder, LeftUpperArm/RightUpperArm, LeftLowerArm/RightLowerArm, LeftHand/RightHand
- **脚**: LeftUpperLeg/RightUpperLeg, LeftLowerLeg/RightLowerLeg, LeftFoot/RightFoot, LeftToes/RightToes

## トラブルシューティング

### 変換に失敗する場合
- FBXファイルにアニメーションデータが含まれているか確認
- ファイルサイズが大きすぎる場合は、アニメーションの長さを短くしてみてください

### アプリが起動しない場合
- セキュリティソフトウェアがブロックしている可能性があります
- Windows: 「WindowsによってPCが保護されました」が表示された場合は「詳細情報」→「実行」

### プレビューが表示されない場合
- 変換が正常に完了しているか確認
- アプリを再起動してみてください

## 技術仕様

- **入力形式**: FBXファイル（アニメーション付き）
- **出力形式**: VRMAファイル（VRM Animation形式）
- **変換エンジン**: FBX2glTF + Three.js + @pixiv/three-vrm-animation
- **プレビュー**: Three.js VRM Viewer

## システム要件

- **Windows**: Windows 10/11（64bit）※動作確認済み
- **その他のOS**: macOS、Linuxでも技術的には動作可能（未検証）
- **メモリ**: 4GB以上推奨
- **ストレージ**: 500MB以上の空き容量

## ライセンス

MIT License

## 関連プロジェクト

- [FBX2glTF](https://github.com/facebookincubator/FBX2glTF) - FBXからglTFへのコンバーター
- [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) - VRM実装
- [VRM Animation仕様](https://github.com/vrm-c/vrm-specification) - VRMA形式の仕様書