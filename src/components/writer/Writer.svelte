<script lang="ts">
  import { onDestroy } from "svelte";
  // Writer orchestrator — the Docs module. Mirrors Google Docs' chrome:
  // menu bar, formatting toolbar, document tabs + outline sidebar, canvas.
  import { openFile, updateContent, writerTabs, addWriterTab, selectWriterTab, renameWriterTab, deleteWriterTab, duplicateFile, trashFile, createFile, openInEditor } from "../../lib/state";
  import { countWords, htmlToMarkdown, htmlToText, escapeHtml, download, exportPdf } from "../../lib/utils";
  import { saveFileDialog, openFileDialog } from "../../lib/tauri";
  import { exportDocx, exportOdt, exportHtml, exportMarkdown, exportTxt, importDocx, importOdt, importRtf, importMarkdown, importHtmlFile, importFilterFor } from "../../lib/converters";
  import type { WriterDoc, WriterSettings } from "../../types";
  import DocsMenubar from "./DocsMenubar.svelte";
  import DocsToolbar from "./DocsToolbar.svelte";
  import DocSidebar from "./DocSidebar.svelte";
  import WriterCanvas from "./WriterCanvas.svelte";
  import TransferModal from "../layout/TransferModal.svelte";

  $: file = $openFile;
  $: doc = file && file.kind === "document" ? (file.content as WriterDoc) : null;
  $: tabs = doc ? writerTabs(doc) : [];
  $: settings = { ...(defaultSettings()), ...(doc?.settings ?? {}) } as WriterSettings;

  let canvasApi: { exec: (cmd: string, val?: string) => void; focus: () => void; scrollToHeading: (i: number) => void } | null = null;

  // Outline built from the active tab's headings
  $: headings = buildHeadings(doc?.html ?? "");
  function buildHeadings(html: string): { level: number; text: string; index: number }[] {
    const out: { level: number; text: string; index: number }[] = [];
    const re = /<h([1-3])[^>]*>(.*?)<\/h\1>/gi;
    let m: RegExpExecArray | null;
    let i = 0;
    while ((m = re.exec(html))) {
      const text = m[2].replace(/<[^>]+>/g, "").trim();
      if (text) out.push({ level: parseInt(m[1], 10), text, index: i++ });
    }
    return out;
  }

  function defaultSettings(): WriterSettings {
    return {
      orientation: "portrait", pageless: false, columns: 1, zoom: 100,
      header: "", footer: "", showHeader: false, showFooter: false,
      pageNumbers: "none", textDirection: "ltr"
    };
  }

  function saveDoc(next: WriterDoc): void {
    if (!file) return;
    updateContent(file.id, next);
  }

  function saveTabHtml(html: string): void {
    if (!file || !doc) return;
    const tabId = doc.activeTabId ?? tabs[0]?.id;
    const nextTabs = writerTabs(doc).map((t) => (t.id === tabId ? { ...t, html } : t));
    saveDoc({ ...doc, html, tabs: nextTabs, words: countWords(html) });
  }

  function patchSettings(patch: Partial<WriterSettings>): void {
    if (!doc) return;
    saveDoc({ ...doc, settings: { ...settings, ...patch } });
  }

  // ── Dialog state ────────────────────────────────────────────────

  let dialog: null | "wordcount" | "headerfooter" | "details" | "shortcuts" | "emoji" | "special" | "prefs" | "replace" | "link" = null;
  let showSidebar = true;
  let showRuler = true;

  // ── Import / Export ─────────────────────────────────────────────
  let transfer: null | "import" | "export" = null;
  const EXPORT_OPTS = [
    { id: "docx", label: "Microsoft Word (.docx)", ext: "DOCX", desc: "Opens in Word, LibreOffice, Pages" },
    { id: "odt", label: "OpenDocument (.odt)", ext: "ODT", desc: "OpenDocument standard format" },
    { id: "pdf", label: "PDF document (.pdf)", ext: "PDF", desc: "Print-ready, fixed layout" },
    { id: "html", label: "Web page (.html)", ext: "HTML", desc: "Self-contained web page" },
    { id: "md", label: "Markdown (.md)", ext: "MD", desc: "Plain-text formatting" },
    { id: "txt", label: "Plain text (.txt)", ext: "TXT", desc: "No formatting at all" }
  ];
  const IMPORT_OPTS = [
    { id: "docx", label: "Microsoft Word (.docx)", ext: "DOCX", desc: "Word 2007 and newer" },
    { id: "odt", label: "OpenDocument (.odt)", ext: "ODT", desc: "OpenDocument text" },
    { id: "rtf", label: "Rich Text (.rtf)", ext: "RTF", desc: "Rich Text Format" },
    { id: "md", label: "Markdown (.md)", ext: "MD", desc: "Markdown text" },
    { id: "html", label: "Web page (.html)", ext: "HTML", desc: "HTML document" },
    { id: "txt", label: "Plain text (.txt)", ext: "TXT", desc: "Text file" }
  ];

  function browserPick(filter: string): Promise<File | null> {
    return new Promise((resolve) => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = filter;
      inp.onchange = () => resolve(inp.files?.[0] ?? null);
      inp.oncancel = () => resolve(null);
      inp.click();
    });
  }

  async function doImport(format: string): Promise<void> {
    transfer = null;
    if (!file) return;
    try {
      const f = await browserPick(importFilterFor("document"));
      if (!f) return;
      let html = "";
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      if (ext === "docx" || format === "docx") html = await importDocx(new Uint8Array(await f.arrayBuffer()));
      else if (ext === "odt") html = await importOdt(new Uint8Array(await f.arrayBuffer()));
      else if (ext === "rtf") html = importRtf(await f.text());
      else if (ext === "md" || ext === "markdown") html = importMarkdown(await f.text());
      else if (ext === "html" || ext === "htm") html = importHtmlFile(await f.text());
      else html = importMarkdown(await f.text());
      if (!html) throw new Error("The file appears to be empty.");
      const id = createFile("document", f.name.replace(/\.[^.]+$/, ""));
      const created = (await import("../../lib/state")).metaOf;
      void created;
      // Set content directly through state helper
      const { updateContent } = await import("../../lib/state");
      updateContent(id, { html, activeTabId: null, words: countWords(html), tabs: null, settings: null } as unknown as WriterDoc);
      openInEditor(id);
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function doFormatExport(format: string): void {
    transfer = null;
    if (!file || !doc) return;
    const base = file.name.replace(/[\\/:*?"<>|]/g, "_");
    switch (format) {
      case "docx": exportDocx(base, doc.html); break;
      case "odt": exportOdt(base, doc.html); break;
      case "pdf": exportPdf(file.name, `<div class="writer-page">${doc.html}</div>`); break;
      case "html": {
        const page = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(file.name)}</title></head><body>${doc.html}</body></html>`;
        void saveFileDialog(`${base}.html`, page);
        break;
      }
      case "md": void saveFileDialog(`${base}.md`, htmlToMarkdown(doc.html)); break;
      case "txt": void saveFileDialog(`${base}.txt`, htmlToText(doc.html)); break;
    }
  }

  let findText = "";
  let replaceText = "";

  const EMOJIS = ["😀","😅","😊","😍","🤔","👍","👏","🙏","💪","🔥","✅","❌","⭐","❤️","🎉","🚀","💡","📌","📎","🗓️","📊","📈","💼","✉️","☎️","🕐","🌎","🍎","☕","🍕"];
  const SPECIALS = ["©","®","™","§","¶","†","‡","•","·","…","—","–","«","»","‹","›","„","“","”","‘","’","≤","≥","≠","≈","±","×","÷","°","µ","∞","√","∑","π","Ω","€","£","¥","¢","←","→","↑","↓","↔","⇒","∀","∂","∃","∅","∈","∉","⊂","∪","∩"];

  // ── Voice typing (Web Speech API, works offline on macOS/WKWebView) ──

  let voiceActive = false;
  let recognition: any = null;

  function toggleVoice(): void {
    if (voiceActive) {
      recognition?.stop();
      voiceActive = false;
      return;
    }
    const SR = (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition;
    if (!SR) {
      alert("Voice typing needs the Web Speech API — available in the desktop app and Chrome.");
      return;
    }
    recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = false;
    recognition.lang = navigator.language || "en-US";
    recognition.onresult = (e: any) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) {
          const text = e.results[i][0].transcript.trim();
          canvasApi?.exec("insertHTML", escapeHtml(text) + " ");
        }
      }
    };
    recognition.onend = () => (voiceActive = false);
    recognition.start();
    voiceActive = true;
  }

  // ── Command routing ─────────────────────────────────────────────

  function onCanvasEdit(e: CustomEvent<string>): void {
    saveTabHtml(e.detail);
  }

  function command(cmd: string, payload?: string): void {
    switch (cmd) {
      // File
      case "file:new": window.dispatchEvent(new CustomEvent("sos:new-doc")); return;
      case "file:open": window.dispatchEvent(new CustomEvent("sos:open-request")); return;
      case "file:import": transfer = "import"; return;
      case "file:download": transfer = "export"; return;
      case "file:make-copy": if (file) duplicateFile(file.id); return;
      case "file:export-pdf": doExport("pdf"); return;
      case "file:export-md": doExport("md"); return;
      case "file:export-txt": doExport("txt"); return;
      case "file:export-html": doExport("html"); return;
      case "file:save-sos": window.dispatchEvent(new CustomEvent("sos:save-request")); return;
      case "print": doExport("pdf"); return;
      case "file:details": dialog = "details"; return;
      case "file:trash": if (file) trashFile(file.id); return;
      // Edit
      case "undo": canvasApi?.exec("undo"); return;
      case "redo": canvasApi?.exec("redo"); return;
      case "cut": document.execCommand("cut"); return;
      case "copy": document.execCommand("copy"); return;
      case "paste": navigator.clipboard?.readText?.().then((t) => canvasApi?.exec("insertText", t)).catch(() => {}); return;
      case "paste-plain": navigator.clipboard?.readText?.().then((t) => canvasApi?.exec("insertText", t)).catch(() => {}); return;
      case "select-all": canvasApi?.exec("selectAll"); return;
      case "find": dialog = "replace"; return;
      // View
      case "view:pageless": patchSettings({ pageless: !settings.pageless }); return;
      case "view:show-ruler": showRuler = !showRuler; return;
      case "view:show-outline": showSidebar = !showSidebar; return;
      case "view:fullscreen": document.documentElement.requestFullscreen?.().catch(() => {}); return;
      case "view:zoom-in": patchSettings({ zoom: Math.min(200, settings.zoom + 10) }); return;
      case "view:zoom-out": patchSettings({ zoom: Math.max(50, settings.zoom - 10) }); return;
      // Insert
      case "insert:image": canvasApi?.exec("sos:image"); return;
      case "insert:table": canvasApi?.exec("sos:table"); return;
      case "insert:link": promptLink(); return;
      case "insert:hr": canvasApi?.exec("insertHorizontalRule"); return;
      case "insert:emoji": dialog = "emoji"; return;
      case "insert:special": dialog = "special"; return;
      case "insert:pagebreak": canvasApi?.exec("sos:pagebreak"); return;
      case "insert:sectionbreak": canvasApi?.exec("sos:pagebreak"); return;
      case "insert:header": dialog = "headerfooter"; return;
      case "insert:pagenumbers": patchSettings({ pageNumbers: settings.pageNumbers === "none" ? "bottom" : "none" }); return;
      case "insert:toc": canvasApi?.exec("sos:toc"); return;
      case "insert:date": canvasApi?.exec("insertText", new Date().toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })); return;
      // Format
      case "fmt:rtl": patchSettings({ textDirection: "rtl" }); return;
      case "fmt:ltr": patchSettings({ textDirection: "ltr" }); return;
      case "fmt:text-b": canvasApi?.exec("bold"); return;
      case "fmt:text-i": canvasApi?.exec("italic"); return;
      case "fmt:text-u": canvasApi?.exec("underline"); return;
      case "fmt:text-strike": canvasApi?.exec("strikeThrough"); return;
      case "fmt:text-sup": canvasApi?.exec("superscript"); return;
      case "fmt:text-sub": canvasApi?.exec("subscript"); return;
      case "fmt:ps-normal": canvasApi?.exec("formatBlock", "p"); return;
      case "fmt:ps-h1": canvasApi?.exec("formatBlock", "h1"); return;
      case "fmt:ps-h2": canvasApi?.exec("formatBlock", "h2"); return;
      case "fmt:ps-h3": canvasApi?.exec("formatBlock", "h3"); return;
      case "fmt:ps-title": canvasApi?.exec("formatBlock", "title"); return;
      case "fmt:ps-quote": canvasApi?.exec("formatBlock", "blockquote"); return;
      case "fmt:ps-code": canvasApi?.exec("formatBlock", "pre"); return;
      case "fmt:align-left": canvasApi?.exec("justifyLeft"); return;
      case "fmt:align-center": canvasApi?.exec("justifyCenter"); return;
      case "fmt:align-right": canvasApi?.exec("justifyRight"); return;
      case "fmt:align-justify": canvasApi?.exec("justifyFull"); return;
      case "fmt:spacing-single": canvasApi?.exec("sos:lineSpacing", "1"); return;
      case "fmt:spacing-15": canvasApi?.exec("sos:lineSpacing", "1.15"); return;
      case "fmt:spacing-double": canvasApi?.exec("sos:lineSpacing", "2"); return;
      case "fmt:cols-1": patchSettings({ columns: 1 }); return;
      case "fmt:cols-2": patchSettings({ columns: 2 }); return;
      case "fmt:cols-3": patchSettings({ columns: 3 }); return;
      case "fmt:orientation-portrait": patchSettings({ orientation: "portrait" }); return;
      case "fmt:orientation-landscape": patchSettings({ orientation: "landscape" }); return;
      case "fmt:clear": canvasApi?.exec("removeFormat"); return;
      // Tools
      case "tools:wordcount": dialog = "wordcount"; return;
      case "tools:spell": alert("Spelling check runs automatically as you type (spellcheck=true)."); return;
      case "tools:voice": toggleVoice(); return;
      case "tools:dictionary": {
        const sel = window.getSelection()?.toString().trim();
        const q = sel || prompt("Look up:");
        if (q) window.open(`https://www.google.com/search?q=define+${encodeURIComponent(q)}`, "_blank");
        return;
      }
      case "tools:preferences": dialog = "prefs"; return;
      case "tools:accessibility": alert("Accessibility: full keyboard navigation, screen-reader labels, and high-contrast dark mode are supported."); return;
      // Help
      case "help:shortcuts": dialog = "shortcuts"; return;
      case "help:search": dialog = "replace"; return;
      case "help:about": alert("Simple Office Suite v1.1.0 — offline-first, MIT licensed."); return;
      // Canvas-only / passthrough
      case "print": doExport("pdf"); return;
      case "paintFormat": canvasApi?.exec("sos:paint-get"); return;
      case "zoom": patchSettings({ zoom: parseInt(payload ?? "100", 10) }); return;
      case "style": canvasApi?.exec("formatBlock", payload); return;
      case "fontName": canvasApi?.exec("fontName", payload); return;
      case "fontSizePx": canvasApi?.exec("sos:fontSizePx", payload); return;
      case "lineSpacing": canvasApi?.exec("sos:lineSpacing", payload); return;
      case "foreColor": canvasApi?.exec("foreColor", payload); return;
      case "hiliteColor": canvasApi?.exec("hiliteColor", payload); return;
      case "createLink": promptLink(); return;
      case "insertUnorderedList": canvasApi?.exec("insertUnorderedList"); return;
      case "insertOrderedList": canvasApi?.exec("insertOrderedList"); return;
      case "sos:checklist": canvasApi?.exec("sos:checklist"); return;
      case "indent": canvasApi?.exec("indent"); return;
      case "outdent": canvasApi?.exec("outdent"); return;
      case "justifyLeft": canvasApi?.exec("justifyLeft"); return;
      case "justifyCenter": canvasApi?.exec("justifyCenter"); return;
      case "justifyRight": canvasApi?.exec("justifyRight"); return;
      case "justifyFull": canvasApi?.exec("justifyFull"); return;
      case "removeFormat": canvasApi?.exec("removeFormat"); return;
      case "bold": canvasApi?.exec("bold"); return;
      case "italic": canvasApi?.exec("italic"); return;
      case "underline": canvasApi?.exec("underline"); return;
      case "superscript": canvasApi?.exec("superscript"); return;
      case "subscript": canvasApi?.exec("subscript"); return;
      case "strikeThrough": canvasApi?.exec("strikeThrough"); return;
      case "insert:image-ctx": canvasApi?.exec("sos:image"); return;
    }
  }

  function onMenuCmd(d: { cmd: string; payload?: string }): void {
    command(d.cmd, d.payload);
  }

  function tabId(e: CustomEvent<string>): string {
    return e.detail;
  }

  function headingIndex(e: CustomEvent<number>): number {
    return e.detail;
  }

  function promptLink(): void {
    const url = prompt("Link URL:", "https://");
    if (url) canvasApi?.exec("createLink", url);
  }

  async function doExport(kind: "pdf" | "md" | "txt" | "html"): Promise<void> {
    if (!file || !doc) return;
    const base = file.name.replace(/[\\/:*?"<>|]/g, "_");
    if (kind === "pdf") {
      exportPdf(file.name, `<div class="writer-page">${doc.html}</div>`);
      return;
    }
    if (kind === "md") { void saveFileDialog(`${base}.md`, htmlToMarkdown(doc.html)); return; }
    if (kind === "txt") { void saveFileDialog(`${base}.txt`, htmlToText(doc.html)); return; }
    if (kind === "html") {
      const page = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(file.name)}</title></head><body>${doc.html}</body></html>`;
      void saveFileDialog(`${base}.html`, page);
    }
  }

  // ── Find & replace over the editor ─────────────────────────────

  function findNext(): void {
    if (!findText) return;
    const ed = document.querySelector('[contenteditable="true"]');
    if (!ed) return;
    const sel = window.getSelection();
    const walker = document.createTreeWalker(ed, NodeFilter.SHOW_TEXT);
    let node: Text | null = null;
    let started = !sel?.focusNode || !ed.contains(sel.focusNode);
    while ((node = walker.nextNode() as Text | null)) {
      if (!started && node !== sel?.focusNode) continue;
      started = true;
      const idx = node.data.toLowerCase().indexOf(findText.toLowerCase(), sel?.focusOffset ?? 0);
      if (idx >= 0) {
        const r = document.createRange();
        r.setStart(node, idx);
        r.setEnd(node, idx + findText.length);
        sel?.removeAllRanges();
        sel?.addRange(r);
        return;
      }
    }
  }

  function replaceAll(): void {
    if (!findText) return;
    const ed = document.querySelector('[contenteditable="true"]');
    if (!ed) return;
    const re = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi");
    const walk = (node: Node) => {
      node.childNodes.forEach(walk);
      if (node.nodeType === Node.TEXT_NODE && re.test((node as Text).data)) {
        const span = document.createElement("span");
        span.innerHTML = (node as Text).data.replace(re, replaceText);
        (node as Text).replaceWith(span);
      }
    };
    walk(ed);
    ed.dispatchEvent(new Event("input", { bubbles: true }));
  }

  // ── Word count data ────────────────────────────────────────────

  $: text = doc?.html ? htmlToText(doc.html) : "";
  $: words = text ? text.split(/\s+/).length : 0;
  $: chars = text.length;
  $: sentences = (text.match(/[.!?]+/g) ?? []).length;
  $: paragraphs = (doc?.html.match(/<(p|h1|h2|h3|li|blockquote)[\s>]/gi) ?? []).length;

  function insertToken(token: string): void {
    canvasApi?.exec("insertText", token);
    dialog = null;
  }

  function checked(e: Event): boolean {
    return (e.currentTarget as HTMLInputElement).checked;
  }

  function textValue(e: Event): string {
    return (e.currentTarget as HTMLInputElement).value;
  }

  function selectVal(e: Event): string {
    return (e.currentTarget as HTMLSelectElement).value;
  }

  function pageNumVal(e: Event): WriterSettings["pageNumbers"] {
    return (e.currentTarget as HTMLSelectElement).value as WriterSettings["pageNumbers"];
  }


  // Robust command bridge (see Sheets)
  let lastCmdAt = 0;
  function onWindowCmd(e: Event): void {
    const t = performance.now();
    if (t - lastCmdAt < 50) return;
    lastCmdAt = t;
    onMenuCmd((e as CustomEvent<{ cmd: string; payload?: string }>).detail);
  }
  $: bridgeRef = registerBridge();
  function registerBridge(): number {
    window.removeEventListener("sos-cmd-writer", onWindowCmd);
    window.addEventListener("sos-cmd-writer", onWindowCmd);
    return 1;
  }
  onDestroy(() => window.removeEventListener("sos-cmd-writer", onWindowCmd));
</script>

{#if doc}
  <div class="flex-1 flex flex-col min-h-0">
    <DocsMenubar docTitle={file?.name ?? "Untitled document"} onCmd={(d) => onMenuCmd(d)} />
    <DocsToolbar
      zoom={settings.zoom}
      settings={settings}
      onCmd={(d) => onMenuCmd(d)}
    />

    <div class="flex-1 flex min-h-0">
      {#if showSidebar}
        <DocSidebar
          {doc}
          {tabs}
          activeTabId={doc.activeTabId ?? tabs[0]?.id ?? null}
          {headings}
          on:addTab={() => file && addWriterTab(file.id)}
          on:selectTab={(e) => file && selectWriterTab(file.id, tabId(e))}
          on:renameTab={(e) => {
            if (!file) return;
            const id = tabId(e);
            const cur = writerTabs(doc).find((t) => t.id === id);
            const name = prompt("Tab name:", cur?.name ?? "");
            if (name) renameWriterTab(file.id, id, name);
          }}
          on:deleteTab={(e) => file && deleteWriterTab(file.id, tabId(e))}
          on:gotoHeading={(e) => canvasApi?.scrollToHeading(headingIndex(e))}
        />
      {/if}

      <div class="flex-1 flex flex-col min-w-0 relative">
        {#if showRuler && !settings.pageless}
          <div class="h-5 shrink-0 bg-gray-50 dark:bg-[#252525] border-b border-gray-200 dark:border-gray-700 relative overflow-hidden">
            <div class="absolute inset-0 flex items-center justify-center opacity-60 text-[9px] text-gray-400" style="font-family: monospace;">
              {Array.from({ length: 40 }).map((_, i) => (i % 4 === 0 ? "|" : "·")).join("")}
            </div>
          </div>
        {/if}

        {#if voiceActive}
          <div class="absolute top-2 right-4 z-40 chip bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300 animate-pulse">
            🎙 Listening… click Tools → Voice typing to stop
          </div>
        {/if}

        <WriterCanvas
          html={doc.html}
          settings={settings}
          on:edit={onCanvasEdit}
          onApi={(api) => (canvasApi = api)}
        />

        {#if dialog === "replace"}
          <div class="absolute top-3 right-6 z-40 card p-3 w-[340px] shadow-modal">
            <div class="flex items-center justify-between mb-2">
              <span class="text-sm font-medium">Find and replace</span>
              <button class="text-xs text-gray-400" on:click={() => (dialog = null)}>✕</button>
            </div>
            <input class="input w-full mb-1.5" placeholder="Find" bind:value={findText} on:keydown={(e) => e.key === "Enter" && findNext()} />
            <input class="input w-full mb-2" placeholder="Replace with" bind:value={replaceText} />
            <div class="flex gap-1.5">
              <button class="btn btn-ghost text-xs" on:click={findNext}>Find next</button>
              <button class="btn btn-primary text-xs flex-1" on:click={replaceAll}>Replace all</button>
            </div>
          </div>
        {/if}
      </div>
    </div>
  </div>

  <!-- Modal dialogs -->
  {#if dialog}
    <div class="fixed inset-0 z-[70] bg-black/40 grid place-items-center" on:click|self={() => (dialog = null)}>
      <div class="card w-[420px] max-w-[92vw] p-5 shadow-modal" on:click|stopPropagation>
        {#if dialog === "wordcount"}
          <h3 class="font-medium mb-3">Word count</h3>
          <div class="space-y-1.5 text-sm">
            <p>Pages: <b>{settings.pageless ? 1 : Math.max(1, Math.ceil((doc.html.length / 3000)))}</b></p>
            <p>Words: <b>{words}</b></p>
            <p>Characters: <b>{chars}</b></p>
            <p>Characters excluding spaces: <b>{text.replace(/ /g, "").length}</b></p>
            <p>Sentences: <b>{sentences}</b></p>
            <p>Paragraphs: <b>{paragraphs}</b></p>
          </div>
        {:else if dialog === "headerfooter"}
          <h3 class="font-medium mb-3">Headers & footers</h3>
          <label class="flex items-center gap-2 text-sm mb-2">
            <input type="checkbox" checked={settings.showHeader} on:change={(e) => patchSettings({ showHeader: checked(e) })} /> Show header
          </label>
          <input class="input w-full mb-3" placeholder="Header text" value={settings.header} on:input={(e) => patchSettings({ header: textValue(e) })} />
          <label class="flex items-center gap-2 text-sm mb-2">
            <input type="checkbox" checked={settings.showFooter} on:change={(e) => patchSettings({ showFooter: checked(e) })} /> Show footer
          </label>
          <input class="input w-full mb-3" placeholder="Footer text" value={settings.footer} on:input={(e) => patchSettings({ footer: textValue(e) })} />
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-gray-500 text-xs">Page numbers</span>
            <select class="input" value={settings.pageNumbers} on:change={(e) => patchSettings({ pageNumbers: pageNumVal(e) })}>
              <option value="none">None</option>
              <option value="bottom">Bottom center</option>
              <option value="top">Top center</option>
            </select>
          </label>
        {:else if dialog === "details"}
          <h3 class="font-medium mb-3">Document details</h3>
          <div class="space-y-1.5 text-sm">
            <p>Name: <b>{file?.name}</b></p>
            <p>Created: <b>{file ? new Date(file.createdAt).toLocaleString() : "—"}</b></p>
            <p>Modified: <b>{file ? new Date(file.updatedAt).toLocaleString() : "—"}</b></p>
            <p>Tabs: <b>{tabs.length}</b></p>
            <p>Words: <b>{words}</b></p>
          </div>
        {:else if dialog === "shortcuts"}
          <h3 class="font-medium mb-3">Keyboard shortcuts</h3>
          <div class="grid grid-cols-2 gap-x-6 gap-y-1 text-sm max-h-[50vh] overflow-y-auto">
            {#each [["⌘B","Bold"],["⌘I","Italic"],["⌘U","Underline"],["⌘\\","Clear formatting"],["⌘F","Find & replace"],["⌘S","Save to disk"],["⌘P","Export PDF"],["⌘K","Command palette"],["⌘,","Settings"],["⌘⇧C","Word count"],["⌘Z","Undo"],["⌘Y","Redo"],["⌘A","Select all"],["⌘.","Superscript"],["⌘,","Subscript"]] as [k, v] (k)}
              <span class="text-gray-500">{v}</span><span class="font-mono">{k}</span>
            {/each}
          </div>
        {:else if dialog === "emoji"}
          <h3 class="font-medium mb-3">Emoji</h3>
          <div class="grid grid-cols-10 gap-1 max-h-[40vh] overflow-y-auto">
            {#each EMOJIS as e (e)}
              <button class="text-xl p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" on:click={() => insertToken(e)}>{e}</button>
            {/each}
          </div>
        {:else if dialog === "special"}
          <h3 class="font-medium mb-3">Special characters</h3>
          <div class="grid grid-cols-10 gap-1 max-h-[40vh] overflow-y-auto">
            {#each SPECIALS as s (s)}
              <button class="text-lg p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" on:click={() => insertToken(s)}>{s}</button>
            {/each}
          </div>
        {:else if dialog === "prefs"}
          <h3 class="font-medium mb-3">Preferences</h3>
          <div class="space-y-2 text-sm">
            <label class="flex items-center justify-between">
              <span>Default pageless</span>
              <input type="checkbox" checked={settings.pageless} on:change={(e) => patchSettings({ pageless: checked(e) })} />
            </label>
            <label class="flex flex-col gap-1">
              <span class="text-gray-500 text-xs">Zoom</span>
              <select class="input" value={String(settings.zoom)} on:change={(e) => patchSettings({ zoom: parseInt(selectVal(e), 10) })}>
                {#each [50, 75, 90, 100, 125, 150, 200] as z (z)}<option value={z}>{z}%</option>{/each}
              </select>
            </label>
          </div>
        {/if}
        <div class="flex justify-end mt-4">
          <button class="btn btn-primary" on:click={() => (dialog = null)}>Done</button>
        </div>
      </div>
    </div>
  {/if}

  {#if transfer}
    <TransferModal
      mode={transfer}
      options={transfer === "import" ? IMPORT_OPTS : EXPORT_OPTS}
      accent="#1a73e8"
      on:pick={(e) => (transfer === "import" ? void doImport(e.detail) : doFormatExport(e.detail))}
      on:close={() => (transfer = null)}
    />
  {/if}
{/if}
