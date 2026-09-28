// Multi-format document conversion engine.
// Import: docx, odt, rtf, md, html, txt, csv, tsv, xlsx, ods, json
// Export: docx, odt, html, md, txt, pdf(print) · xlsx, ods, csv, tsv, json · decks: html, json, pdf(print)
// Office formats are real OOXML/ODF zips built with lib/zip.ts — no deps.

import { zipSync, unzipAsync } from "./zip";
import { parseCsv, toCsv, htmlToMarkdown, htmlToText, download } from "./utils";
import type { Deck, Slide, SlideBlock } from "../types";

// ── Shared helpers ──────────────────────────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export type FileKind = "document" | "spreadsheet" | "deck";

export const IMPORT_DOC = ".docx,.odt,.rtf,.md,.markdown,.html,.htm,.txt";
export const IMPORT_SHEET = ".csv,.tsv,.xlsx,.ods,.json";
export const IMPORT_DECK = ".json,.html,.htm";

export function importFilterFor(kind: FileKind): string {
  if (kind === "document") return IMPORT_DOC;
  if (kind === "spreadsheet") return IMPORT_SHEET;
  return IMPORT_DECK;
}

// ── DOCX (Word) ─────────────────────────────────────────────────

export function buildDocxZip(title: string, bodyHtml: string): Uint8Array {
  // Convert the editor HTML to a simple OOXML paragraph run list.
  const tpl = document.createElement("template");
  tpl.innerHTML = bodyHtml;
  const paras: string[] = [];

  const walk = (root: Node): void => {
    for (const node of Array.from(root.childNodes)) {
      if (node.nodeType === Node.TEXT_NODE) {
        const t = node.textContent ?? "";
        if (t.trim()) paras.push(ooxmlPara(esc(t), false, false));
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (/^(div|p|section)$/i.test(tag) && !el.querySelector("p,div")) {
          paras.push(ooxmlPara(el.innerHTML, false, false));
        } else if (/^h[1-6]$/i.test(tag)) {
          const lvl = parseInt(tag[1], 10);
          paras.push(ooxmlPara(el.innerHTML, true, false, lvl));
        } else if (/^(li)$/i.test(tag)) {
          paras.push(ooxmlPara("• " + el.innerHTML, false, false));
        } else if (/^(br)$/i.test(tag)) {
          paras.push(ooxmlPara("", false, false));
        } else if (el.children.length) {
          walk(el);
        } else if (el.textContent?.trim()) {
          const bold = /^(b|strong)$/i.test(tag);
          const italic = /^(i|em)$/i.test(tag);
          paras.push(ooxmlPara(el.innerHTML, bold, italic));
        }
      }
    }
  };
  walk(tpl.content);

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:body>
${paras.join("\n")}
<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr>
</w:body>
</w:document>`;

  const zip = zipSync([
    { name: "[Content_Types].xml", data: str(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>` )},
    { name: "_rels/.rels", data: str(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`) },
    { name: "word/document.xml", data: str(documentXml) }
  ]);
  return zip;
}

export function exportDocx(title: string, bodyHtml: string): void {
  downloadBinary(`${safe(title)}.docx`, buildDocxZip(title, bodyHtml), "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
}

function str(s: string): Uint8Array {
  return new TextEncoder().encode(s);
}

function ooxmlPara(inner: string, bold: boolean, italic: boolean, heading?: number): string {
  const rPr = `${bold ? "<w:rPr><w:b/></w:rPr>" : italic ? "<w:rPr><w:i/></w:rPr>" : ""}`;
  if (heading) {
    return `<w:p><w:pPr><w:outlineLvl w:val="${heading - 1}"/></w:pPr><w:r><w:rPr><w:b/><w:sz w:val="${48 - heading * 4}"/></w:rPr><w:t xml:space="preserve">${inner}</w:t></w:r></w:p>`;
  }
  return `<w:p><w:r>${rPr}<w:t xml:space="preserve">${inner}</w:t></w:r></w:p>`;
}

export async function importDocx(bytes: Uint8Array): Promise<string> {
  const files = await unzipAsync(bytes);
  const doc = files.get("word/document.xml");
  if (!doc) throw new Error("Invalid .docx: missing word/document.xml");
  const xml = new TextDecoder().decode(doc);
  return ooxmlToHtml(xml);
}

function ooxmlToHtml(xml: string): string {
  let html = xml;
  // Paragraphs
  html = html.replace(/<w:p[ >]/g, "\n<p>").replace(/<\/w:p>/g, "</p>");
  // Headings via outline level
  html = html.replace(/<w:p>([\s\S]*?)<w:outlineLvl w:val="([0-5])"\/>[\s\S]*?<\/w:p>/g, (_m, inner: string, lvl: string) => {
    const level = parseInt(lvl, 10) + 1;
    const text = stripXmlTags(inner);
    return `<h${level}>${text}</h${level}>`;
  });
  // Runs
  html = html.replace(/<w:r\b[^>]*>([\s\S]*?)<\/w:r>/g, (_m, inner: string) => {
    const text = (inner.match(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g) ?? [])
      .map((t) => t.replace(/<w:t[^>]*>|<\/w:t>/g, ""))
      .join("");
    let out = text;
    if (/<w:b\/>/.test(inner)) out = `<b>${out}</b>`;
    if (/<w:i\/>/.test(inner)) out = `<i>${out}</i>`;
    if (/<w:u\/>/.test(inner)) out = `<u>${out}</u>`;
    if (/<w:strike\/>/.test(inner)) out = `<s>${out}</s>`;
    return out;
  });
  html = html.replace(/<w:p>/g, "<p>").replace(/<\/w:p>/g, "</p>");
  html = stripXmlTags(html, ["p", "b", "i", "u", "s", "h1", "h2", "h3", "h4", "h5", "h6"]);
  // Light cleanup of stray braces from other namespaces
  html = html.replace(/<\/?(w|a|r|wp):[^>]*>/g, "");
  return html.replace(/(<p>\s*<\/p>\s*)+/g, "").trim();
}

function stripXmlTags(xml: string, keep: string[] = []): string {
  const keepRe = keep.length ? new RegExp(`^(${keep.join("|")})$`, "i") : null;
  return xml.replace(/<\/?([a-zA-Z0-9:._-]+)(\s[^>]*)?\/?>/g, (m, tag: string) => {
    const bare = tag.split(":").pop()!.toLowerCase();
    if (keepRe && keepRe.test(bare)) return m.includes("</") ? `</${bare}>` : `<${bare}>`;
    return "";
  });
}

// ── ODT (OpenDocument Text) ─────────────────────────────────────

export function buildOdtZip(title: string, bodyHtml: string): Uint8Array {
  const tpl = document.createElement("template");
  tpl.innerHTML = bodyHtml;
  const blocks: string[] = [];
  const root = tpl.content;
  const pushPara = (html: string, style: string): void => {
    blocks.push(`<text:p text:style-name="${style}">${html}</text:p>`);
  };

  const walk = (node: Node): void => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const t = child.textContent ?? "";
        if (t.trim()) pushPara(esc(t), "Standard");
      } else if (child.nodeType === Node.ELEMENT_NODE) {
        const el = child as HTMLElement;
        const tag = el.tagName.toLowerCase();
        if (/^h[1-6]$/.test(tag)) {
          const lvl = tag[1];
          blocks.push(`<text:h text:outline-level="${lvl}">${esc(el.textContent ?? "")}</text:h>`);
        } else if (/^(p|div|section)$/.test(tag) && !el.querySelector("p,div,h1,h2,h3")) {
          pushPara(el.innerHTML, "Standard");
        } else if (tag === "li") {
          pushPara("• " + el.innerHTML, "Standard");
        } else if (el.children.length) {
          walk(el);
        } else if (el.textContent?.trim()) {
          pushPara(el.innerHTML, "Standard");
        }
      }
    }
  };
  walk(root);

  const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2">
<office:body><office:text>
${blocks.join("\n")}
</office:text></office:body></office:document-content>`;

  const zip = zipSync([
    { name: "mimetype", data: str("application/vnd.oasis.opendocument.text") },
    { name: "META-INF/manifest.xml", data: str(`<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.text"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`) },
    { name: "content.xml", data: str(contentXml) }
  ]);
  return zip;
}

export function exportOdt(title: string, bodyHtml: string): void {
  downloadBinary(`${safe(title)}.odt`, buildOdtZip(title, bodyHtml), "application/vnd.oasis.opendocument.text");
}

export async function importOdt(bytes: Uint8Array): Promise<string> {
  const files = await unzipAsync(bytes);
  const content = files.get("content.xml");
  if (!content) throw new Error("Invalid .odt: missing content.xml");
  const xml = new TextDecoder().decode(content);
  let html = xml;
  html = html.replace(/<text:h[^>]*text:outline-level="([1-6])"[^>]*>([\s\S]*?)<\/text:h>/g, (_m, l: string, t: string) => `<h${l}>${t}</h${l}>`);
  html = html.replace(/<text:p[^>]*>/g, "<p>").replace(/<\/text:p>/g, "</p>");
  html = html.replace(/<text:span[^>]*>/g, "").replace(/<\/text:span>/g, "");
  html = html.replace(/<text:list[^>]*>/g, "<ul>").replace(/<\/text:list>/g, "</ul>");
  html = html.replace(/<text:list-item[^>]*>/g, "<li>").replace(/<\/text:list-item>/g, "</li>");
  html = stripXmlTags(html, ["p", "ul", "li", "h1", "h2", "h3", "h4", "h5", "h6", "b", "i"]);
  html = html.replace(/<\/?(office|style|draw|table|dc|meta):[^>]*>/g, "");
  const body = html.match(/<office:body>([\s\S]*)<\/office:body>/);
  return (body ? body[1] : html).trim();
}

// ── RTF (basic import) ──────────────────────────────────────────

export function importRtf(rtf: string): string {
  let t = rtf;
  // \'xx hex escapes
  t = t.replace(/\\'([0-9a-fA-F]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
  // Destination groups to discard entirely (font tables, colors, stylesheets)
  t = t.replace(/\\\*(?:fonttbl|colortbl|stylesheet|info|pict)[\s\S]*?(?:\}|(?=\\par))/gi, "");
  // Escaped special characters -> placeholders
  t = t.replace(/\\\\/g, "\u0001");
  t = t.replace(/\\\{/g, "\u0002").replace(/\\\}/g, "\u0003");
  // Paragraph and line breaks
  t = t.replace(/\\par[d]?\b/g, "\n");
  t = t.replace(/\\line\b/g, "\n");
  // Bold / italic toggles -> private-use markers so they survive esc() below
  // (the space after a control word is its delimiter, so consume it too)
  t = t.replace(/\\b0 /g, "\u0005").replace(/\\b0(?=[\\{}])/g, "\u0005");
  t = t.replace(/\\b /g, "\u0004").replace(/\\b(?=[\\{}])/g, "\u0004");
  t = t.replace(/\\i0 /g, "\u0007").replace(/\\i0(?=[\\{}])/g, "\u0007");
  t = t.replace(/\\i /g, "\u0006").replace(/\\i(?=[\\{}])/g, "\u0006");
  // Remaining control words (with optional numeric parameter) and braces
  t = t.replace(/\\[a-zA-Z]+-?\d* ?/g, "");
  t = t.replace(/[{}]/g, "");
  t = t.replace(/\u0001/g, "\\").replace(/\u0002/g, "{").replace(/\u0003/g, "}");
  return t
    .split(/\n{2,}/)
    .map((p) =>
      `<p>${esc(p.trim())
        .replace(/\n/g, "<br>")
        .replace(/\u0004/g, "<b>")
        .replace(/\u0005/g, "</b>")
        .replace(/\u0006/g, "<i>")
        .replace(/\u0007/g, "</i>")}</p>`
    )
    .filter((p) => p !== "<p></p>")
    .join("\n");
}

// ── HTML / MD / TXT ─────────────────────────────────────────────

export function exportHtml(title: string, bodyHtml: string): void {
  download(`${safe(title)}.html`, `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>\n<article>\n${bodyHtml}\n</article>`, "text/html");
}

export function exportMarkdown(title: string, bodyHtml: string): void {
  download(`${safe(title)}.md`, htmlToMarkdown(bodyHtml), "text/markdown");
}

export function exportTxt(title: string, bodyHtml: string): void {
  download(`${safe(title)}.txt`, htmlToText(bodyHtml), "text/plain");
}

export function importMarkdown(md: string): string {
  const lines = md.split(/\r?\n/);
  const out: string[] = [];
  let inList: "ul" | "ol" | null = null;
  let inCode = false;
  const closeList = (): void => { if (inList) { out.push(`</${inList}>`); inList = null; } };
  const inline = (s: string): string => esc(s)
    .replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
    .replace(/(^|\W)\*([^*]+)\*/g, "$1<i>$2</i>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  for (const raw of lines) {
    const line = raw;
    if (/^```/.test(line)) {
      closeList();
      out.push(inCode ? "</pre>" : "<pre>");
      inCode = !inCode;
      continue;
    }
    if (inCode) { out.push(esc(line)); continue; }
    const h = /^(#{1,6})\s+(.*)$/.exec(line);
    if (h) { closeList(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    const ul = /^[-*+]\s+(.*)$/.exec(line);
    const ol = /^\d+[.)]\s+(.*)$/.exec(line);
    if (ul) { if (inList !== "ul") { closeList(); out.push("<ul>"); inList = "ul"; } out.push(`<li>${inline(ul[1])}</li>`); continue; }
    if (ol) { if (inList !== "ol") { closeList(); out.push("<ol>"); inList = "ol"; } out.push(`<li>${inline(ol[1])}</li>`); continue; }
    if (/^>\s?/.test(line)) { closeList(); out.push(`<blockquote>${inline(line.replace(/^>\s?/, ""))}</blockquote>`); continue; }
    if (/^(---|\*\*\*|___)\s*$/.test(line)) { closeList(); out.push("<hr>"); continue; }
    if (!line.trim()) { closeList(); continue; }
    closeList();
    out.push(`<p>${inline(line)}</p>`);
  }
  closeList();
  if (inCode) out.push("</pre>");
  return out.join("\n");
}

export function importHtmlFile(html: string): string {
  const tpl = document.createElement("template");
  tpl.innerHTML = html;
  tpl.content.querySelectorAll("script,style,meta,link,title").forEach((n) => n.remove());
  // innerHTML only exists on elements, so move nodes into a host div first
  // (works whether or not the parsed fragment kept a <body> element).
  const src = tpl.content.querySelector("body") ?? tpl.content;
  const host = document.createElement("div");
  while (src.firstChild) host.appendChild(src.firstChild);
  return host.innerHTML.replace(/\son\w+="[^"]*"/gi, "").trim();
}

// ── Spreadsheets: XLSX / ODS / CSV / TSV / JSON ────────────────

export interface SheetGrid {
  name: string;
  rows: string[][];
}

export function buildXlsxZip(name: string, grids: SheetGrid[]): Uint8Array {
  const sheetXml = (rows: string[][]): string => {
    const body = rows.map((row, r) => {
      const cells = row.map((v, c) => {
        if (v === "" || v === undefined) return "";
        const isNum = v !== "" && !isNaN(Number(v));
        const ref = `${colLetter(c)}${r + 1}`;
        return isNum
          ? `<c r="${ref}"><v>${Number(v)}</v></c>`
          : `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
      }).join("");
      return `<row r="${r + 1}">${cells}</row>`;
    }).join("");
    const dim = rows.length ? `A1:${colLetter(Math.max(...rows.map((r) => r.length)) )}${rows.length}` : "A1";
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="${dim}"/><sheetData>${body}</sheetData></worksheet>`;
  };

  const entries: { name: string; data: Uint8Array }[] = [
    { name: "[Content_Types].xml", data: str(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
${grids.map((_g, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("")}
</Types>`) },
    { name: "_rels/.rels", data: str(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`) },
    { name: "xl/workbook.xml", data: str(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${grids.map((g, i) => `<sheet name="${esc(g.name || `Sheet${i + 1}`)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("")}</sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", data: str(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${grids.map((_g, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join("")}
</Relationships>`) }
  ];
  grids.forEach((g, i) => entries.push({ name: `xl/worksheets/sheet${i + 1}.xml`, data: str(sheetXml(g.rows)) }));

  return zipSync(entries);
}

export function exportXlsx(name: string, grids: SheetGrid[]): void {
  downloadBinary(`${safe(name)}.xlsx`, buildXlsxZip(name, grids), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
}

export async function importXlsx(bytes: Uint8Array): Promise<SheetGrid[]> {
  const files = await unzipAsync(bytes);
  const sharedRaw = files.get("xl/sharedStrings.xml");
  const shared: string[] = [];
  if (sharedRaw) {
    const xml = new TextDecoder().decode(sharedRaw);
    for (const m of xml.matchAll(/<si>[\s\S]*?<\/si>/g)) {
      const texts = [...m[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]);
      shared.push(texts.join(""));
    }
  }
  const workbookXml = new TextDecoder().decode(files.get("xl/workbook.xml") ?? throwErr("Invalid .xlsx: missing workbook.xml"));
  const names = [...workbookXml.matchAll(/<sheet[^>]*name="([^"]*)"[^>]*>/g)].map((m) => m[1]);

  const sheets: SheetGrid[] = [];
  const sheetEntries = [...files.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort();
  for (let i = 0; i < sheetEntries.length; i++) {
    const xml = new TextDecoder().decode(files.get(sheetEntries[i])!);
    const rows: string[][] = [];
    for (const rm of xml.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
      const rowMap = new Map<number, string>();
      for (const cm of rm[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
        const attrs = cm[1];
        const ref = /r="([A-Z]+)(\d+)"/.exec(attrs);
        const col = ref ? colIndex(ref[1]) : rowMap.size;
        const t = /t="([^"]*)"/.exec(attrs)?.[1] ?? "n";
        const v = /<v>([\s\S]*?)<\/v>/.exec(cm[2])?.[1] ?? "";
        const isRaw = /<is>/.test(cm[2]);
        let val = "";
        if (t === "s") val = shared[parseInt(v, 10)] ?? "";
        else if (t === "inlineStr" || isRaw) val = [...cm[2].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join("");
        else val = decodeXmlEntities(v);
        rowMap.set(col, val);
      }
      if (rowMap.size) {
        const width = Math.max(...rowMap.keys()) + 1;
        const arr = Array.from({ length: width }, (_, k) => rowMap.get(k) ?? "");
        rows.push(arr);
      }
    }
    sheets.push({ name: names[i] ?? `Sheet${i + 1}`, rows });
  }
  if (!sheets.length) throw new Error("Invalid .xlsx: no worksheets found");
  return sheets;
}

function throwErr(msg: string): never {
  throw new Error(msg);
}

function decodeXmlEntities(s: string): string {
  return s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, "&");
}

export function buildOdsZip(name: string, grids: SheetGrid[]): Uint8Array {
  const sheetsXml = grids.map((g) => {
    const rows = g.rows.map((row) => {
      const cells = row.map((v) => {
        if (v === "" || v === undefined) return "";
        const isNum = v !== "" && !isNaN(Number(v));
        return isNum
          ? `<table:table-cell office:value-type="float" office:value="${Number(v)}"><text:p>${esc(v)}</text:p></table:table-cell>`
          : `<table:table-cell office:value-type="string"><text:p>${esc(v)}</text:p></table:table-cell>`;
      }).join("");
      return `<table:table-row>${cells}</table:table-row>`;
    }).join("");
    return `<table:table table:name="${esc(g.name || "Sheet1")}">${rows}</table:table>`;
  }).join("");

  const contentXml = `<?xml version="1.0" encoding="UTF-8"?>
<office:document-content xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0"
 xmlns:table="urn:oasis:names:tc:opendocument:xmlns:table:1.0"
 xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" office:version="1.2">
<office:body><office:spreadsheet>${sheetsXml}</office:spreadsheet></office:body></office:document-content>`;

  const zip = zipSync([
    { name: "mimetype", data: str("application/vnd.oasis.opendocument.spreadsheet") },
    { name: "META-INF/manifest.xml", data: str(`<?xml version="1.0" encoding="UTF-8"?>
<manifest:manifest xmlns:manifest="urn:oasis:names:tc:opendocument:xmlns:manifest:1.0" manifest:version="1.2">
<manifest:file-entry manifest:full-path="/" manifest:media-type="application/vnd.oasis.opendocument.spreadsheet"/>
<manifest:file-entry manifest:full-path="content.xml" manifest:media-type="text/xml"/>
</manifest:manifest>`) },
    { name: "content.xml", data: str(contentXml) }
  ]);
  return zip;
}

export function exportOds(name: string, grids: SheetGrid[]): void {
  downloadBinary(`${safe(name)}.ods`, buildOdsZip(name, grids), "application/vnd.oasis.opendocument.spreadsheet");
}

export async function importOds(bytes: Uint8Array): Promise<SheetGrid[]> {
  const files = await unzipAsync(bytes);
  const content = files.get("content.xml");
  if (!content) throw new Error("Invalid .ods: missing content.xml");
  const xml = new TextDecoder().decode(content);
  const sheets: SheetGrid[] = [];
  for (const table of xml.matchAll(/<table:table[^>]*table:name="([^"]*)"[^>]*>([\s\S]*?)<\/table:table>/g)) {
    const rows: string[][] = [];
    for (const rm of table[2].matchAll(/<table:table-row[^>]*>([\s\S]*?)<\/table:table-row>/g)) {
      const cells: string[] = [];
      for (const cm of rm[1].matchAll(/<table:table-cell([^>]*)>([\s\S]*?)<\/table:table-cell>|<table:table-cell([^>]*)\/>/g)) {
        const attrs = cm[1] || cm[3] || "";
        const repeat = parseInt(/table:number-columns-repeated="(\d+)"/.exec(attrs)?.[1] ?? "1", 10);
        const vtype = /office:value-type="([^"]*)"/.exec(attrs)?.[1];
        let val = "";
        if (vtype === "float") val = /office:value="([^"]*)"/.exec(attrs)?.[1] ?? "";
        const text = [...(cm[2] ?? "").matchAll(/<text:p[^>]*>([\s\S]*?)<\/text:p>/g)].map((p) => p[1]).join("\n");
        if (vtype !== "float" && text) val = decodeXmlEntities(text);
        for (let k = 0; k < Math.min(repeat, 64); k++) cells.push(val);
      }
      if (cells.some((c) => c !== "")) rows.push(cells);
    }
    sheets.push({ name: table[1], rows });
  }
  if (!sheets.length) throw new Error("Invalid .ods: no tables found");
  return sheets;
}

export function exportCsv(rows: string[][]): void {
  download(`${"export"}.csv`, toCsv(rows), "text/csv");
}

// ── Decks ───────────────────────────────────────────────────────

export function exportDeckHtml(title: string, deck: Deck): void {
  const slides = deck.slides.filter((s) => !s.skipped).map((s) => {
    const blocks = s.blocks.map((b) => {
      const st = `left:${b.x}%;top:${b.y}%;width:${b.w}%;height:${b.h}%;font-size:${b.fontSize}px;color:${b.color};text-align:${b.align};font-weight:${b.bold ? 700 : 400};font-style:${b.italic ? "italic" : "normal"}`;
      if (b.type === "image" && b.text) return `<img src="${esc(b.text)}" style="${st}" class="abs">`;
      if (b.type === "line") return `<div style="${st}" class="abs"><div style="height:2px;background:${b.color};margin-top:${b.h}%"></div></div>`;
      const content = b.link ? `<a href="${esc(b.link)}" style="color:inherit">${esc(b.text)}</a>` : esc(b.text);
      return `<div style="${st}" class="abs">${content}</div>`;
    }).join("\n");
    return `<section class="slide" style="background:${s.background}">${blocks}</section>`;
  }).join("\n");

  download(`${safe(title)}.html`, `<!doctype html><meta charset="utf-8"><title>${esc(title)}</title>
<style>
body{margin:0;background:#111;display:grid;place-items:center;min-height:100vh}
.slide{width:min(92vw,calc(92vh*16/9));aspect-ratio:16/9;position:relative;background:#fff;box-shadow:0 8px 40px rgba(0,0,0,.5);border-radius:4px;overflow:hidden}
.abs{position:absolute;overflow:hidden}
</style>
${slides}
<script>
const slides=[...document.querySelectorAll(".slide")];let i=0;slides.slice(1).forEach(s=>s.style.display="none");
addEventListener("keydown",e=>{if(e.key==="ArrowRight"||e.key===" "){slides[i].style.display="none";i=Math.min(i+1,slides.length-1);slides[i].style.display=""}if(e.key==="ArrowLeft"){slides[i].style.display="none";i=Math.max(i-1,0);slides[i].style.display=""}});
</${"script"}>`, "text/html");
}

// ── JSON envelopes ──────────────────────────────────────────────

export function exportJson(name: string, content: unknown): void {
  download(`${safe(name)}.json`, JSON.stringify(content, null, 2), "application/json");
}

export function importJson<T>(text: string): T {
  return JSON.parse(text) as T;
}

// ── Clipboard: read a file in the browser/Tauri ────────────────

export async function readFileBytes(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.arrayBuffer());
}

export async function readFileText(file: File): Promise<string> {
  return file.text();
}

export function colLetter(index: number): string {
  let s = "";
  let n = index;
  do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
  return s;
}

export function colIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function safe(name: string): string {
  return name.replace(/[^\w\- ]+/g, "").trim() || "export";
}

function downloadBinary(name: string, data: Uint8Array, mime: string): void {
  const blob = new Blob([data as BlobPart], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
