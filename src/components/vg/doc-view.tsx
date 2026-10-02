import { useEffect, useState } from "react";
import workerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

export function DocScreen({
  url,
  title,
  onClose,
  onDownload,
  closeLabel,
  downloadLabel,
}: {
  url: string;
  title: string;
  onClose: () => void;
  onDownload: () => void;
  closeLabel: string;
  downloadLabel: string;
}) {
  const [pages, setPages] = useState<string[]>([]);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  useEffect(() => {
    let stop = false;
    void (async () => {
      try {
        const pdfjs = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
        const response = await fetch(url);
        const buffer = (await response.arrayBuffer()) as ArrayBuffer;
        const data = new Uint8Array(buffer);
        const doc = await pdfjs.getDocument({ data }).promise;
        const width = Math.min(window.innerWidth - 16, 860);
        const out: string[] = [];
        for (let index = 1; index <= doc.numPages; index += 1) {
          if (stop) return;
          const page = await doc.getPage(index);
          const base = page.getViewport({ scale: 1 });
          const pixel = (width / base.width) * Math.min(2, window.devicePixelRatio || 1);
          const viewport = page.getViewport({ scale: pixel });
          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(viewport.width);
          canvas.height = Math.floor(viewport.height);
          const ctx = canvas.getContext("2d");
          if (!ctx) continue;
          await page.render({ canvasContext: ctx, viewport }).promise;
          out.push(canvas.toDataURL("image/jpeg", 0.92));
        }
        if (!stop) setPages(out);
      } catch {
        if (!stop) setFailed(true);
      }
    })();
    return () => {
      stop = true;
    };
  }, [url]);

  return (
    <div className="fixed inset-0 z-[80] flex flex-col overflow-hidden bg-[#070809]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-3 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <p className="min-w-0 flex-1 truncate text-sm text-mist">{title}</p>
        <div className="flex shrink-0 gap-2">
          <button type="button" className="btn-solid !min-h-9 !px-3 text-xs" onClick={onDownload}>
            {downloadLabel}
          </button>
          <button type="button" className="btn !min-h-9 !px-3 text-xs" onClick={onClose}>
            {closeLabel}
          </button>
        </div>
      </div>
      <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain px-2 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {failed ? (
          <iframe title={title} src={`${url}#view=FitH&toolbar=0`} className="h-full w-full bg-white" />
        ) : pages.length === 0 ? (
          <p className="px-3 py-10 text-sm text-mist">...</p>
        ) : (
          pages.map((src, index) => (
            <img key={index} src={src} alt="" className="mx-auto mb-3 block w-full max-w-3xl bg-white shadow-lg" />
          ))
        )}
      </div>
    </div>
  );
}
