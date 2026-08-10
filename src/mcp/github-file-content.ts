export function createBase64BlobPayload(content: Uint8Array) {
  return {
    content: Buffer.from(content).toString("base64"),
    encoding: "base64" as const,
  };
}
