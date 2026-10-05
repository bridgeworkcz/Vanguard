const KEY = "vg-desk";

export function desktopOn() {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function applyDesktop(on: boolean) {
  const meta = document.querySelector('meta[name="viewport"]');
  if (meta) meta.setAttribute("content", on ? "width=1280" : "width=device-width, initial-scale=1");
}

export function toggleDesktop() {
  const next = !desktopOn();
  try {
    localStorage.setItem(KEY, next ? "1" : "0");
  } catch {
    /* storage unavailable */
  }
  applyDesktop(next);
  window.location.reload();
}
