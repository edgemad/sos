// Attachments for Talia's documents: embed images (pasted, dropped or picked)
// and attach ANY file type as a clickable chip. Zero dependencies — browser
// APIs on the web side, Tauri's asset protocol + opener on the desktop side.
//
// Docs persist in localStorage, so embedded images are downscaled before they
// become data URLs; desktop attachments reference the on-disk path instead of
// copying bytes.

/** Files at or below this size are embedded as data URLs in browser mode;
 *  bigger ones become inert chips (name + size only). */
export const MAX_INLINE_ATTACHMENT_BYTES = 512 * 1024;

/** Longest edge allowed for embedded (data-URL) images. Keeps localStorage
 *  and exports healthy; disk-backed images are never downscaled. */
export const MAX_EMBEDDED_IMAGE_EDGE = 1600;

// ── Pure helpers (unit-tested) ──────────────────────────────────────────

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "avif"]);

export function extOf(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name.trim());
  return m ? m[1].toLowerCase() : "";
}

/** True when the file looks like an image (mime type or extension). */
export function isImageFile(name: string, mime?: string): boolean {
  if (mime?.startsWith("image/")) return true;
  return IMAGE_EXTS.has(extOf(name));
}

const BYTE_UNITS = ["B", "KB", "MB", "GB"] as const;

/** Human file size: 0 → "0 B", 1536 → "1.5 KB", 2097152 → "2.0 MB". */
export function formatBytes(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  let v = n;
  let unit = 0;
  while (v >= 1024 && unit < BYTE_UNITS.length - 1) {
    v /= 1024;
    unit++;
  }
  const rounded = unit === 0 ? String(Math.round(v)) : v.toFixed(1);
  return `${rounded} ${BYTE_UNITS[unit]}`;
}

/** A friendly emoji for a file name, paperclip by default. */
export function iconForFile(name: string): string {
  const ext = extOf(name);
  if (IMAGE_EXTS.has(ext)) return "🖼️";
  switch (ext) {
    case "pdf": return "📕";
    case "doc":
    case "docx":
    case "odt":
    case "rtf": return "📄";
    case "xls":
    case "xlsx":
    case "ods":
    case "csv": return "📊";
    case "ppt":
    case "pptx":
    case "odp": return "📽️";
    case "zip":
    case "rar":
    case "7z":
    case "tar":
    case "gz": return "🗜️";
    case "mp3":
    case "wav":
    case "ogg":
    case "m4a":
    case "flac": return "🎵";
    case "mp4":
    case "mov":
    case "webm":
    case "avi":
    case "mkv": return "🎬";
    case "js":
    case "ts":
    case "py":
    case "rs":
    case "go":
    case "java":
    case "c":
    case "cpp":
    case "html":
    case "css":
    case "json": return "🧩";
    case "txt":
    case "md": return "📃";
    default: return "📎";
  }
}

/** Escape a string for safe use inside a double-quoted HTML attribute. */
export function escapeAttr(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export interface AttachmentChip {
  name: string;
  size?: number;
  /** Where the payload lives: `data:…` (embedded) or a filesystem path
   *  (desktop). Omit for inert chips. */
  target?: string;
  icon?: string;
}

/** Build the self-contained attachment chip HTML. Styles are inline so the
 *  chip renders identically inside the editor, exports and PDFs. */
export function buildAttachmentChip(a: AttachmentChip): string {
  const icon = a.icon ?? iconForFile(a.name);
  const size = a.size != null ? ` <span style="opacity:.6;font-weight:400">· ${formatBytes(a.size)}</span>` : "";
  const target = a.target ? ` data-sos-target="${escapeAttr(a.target)}"` : "";
  return (
    `<span class="sos-attach" contenteditable="false"${target} ` +
    `style="display:inline-flex;align-items:center;gap:6px;padding:4px 10px;margin:2px 2px;` +
    `border:1px solid #dadce0;border-radius:999px;background:#f8fbff;font:inherit;` +
    `font-size:.92em;line-height:1.2;vertical-align:middle;white-space:nowrap;cursor:pointer">` +
    `<span aria-hidden="true">${icon}</span>` +
    `<span style="font-weight:500">${escapeAttr(a.name)}</span>${size}` +
    `</span><span>&nbsp;</span>`
  );
}

/** Does this src point at embedded bytes (data URL) rather than a disk path? */
export function isEmbeddedSrc(src: string): boolean {
  return src.startsWith("data:");
}

// ── Runtime helpers (browser/Tauri; not unit-tested) ────────────────────

/** Read a File as a data URL. Rejects when FileReader fails. */
export function readFileDataUrl(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

/** Downscale an image File to a data URL whose longest edge is `maxDim`.
 *  Falls back to the raw data URL when the canvas path is unavailable
 *  (e.g. exotic formats, jsdom). Never rejects for usable files. */
export async function fileToEmbeddedImageSrc(file: Blob, maxDim = MAX_EMBEDDED_IMAGE_EDGE): Promise<string> {
  const raw = await readFileDataUrl(file);
  try {
    const img = await loadImage(raw);
    const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale >= 1) return raw; // already small enough — keep original quality
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return raw;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // PNG sources keep their alpha; everything else re-encodes as JPEG.
    const type = file.type === "image/png" ? "image/png" : "image/jpeg";
    return canvas.toDataURL(type, 0.85);
  } catch {
    return raw;
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image decode failed"));
    img.src = src;
  });
}
