import workerUrl from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";
export interface PermitText {
  text: string;
  sha256: string;
  filename: string;
  pages: number;
}
export async function extractPermit(file: File): Promise<PermitText> {
  if (file.size > 10 * 1024 * 1024)
    throw new Error("Permit exceeds the 10 MB limit.");
  const buffer = await file.arrayBuffer();
  if (new TextDecoder().decode(buffer.slice(0, 5)) !== "%PDF-")
    throw new Error("Choose a valid PDF file.");
  const sha256 = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", buffer)),
  )
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const loading = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    disableFontFace: true,
  });
  const doc = await loading.promise;
  try {
    if (doc.numPages > 40) throw new Error("Permit exceeds the 40-page limit.");
    const pages: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      const lines = new Map<number, string[]>();
      for (const item of content.items) {
        if (!("str" in item)) continue;
        const y = Math.round(item.transform[5]);
        lines.set(y, [...(lines.get(y) ?? []), item.str]);
      }
      pages.push(
        [...lines.entries()]
          .sort((a, b) => b[0] - a[0])
          .map(([, words]) => words.join(" "))
          .join("\n"),
      );
    }
    const text = pages.join("\n\n");
    if (!text.trim())
      throw new Error(
        "No extractable text. Scanned permits require manual transcription.",
      );
    return { text, sha256, filename: file.name, pages: doc.numPages };
  } finally {
    await loading.destroy();
  }
}
