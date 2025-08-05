# GitHub Issue添付ファイル読み込み機能の改善提案

## やりたいこと

GitHub issueやPull Requestに添付されたすべてのファイル（画像、PDF、その他のドキュメント）をClaudeが確実に読み込めるようにする。

## 課題

現在のclaude-code-actionでは、GitHubに添付されたファイルの一部が読み込めない問題が発生している：

1. **画像ファイルの読み込み失敗**

   - GitHubが生成する`<img>`タグ形式の画像が検出されない
   - 現在の実装はMarkdown形式（`![alt](url)`）のみをサポート

2. **PDFファイルの読み込み不可**

   - PDFファイルが完全に無視される
   - ファイルパスの違い（`/files/` vs `/assets/`）に対応していない

3. **その他の添付ファイル非対応**
   - Word文書、Excel、テキストファイルなど、画像以外のファイルタイプがサポートされていない

## 背景

### 現在の実装 (`src/github/utils/image-downloader.ts`)

```javascript
const IMAGE_REGEX = new RegExp(
  `!\\[[^\\]]*\\]\\((${GITHUB_SERVER_URL}\\/user-attachments\\/assets\\/[^)]+)\\)`,
  "g",
);
```

この正規表現は以下の制限がある：

- Markdown画像記法（`![alt text](url)`）のみを検出
- `/user-attachments/assets/`パスのみを対象
- 画像ファイルの拡張子のみをサポート（`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`, `.svg`）

### 実際のGitHubの添付ファイル形式

1. **画像**:

   ```html
   <img
     width="1512"
     height="943"
     alt="Image"
     src="https://github.com/user-attachments/assets/01133ce7-e2d0-4b77-a2b8-5de49037d460"
   />
   ```

2. **PDFファイル**:
   ```markdown
   [issue1_2.pdf](https://github.com/user-attachments/files/21520676/issue1_2.pdf)
   ```

## 対応策

### 1. 正規表現の拡張

複数の形式に対応する正規表現を追加：

```javascript
// 画像用：<img>タグとMarkdown形式の両方に対応
const IMG_TAG_REGEX =
  /<img[^>]+src="(https:\/\/github\.com\/user-attachments\/assets\/[^"]+)"[^>]*>/g;
const MARKDOWN_IMAGE_REGEX =
  /!\[[^\]]*\]\((https:\/\/github\.com\/user-attachments\/assets\/[^)]+)\)/g;

// ファイル用：PDFやその他のドキュメント
const FILE_ATTACHMENT_REGEX =
  /\[[^\]]+\]\((https:\/\/github\.com\/user-attachments\/files\/[^)]+)\)/g;
```

### 2. ファイルタイプの拡張

サポートするファイルタイプを拡張：

```javascript
const SUPPORTED_FILE_EXTENSIONS = {
  images: [".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp", ".ico"],
  documents: [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx"],
  text: [".txt", ".md", ".csv", ".json", ".xml", ".yaml", ".yml"],
  archives: [".zip", ".tar", ".gz", ".rar"],
};
```

### 3. ダウンロード処理の改善

```javascript
export async function downloadAllAttachments(
  octokits: Octokits,
  owner: string,
  repo: string,
  comments: CommentWithImages[],
): Promise<Map<string, string>> {
  // 1. すべての添付ファイルURLを収集
  const attachments = collectAllAttachments(comments);

  // 2. ファイルタイプごとに適切な処理
  for (const attachment of attachments) {
    if (isImage(attachment)) {
      await downloadImage(attachment);
    } else if (isPDF(attachment)) {
      await downloadPDF(attachment);
    } else {
      await downloadFile(attachment);
    }
  }

  return urlToPathMap;
}
```

### 4. ファイル名の保持

元のファイル名を保持して、ユーザーが識別しやすくする：

```javascript
function extractFileName(url: string): string {
  const match = url.match(/\/([^/]+\.[^/]+)$/);
  return match ? match[1] : generateDefaultFileName();
}
```

### 5. エラーハンドリングの強化

- ファイルサイズ制限のチェック
- ダウンロード失敗時のリトライ機構
- 非対応ファイルタイプの警告表示

## 実装計画

1. **Phase 1**: 画像検出の改善

   - `<img>`タグ形式のサポート追加
   - 既存のMarkdown形式との互換性維持

2. **Phase 2**: PDFサポート

   - `/files/`パスの検出追加
   - PDFダウンロード機能の実装

3. **Phase 3**: その他のファイルタイプ

   - ドキュメント、テキストファイルのサポート
   - ファイルタイプごとの適切な処理

4. **Phase 4**: テストとドキュメント
   - 各ファイルタイプのテストケース追加
   - ユーザー向けドキュメントの更新

## 期待される効果

1. **ユーザビリティの向上**

   - GitHubに添付されたすべてのファイルをClaudeが認識可能に
   - より正確なコンテキスト理解による応答品質の向上

2. **エラーの削減**

   - ファイル読み込み失敗によるタスク実行エラーの減少
   - ユーザーが再度ファイルを共有する必要がなくなる

3. **機能の拡張性**
   - 新しいファイルタイプへの対応が容易に
   - GitHubの仕様変更にも柔軟に対応可能
