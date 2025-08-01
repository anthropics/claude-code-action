import { describe, test, expect } from "bun:test";
import {
  extractFileExtension,
  getFileTypeInfo,
  detectAllAttachments,
  validateFileSize,
  isSupportedFileType,
  SUPPORTED_FILE_TYPES,
  FILE_SIZE_LIMITS,
} from "../src/github/utils/file-type-detector";

describe("file-type-detector", () => {
  describe("extractFileExtension", () => {
    test("should extract extension from URL", () => {
      expect(
        extractFileExtension(
          "https://github.com/user-attachments/assets/test.png",
        ),
      ).toBe(".png");
      expect(
        extractFileExtension(
          "https://github.com/user-attachments/assets/document.pdf",
        ),
      ).toBe(".pdf");
      expect(
        extractFileExtension(
          "https://github.com/user-attachments/files/data.csv",
        ),
      ).toBe(".csv");
    });

    test("should handle URLs without extension", () => {
      expect(
        extractFileExtension(
          "https://github.com/user-attachments/assets/noextension",
        ),
      ).toBe(".unknown");
    });

    test("should handle empty filename", () => {
      expect(
        extractFileExtension("https://github.com/user-attachments/assets/"),
      ).toBe(".unknown");
    });

    test("should handle case insensitive extensions", () => {
      expect(
        extractFileExtension(
          "https://github.com/user-attachments/assets/test.PNG",
        ),
      ).toBe(".png");
      expect(
        extractFileExtension(
          "https://github.com/user-attachments/assets/doc.PDF",
        ),
      ).toBe(".pdf");
    });
  });

  describe("getFileTypeInfo", () => {
    test("should identify image files", () => {
      const info = getFileTypeInfo(
        "https://github.com/user-attachments/assets/test.png",
      );
      expect(info.category).toBe("image");
      expect(info.extension).toBe(".png");
      expect(info.sizeLimit).toBe(FILE_SIZE_LIMITS.images);
    });

    test("should identify document files", () => {
      const pdfInfo = getFileTypeInfo(
        "https://github.com/user-attachments/assets/doc.pdf",
      );
      expect(pdfInfo.category).toBe("document");
      expect(pdfInfo.extension).toBe(".pdf");
      expect(pdfInfo.sizeLimit).toBe(FILE_SIZE_LIMITS.documents);

      const docxInfo = getFileTypeInfo(
        "https://github.com/user-attachments/assets/doc.docx",
      );
      expect(docxInfo.category).toBe("document");
      expect(docxInfo.extension).toBe(".docx");
    });

    test("should identify text files", () => {
      const txtInfo = getFileTypeInfo(
        "https://github.com/user-attachments/assets/readme.txt",
      );
      expect(txtInfo.category).toBe("text");
      expect(txtInfo.extension).toBe(".txt");
      expect(txtInfo.sizeLimit).toBe(FILE_SIZE_LIMITS.text);

      const jsonInfo = getFileTypeInfo(
        "https://github.com/user-attachments/assets/config.json",
      );
      expect(jsonInfo.category).toBe("text");
      expect(jsonInfo.extension).toBe(".json");
    });

    test("should identify video files", () => {
      const mp4Info = getFileTypeInfo(
        "https://github.com/user-attachments/assets/video.mp4",
      );
      expect(mp4Info.category).toBe("video");
      expect(mp4Info.extension).toBe(".mp4");
      expect(mp4Info.sizeLimit).toBe(FILE_SIZE_LIMITS.videos);
    });

    test("should identify archive files", () => {
      const zipInfo = getFileTypeInfo(
        "https://github.com/user-attachments/assets/archive.zip",
      );
      expect(zipInfo.category).toBe("archive");
      expect(zipInfo.extension).toBe(".zip");
      expect(zipInfo.sizeLimit).toBe(FILE_SIZE_LIMITS.archives);
    });

    test("should identify development files", () => {
      const patchInfo = getFileTypeInfo(
        "https://github.com/user-attachments/assets/fix.patch",
      );
      expect(patchInfo.category).toBe("development");
      expect(patchInfo.extension).toBe(".patch");
      expect(patchInfo.sizeLimit).toBe(FILE_SIZE_LIMITS.development);
    });

    test("should handle unknown file types", () => {
      const unknownInfo = getFileTypeInfo(
        "https://github.com/user-attachments/assets/file.xyz",
      );
      expect(unknownInfo.category).toBe("unknown");
      expect(unknownInfo.extension).toBe(".xyz");
      expect(unknownInfo.sizeLimit).toBe(FILE_SIZE_LIMITS.default);
    });
  });

  describe("detectAllAttachments", () => {
    test("should detect markdown image links", () => {
      const body =
        "Here's an image: ![test](https://github.com/user-attachments/assets/test.png)";
      const attachments = detectAllAttachments(body);

      expect(attachments).toHaveLength(1);
      expect(attachments[0]?.url).toBe(
        "https://github.com/user-attachments/assets/test.png",
      );
      expect(attachments[0]?.type.category).toBe("image");
    });

    test("should detect img tag links", () => {
      const body =
        'Here is an image: <img src="https://github.com/user-attachments/assets/test.jpg" alt="test">';
      const attachments = detectAllAttachments(body);

      expect(attachments).toHaveLength(1);
      expect(attachments[0]?.url).toBe(
        "https://github.com/user-attachments/assets/test.jpg",
      );
      expect(attachments[0]?.type.category).toBe("image");
    });

    test("should detect file attachments", () => {
      const body =
        "Document: [report.pdf](https://github.com/user-attachments/files/report.pdf)";
      const attachments = detectAllAttachments(body);

      expect(attachments).toHaveLength(1);
      expect(attachments[0]?.url).toBe(
        "https://github.com/user-attachments/files/report.pdf",
      );
      expect(attachments[0]?.type.category).toBe("document");
    });

    test("should detect multiple attachments", () => {
      const body = `
        Image: ![img](https://github.com/user-attachments/assets/image.png)
        Document: [doc.pdf](https://github.com/user-attachments/files/document.pdf)
        Text: [data.csv](https://github.com/user-attachments/files/data.csv)
      `;
      const attachments = detectAllAttachments(body);

      expect(attachments).toHaveLength(3);
      expect(attachments.map((a) => a.type.category)).toEqual([
        "image",
        "document",
        "text",
      ]);
    });

    test("should deduplicate URLs", () => {
      const body = `
        ![img1](https://github.com/user-attachments/assets/test.png)
        ![img2](https://github.com/user-attachments/assets/test.png)
      `;
      const attachments = detectAllAttachments(body);

      expect(attachments).toHaveLength(1);
      expect(attachments[0]?.url).toBe(
        "https://github.com/user-attachments/assets/test.png",
      );
    });

    test("should handle mixed patterns", () => {
      const body = `
        Markdown: ![img](https://github.com/user-attachments/assets/image.png)
        HTML: <img src="https://github.com/user-attachments/assets/photo.jpg">
        File: [document.pdf](https://github.com/user-attachments/files/doc.pdf)
      `;
      const attachments = detectAllAttachments(body);

      expect(attachments).toHaveLength(3);
      expect(attachments.map((a) => a.type.category)).toEqual([
        "image",
        "image",
        "document",
      ]);
    });
  });

  describe("validateFileSize", () => {
    test("should validate file size within limits", () => {
      const imageInfo = getFileTypeInfo(
        "https://github.com/user-attachments/assets/test.png",
      );
      expect(validateFileSize(5 * 1024 * 1024, imageInfo)).toBe(true); // 5MB < 10MB limit
      expect(validateFileSize(15 * 1024 * 1024, imageInfo)).toBe(false); // 15MB > 10MB limit
    });

    test("should validate document file size", () => {
      const docInfo = getFileTypeInfo(
        "https://github.com/user-attachments/assets/doc.pdf",
      );
      expect(validateFileSize(20 * 1024 * 1024, docInfo)).toBe(true); // 20MB < 25MB limit
      expect(validateFileSize(30 * 1024 * 1024, docInfo)).toBe(false); // 30MB > 25MB limit
    });
  });

  describe("isSupportedFileType", () => {
    test("should identify supported file types", () => {
      const imageInfo = getFileTypeInfo(
        "https://github.com/user-attachments/assets/test.png",
      );
      expect(isSupportedFileType(imageInfo)).toBe(true);

      const docInfo = getFileTypeInfo(
        "https://github.com/user-attachments/assets/doc.pdf",
      );
      expect(isSupportedFileType(docInfo)).toBe(true);

      const textInfo = getFileTypeInfo(
        "https://github.com/user-attachments/assets/data.csv",
      );
      expect(isSupportedFileType(textInfo)).toBe(true);
    });

    test("should identify unsupported file types", () => {
      const unknownInfo = getFileTypeInfo(
        "https://github.com/user-attachments/assets/file.xyz",
      );
      expect(isSupportedFileType(unknownInfo)).toBe(false);
    });
  });

  describe("constants", () => {
    test("should have correct supported file types", () => {
      expect(SUPPORTED_FILE_TYPES.images).toContain(".png");
      expect(SUPPORTED_FILE_TYPES.images).toContain(".jpg");
      expect(SUPPORTED_FILE_TYPES.images).toContain(".svg");

      expect(SUPPORTED_FILE_TYPES.documents).toContain(".pdf");
      expect(SUPPORTED_FILE_TYPES.documents).toContain(".docx");

      expect(SUPPORTED_FILE_TYPES.text).toContain(".txt");
      expect(SUPPORTED_FILE_TYPES.text).toContain(".json");
      expect(SUPPORTED_FILE_TYPES.text).toContain(".csv");

      expect(SUPPORTED_FILE_TYPES.videos).toContain(".mp4");
      expect(SUPPORTED_FILE_TYPES.videos).toContain(".mov");

      expect(SUPPORTED_FILE_TYPES.archives).toContain(".zip");
      expect(SUPPORTED_FILE_TYPES.development).toContain(".patch");
    });

    test("should have correct file size limits", () => {
      expect(FILE_SIZE_LIMITS.images).toBe(10 * 1024 * 1024); // 10MB
      expect(FILE_SIZE_LIMITS.videos).toBe(10 * 1024 * 1024); // 10MB
      expect(FILE_SIZE_LIMITS.documents).toBe(25 * 1024 * 1024); // 25MB
      expect(FILE_SIZE_LIMITS.text).toBe(25 * 1024 * 1024); // 25MB
      expect(FILE_SIZE_LIMITS.archives).toBe(25 * 1024 * 1024); // 25MB
      expect(FILE_SIZE_LIMITS.development).toBe(25 * 1024 * 1024); // 25MB
      expect(FILE_SIZE_LIMITS.default).toBe(25 * 1024 * 1024); // 25MB
    });
  });
});
