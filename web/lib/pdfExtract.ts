/**
 * pdfExtract.ts
 * Uses PDF.js (pdfjs-dist) to extract all text from a PDF file (ArrayBuffer).
 * Works for both text-layer PDFs and most digitally-created PDFs.
 * Returns the full concatenated text string, preserving newlines between pages.
 */

let pdfjsLib: typeof import('pdfjs-dist') | null = null;

async function getPdfjs() {
  if (!pdfjsLib) {
    // pdfjs-dist does not ship declarations for this browser-only subpath.
    // @ts-expect-error The runtime module is present and avoids Node built-ins.
    pdfjsLib = await import('pdfjs-dist/build/pdf');
    // Point the worker at the static file we copied to /public
    pdfjsLib!.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  }
  return pdfjsLib;
}

export async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
  const pdfjs = await getPdfjs();

  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;

  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();

    // Reconstruct text preserving rough line breaks
    let lastY: number | null = null;
    const lineChunks: string[] = [];

    for (const item of textContent.items) {
      if ('str' in item) {
        const y = (item as any).transform?.[5] ?? 0;
        // New line when Y position changes significantly
        if (lastY !== null && Math.abs(y - lastY) > 2) {
          lineChunks.push('\n');
        }
        lineChunks.push(item.str);
        lastY = y;
      }
    }

    pageTexts.push(lineChunks.join(''));
  }

  return pageTexts.join('\n\n--- PAGE BREAK ---\n\n');
}
