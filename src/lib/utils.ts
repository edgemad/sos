// Generic helpers: markdown export, CSV parse/serialize, printable PDF export.

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

export function now(): number {
  return Date.now();
}

export function fmtDate(ts: number): string {
  const d = new Date(ts);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function fmtDateTime(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) +
    ", " +
    d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
  );
}

export function download(name: string, contents: string, mime = "text/plain"): void {
  const blob = new Blob([contents], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

// ── Markdown ────────────────────────────────────────────────────

/** Minimal HTML -> Markdown conversion for the Writer's export. */
export function htmlToMarkdown(html: string): string {
  let out = html
    .replace(/<h1[^>]*>(.*?)<\/h1>/gis, "# $1\n")
    .replace(/<h2[^>]*>(.*?)<\/h2>/gis, "## $1\n")
    .replace(/<h3[^>]*>(.*?)<\/h3>/gis, "### $1\n")
    .replace(/<strong[^>]*>(.*?)<\/strong>/gis, "**$1**")
    .replace(/<b[^>]*>(.*?)<\/b>/gis, "**$1**")
    .replace(/<em[^>]*>(.*?)<\/em>/gis, "_$1_")
    .replace(/<i[^>]*>(.*?)<\/i>/gis, "_$1_")
    .replace(/<li[^>]*>(.*?)<\/li>/gis, "- $1\n")
    .replace(/<\/?(ul|ol)[^>]*>/gi, "\n")
    .replace(/<blockquote[^>]*>(.*?)<\/blockquote>/gis, "> $1\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n");
  out = out.replace(/<[^>]+>/g, ""); // strip remaining tags
  return decodeEntities(out).replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

function decodeEntities(s: string): string {
  const el = document.createElement("textarea");
  el.innerHTML = s;
  return el.value;
}

/** Strip tags for word counts and plain-text export. */
export function htmlToText(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function countWords(html: string): number {
  const t = htmlToText(html);
  return t ? t.split(/\s+/).length : 0;
}

/** Escape a plain string into basic HTML paragraphs for the Writer. */
export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// ── CSV ─────────────────────────────────────────────────────────

export function parseCsv(text: string, delim = ","): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.length > 1 || row[0] !== "") rows.push(row);
      row = [];
    } else field += c;
  }
  row.push(field);
  if (row.length > 1 || row[0] !== "") rows.push(row);
  return rows;
}

export function toCsv(grid: string[][], delim = ","): string {
  return grid
    .map((row) =>
      row
        .map((cell) => {
          const s = cell ?? "";
          const special = delim === "\t" ? /[\t"\n]/ : /[",\n]/;
          return special.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        })
        .join(delim)
    )
    .join("\n");
}

// ── Printing / PDF (via the engine's print pipeline) ───────────

let printFrame: HTMLIFrameElement | null = null;

/**
 * Render `bodyHtml` into a hidden iframe and invoke print. Unlike the old
 * window.open("_blank") approach, this works inside Tauri's WKWebView /
 * WebView2 where spawned popups can be silently blocked — one more step
 * toward OnlyOffice-grade "it just works" reliability.
 */
export function printHtml(title: string, bodyHtml: string, extraCss = ""): void {
  const doc = `<!doctype html><html><head><meta charset="utf-8">
<title>${escapeHtml(title)}</title>
<style>
  @page { margin: 22mm; }
  body { font: 12pt/1.7 Georgia, serif; color: #202124; }
  h1,h2,h3 { line-height: 1.25; }
  table { border-collapse: collapse; } td,th { border: 1px solid #bbb; padding: 4px 8px; }
  ${extraCss}
</style></head><body>${bodyHtml}</body></html>`;

  // Reuse one hidden iframe; dropping the previous one avoids print races.
  if (printFrame?.isConnected) printFrame.remove();
  printFrame = document.createElement("iframe");
  printFrame.setAttribute("aria-hidden", "true");
  printFrame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
  document.body.appendChild(printFrame);
  const win = printFrame.contentWindow;
  if (!win) return;
  win.document.open();
  win.document.write(doc);
  win.document.close();
  const doPrint = (): void => {
    try {
      win.focus();
      win.print();
    } catch {
      /* engine refused; nothing else we can do — content stays in the iframe */
    }
  };
  if (win.document.readyState === "complete") setTimeout(doPrint, 150);
  else win.onload = () => setTimeout(doPrint, 150);
}

/** Open a print-ready document containing `html`; the user saves as PDF. */
export function exportPdf(title: string, bodyHtml: string): void {
  printHtml(title, bodyHtml);
}
