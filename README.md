# EasyFBX2VRMA

FBXアニメーションファイルをVRMA（VRM Animation）形式に簡単に変換できるデスクトップアプリケーション

## 特徴

- 🎯 **ドラッグ&ドロップ対応** - FBXファイルをウィンドウにドロップするだけで変換開始
- 📊 **リアルタイム進捗表示** - 変換の進行状況を視覚的に確認
- 🖥️ **クロスプラットフォーム** - Windows、macOS、Linuxに対応
- 🚀 **スタンドアロン動作** - サーバー不要、ローカル環境で完結
- 🦴 **Mixamoボーン対応** - Mixamoのボーン構造を自動的にVRM規格にマッピング

## インストール

### 事前準備

Node.js 18以上が必要です。

### セットアップ

```bash
# リポジトリをクローン
git clone https://github.com/yourusername/easyfbx2vrma.git
cd easyfbx2vrma

# 依存関係をインストール（FBX2glTFバイナリも自動ダウンロード）
npm install
```

### アイコンファイルの準備

`assets`ディレクトリに以下のアイコンファイルを配置してください：
- `icon.png` - Linux用アイコン
- `icon.ico` - Windows用アイコン  
- `icon.icns` - macOS用アイコン

## 使い方

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

# macOS用パッケージを作成
npm run build:mac

# Linux用AppImageを作成
npm run build:linux
```

ビルドされたアプリケーションは`out`ディレクトリに出力されます。

## 使用方法

1. アプリケーションを起動
2. FBXファイルをウィンドウにドラッグ&ドロップ（またはクリックしてファイルを選択）
3. 変換が自動的に開始され、進捗バーが表示されます
4. 変換完了後、保存先を選択
5. VRMAファイルが指定した場所に保存されます

## 技術スタック

- **Electron** - デスクトップアプリケーションフレームワーク
- **TypeScript** - 型安全な開発
- **Vite** - 高速なビルドツール
- **Three.js** - 3Dグラフィックス処理
- **@pixiv/three-vrm-animation** - VRMA形式のサポート
- **FBX2glTF** - FBXからglTFへの変換

## プロジェクト構造

```
easyfbx2vrma/
├── src/
│   ├── main/          # Electronメインプロセス
│   ├── renderer/      # UI（レンダラープロセス）
│   ├── preload/       # プリロードスクリプト
│   └── converter/     # 変換ロジック
├── binaries/          # FBX2glTFバイナリ（自動ダウンロード）
├── assets/            # アプリケーションアイコン
└── dist/              # ビルド出力
```

## 変換フロー

1. **FBX → glTF**: FBX2glTFバイナリを使用してFBXをglTF形式に変換
2. **glTF → VRMA**: Three.jsとpixiv/three-vrm-animationを使用してVRMA形式に変換
3. **ボーンマッピング**: Mixamoなどのボーン構造をVRM規格に自動マッピング

## トラブルシューティング

### FBX2glTFバイナリが見つからない

```bash
# バイナリを手動でダウンロード
node download-fbx2gltf.js
```

### ビルドエラーが発生する

```bash
# TypeScriptのコンパイルチェック
npm run compile

# node_modulesを削除して再インストール
rm -rf node_modules
npm install
```

## 対応形式

- **入力**: FBXファイル（アニメーション付き）
- **出力**: VRMAファイル（VRM Animation形式）

## システム要件

- Node.js 18以上
- Windows 10/11、macOS 10.14以上、Ubuntu 20.04以上
- 4GB以上のRAM推奨

## ライセンス

MIT License

## 貢献

プルリクエストを歓迎します。大きな変更の場合は、まずissueを開いて変更内容について議論してください。

## 関連プロジェクト

- [FBX2glTF](https://github.com/facebookincubator/FBX2glTF) - FBXからglTFへのコンバーター
- [@pixiv/three-vrm](https://github.com/pixiv/three-vrm) - VRM実装
- [three-vrm-animation](https://github.com/pixiv/three-vrm/tree/release/packages/three-vrm-animation) - VRMAサポート