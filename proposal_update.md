# GitHub Issue添付ファイル読み込み機能の実装計画

## 概要

claude-code-actionにおいて、GitHub issueやPull Requestに添付されたすべてのサポートファイルを確実に読み込めるよう、段階的に機能を拡張する。

## 現状の課題

1. **画像ファイルの読み込み不完全**

   - Markdown形式（`![alt](url)`）のみサポート
   - `<img>`タグ形式が検出されない

2. **ドキュメントファイルの未対応**

   - PDF、Office文書、OpenDocument形式が読み込めない
   - `/files/`パスに対応していない

3. **その他のファイルタイプ非対応**
   - 動画、テキスト、アーカイブファイルなどが無視される

## サポート対象ファイルタイプ

### GitHubが公式にサポートしているファイルタイプ

| カテゴリ        | 拡張子                                                                     | ファイルサイズ上限         |
| --------------- | -------------------------------------------------------------------------- | -------------------------- |
| 画像            | `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`                           | 10MB                       |
| 動画            | `.mp4`, `.mov`, `.webm`                                                    | 10MB (無料) / 100MB (有料) |
| PDF             | `.pdf`                                                                     | 25MB                       |
| MS Office       | `.docx`, `.pptx`, `.xlsx`, `.xls`                                          | 25MB                       |
| OpenDocument    | `.odt`, `.fodt`, `.ods`, `.fods`, `.odp`, `.fodp`, `.odg`, `.fodg`, `.odf` | 25MB                       |
| テキスト/データ | `.txt`, `.md`, `.csv`, `.json`, `.jsonc`, `.log`                           | 25MB                       |
| アーカイブ      | `.zip`, `.gz`, `.tgz`                                                      | 25MB                       |
| 開発用          | `.patch`\*, `.cpuprofile`, `.dmp`                                          | 25MB                       |

\*注: Linux環境での`.patch`ファイルアップロードには既知の問題あり

## 実装フェーズ

### Phase 1: 画像検出の改善（1週間）

**目標**: 既存の画像読み込み機能を拡張し、すべての画像形式に対応

**実装内容**:

```javascript
// 新しい正規表現パターンの追加
const IMAGE_PATTERNS = {
  // 既存のMarkdown形式
  MARKDOWN:
    /!\[[^\]]*\]\((https:\/\/github\.com\/user-attachments\/assets\/[^)]+)\)/g,

  // 新規追加: <img>タグ形式
  IMG_TAG:
    /<img[^>]+src="(https:\/\/github\.com\/user-attachments\/assets\/[^"]+)"[^>]*>/g,
};

// 画像拡張子の定義
const IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"];
```

**テスト項目**:

- [ ] Markdown形式の画像検出（後方互換性）
- [ ] `<img>`タグ形式の画像検出
- [ ] SVGファイルの適切な処理
- [ ] 10MBを超える画像のエラーハンドリング

### Phase 2: PDFとドキュメントファイルサポート（2週間）

**目標**: PDF、MS Office、OpenDocumentファイルの読み込み実装

**実装内容**:

```javascript
// ファイル添付パターンの追加
const FILE_ATTACHMENT_PATTERN = /\[[^\]]+\]\((https:\/\/github\.com\/user-attachments\/files\/[^)]+)\)/g;

// ドキュメントファイル拡張子
const DOCUMENT_EXTENSIONS = {
  pdf: ['.pdf'],
  msOffice: ['.docx', '.pptx', '.xlsx', '.xls'],
  openDocument: ['.odt', '.fodt', '.ods', '.fods', '.odp', '.fodp', '.odg', '.fodg', '.odf']
};

// ファイルタイプ判定とダウンロード処理
async function downloadDocument(url: string, fileType: string) {
  // ファイルタイプに応じた処理
  switch(fileType) {
    case 'pdf':
      return await downloadPDF(url);
    case 'msOffice':
    case 'openDocument':
      return await downloadBinaryFile(url);
  }
}
```

**テスト項目**:

- [ ] PDFファイルのダウンロードと保存
- [ ] MS Office各形式の正常な取得
- [ ] OpenDocument各形式の正常な取得
- [ ] ファイル名の適切な保持

### Phase 3: 動画・メディアファイルサポート（1週間）

