/** iPhone Safari ignores <a download> on a blob and navigates the tab. Share the file instead, and never revoke the URL before Safari has read it. */
export function downloadPdf(source: Blob | string, name: string) {
  const keep = (url: string) => {
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    window.setTimeout(() => {
      a.remove();
      URL.revokeObjectURL(url);
    }, 60_000);
  };
  const ios =
    typeof navigator !== "undefined" &&
    (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1));
  void (async () => {
    let blob: Blob;
    let url: string;
    try {
      if (typeof source === "string") {
        url = source;
        blob = await fetch(source).then((res) => res.blob());
      } else {
        blob = source;
        url = URL.createObjectURL(source);
      }
    } catch {
      if (typeof source === "string") keep(source);
      return;
    }
    if (ios && typeof navigator.share === "function") {
      try {
        const file = new File([blob], name, { type: blob.type || "application/pdf" });
        if (navigator.canShare?.({ files: [file] })) {
          await navigator.share({ files: [file], title: name });
          URL.revokeObjectURL(url);
          return;
        }
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") {
          URL.revokeObjectURL(url);
          return;
        }
      }
    }
    keep(url);
  })();
}
