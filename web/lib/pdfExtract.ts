/**
 * pdfExtract.ts
 * Uses PDF.js (pdfjs-dist) to extract all text from a PDF file (ArrayBuffer).
 * Works for both text-layer PDFs and most digitally-created PDFs.
 * Returns the full concatenated text string, preserving newlines between pages.
 *
 * The actual PDF.js library files (pdf.min.mjs, pdf.worker.min.mjs) are served
 * from /public and loaded via URL — NOT imported from node_modules. This keeps
 * pdfjs-dist out of the edge/server bundle entirely.
 */

type PdfJsModule = {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (options: { data: Uint8Array }) => {
    promise: Promise<{
      numPages: number;
      getPage: (pageNumber: number) => Promise<{
        getTextContent: () => Promise<{ items: Array<{ str: string; transform?: number[] }> }>;
      }>;
    }>;
  };
};

let pdfjsLib: PdfJsModule | null = null;

async function getPdfjs() {
  if (!pdfjsLib) {
    // Load the browser bundle from /public so Cloudflare's edge bundler never
    // traverses pdfjs-dist's Node fallback imports (fs/http/https/url).
    // Keep the URL out of the server/edge dependency graph; it is fetched by
    // the browser from the static asset copied to /public.
    const loadBrowserModule = new Function('specifier', 'return import(specifier)') as (
      specifier: string,
    ) => Promise<PdfJsModule>;
    pdfjsLib = await loadBrowserModule('/pdf.min.mjs');
    // Point the worker at the static file we copied to /public
    pdfjsLib!.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  }
  return pdfjsLib;
}

export async function extractTextFromPdf(arrayBuffer: ArrayBuffer): Promise<string> {
  const pdfjs = (await getPdfjs())!;

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