**目標**: 動画ファイルの検出とメタデータ取得

**実装内容**:

```javascript
// 動画ファイル拡張子
const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.webm'];

// 動画ファイル処理
async function handleVideoFile(url: string) {
  // メタデータのみ保存（実際の動画はダウンロードしない）
  return {
    type: 'video',
    url: url,
    filename: extractFileName(url),
    message: 'Video file detected. Please view directly on GitHub.'
  };
}
```

**テスト項目**:

- [ ] 動画ファイルの検出
- [ ] ファイルサイズ制限の確認（無料/有料プラン）
- [ ] 適切なメタデータの保存

### Phase 4: テキスト・データファイルサポート（1週間）

**目標**: CSV、JSON、ログファイルなどのテキストベースファイルの読み込み

**実装内容**:

```javascript
// テキストファイル拡張子
const TEXT_EXTENSIONS = ['.txt', '.md', '.csv', '.json', '.jsonc', '.log'];

// テキストファイル処理
async function downloadTextFile(url: string) {
  const content = await fetchFileContent(url);
  return {
    type: 'text',
    content: content,
    encoding: 'utf-8'
  };
}
```

**テスト項目**:

- [ ] 各テキスト形式の正常な読み込み
- [ ] 文字エンコーディングの適切な処理
- [ ] 大容量ファイルの処理

### Phase 5: アーカイブと開発用ファイルサポート（1週間）

**目標**: ZIP、パッチファイルなどの特殊ファイルの処理

**実装内容**:

```javascript
// アーカイブ・開発用拡張子
const ARCHIVE_EXTENSIONS = ['.zip', '.gz', '.tgz'];
const DEV_EXTENSIONS = ['.patch', '.cpuprofile', '.dmp'];

// 特殊ファイル処理
async function handleSpecialFiles(url: string, fileType: string) {
  if (ARCHIVE_EXTENSIONS.includes(fileType)) {
    // アーカイブはメタデータのみ保存
    return saveArchiveMetadata(url);
  } else if (fileType === '.patch') {
    // パッチファイルはテキストとして処理
    return downloadTextFile(url);
  }
}
```

**テスト項目**:

- [ ] ZIPファイルのメタデータ取得
- [ ] パッチファイルの読み込み（Linux環境での制限確認）
- [ ] 開発用ファイルの適切な処理

### Phase 6: 統合テストとエラーハンドリング（1週間）

**目標**: 全機能の統合テストとロバストなエラーハンドリングの実装

**実装内容**:

```javascript
// 統一されたファイル検出とダウンロード
export async function downloadAllAttachments(
  octokits: Octokits,
  owner: string,
  repo: string,
  comments: CommentWithImages[]
): Promise<Map<string, string>> {
  const attachments = new Map<string, AttachmentInfo>();

  try {
    // すべてのパターンで添付ファイルを検出
    const detectedFiles = detectAllAttachments(comments);

    // ファイルタイプごとに適切な処理
    for (const file of detectedFiles) {
      const result = await processAttachment(file);
      attachments.set(file.url, result);
    }

  } catch (error) {
    logger.error('Failed to download attachments', error);
    // 部分的な成功を許可
  }

  return attachments;
}
```

**テスト項目**:

- [ ] 複数ファイルタイプが混在する場合の処理
- [ ] ネットワークエラーのリトライ処理
- [ ] ファイルサイズ超過時の適切なエラーメッセージ
- [ ] 非対応ファイルタイプの警告表示

## 成功指標

1. **機能カバレッジ**: GitHubがサポートする全ファイルタイプの95%以上を読み込み可能
2. **後方互換性**: 既存の画像読み込み機能を損なわない

## リスクと対策

| リスク                             | 対策                                                    |
| ---------------------------------- | ------------------------------------------------------- |
| GitHubのAPI仕様変更                | URLパターンを設定ファイルで管理し、容易に更新可能にする |
| 大容量ファイルによるメモリ不足     | ストリーミング処理とファイルサイズ事前チェック          |
| 認証が必要なプライベートリポジトリ | 適切な認証トークンの使用とエラーハンドリング            |
| ファイルタイプ判定の誤り           | 拡張子とMIMEタイプの両方でチェック                      |
