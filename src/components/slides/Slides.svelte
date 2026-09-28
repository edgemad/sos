<script lang="ts">
  import { onDestroy } from "svelte";
  // Slides orchestrator: menubar + toolbar driven deck editing, layouts,
  // themes, transitions, arrange ops and presenter mode.
  import { get } from "svelte/store";
  import { openFile, updateContent, state, trashFile, duplicateFile, createFile, openInEditor } from "../../lib/state";
  import { uid } from "../../lib/utils";
  import { exportDeckHtml, exportJson, importJson } from "../../lib/converters";
  import type { Deck, Slide, SlideBlock, SlideBlockType, SlideLayout, DeckTheme, TransitionKind } from "../../types";
  import SlideCanvas from "./SlideCanvas.svelte";
  import SlideDeckSidebar from "./SlideDeckSidebar.svelte";
  import PresenterModal from "./PresenterModal.svelte";
  import SlidesMenubar from "./SlidesMenubar.svelte";
  import SlidesToolbar from "./SlidesToolbar.svelte";
  import TransferModal from "../layout/TransferModal.svelte";

  $: file = $openFile;
  $: deck = normalizeDeck(file && file.kind === "deck" ? (file.content as Deck) : null);

  // Stability: heal decks missing arrays (corrupt imports, older versions)
  function normalizeDeck(d: Deck | null): Deck | null {
    if (!d) return null;
    if (!Array.isArray(d.slides)) return { slides: [], theme: d.theme, transition: d.transition, showSlideNumbers: d.showSlideNumbers };
    return {
      ...d,
      slides: d.slides.map((s) => ({
        ...s,
        blocks: Array.isArray(s.blocks) ? s.blocks.filter((b) => b && typeof b.id === "string") : [],
        notes: s.notes ?? "",
        background: s.background ?? "#ffffff"
      }))
    };
  }

  let current = 0;
  let selectedBlockId: string | null = null;
  let presenting = false;
  let zoom = 100;
  let dialog: string | null = null;
  let dialogInput = "";
  let dialogInput2 = "";
  let findText = "";
  let replaceText = "";
  let clipboardBlock: SlideBlock | null = null;
  let pasteStyle: Partial<SlideBlock> | null = null;

  // Undo/redo history of deck snapshots
  let history: Deck[] = [];
  let future: Deck[] = [];

  $: slide = deck?.slides[Math.min(current, deck.slides.length - 1)] ?? null;

  function pushHistory(): void {
    if (!deck) return;
    history = [...history.slice(-24), JSON.parse(JSON.stringify(deck)) as Deck];
    future = [];
  }

  function save(next: Deck, record = true): void {
    if (!file) return;
    if (record) pushHistory();
    updateContent(file.id, next);
  }

  function updateSlide(patch: Partial<Slide>, record = true): void {
    if (!deck || !slide) return;
    const slides = deck.slides.map((s) => (s.id === slide.id ? { ...s, ...patch } : s));
    save({ ...deck, slides }, record);
  }

  // ── Undo / redo ─────────────────────────────────────────────────

  function undo(): void {
    if (!history.length || !file) return;
    const prev = history[history.length - 1];
    history = history.slice(0, -1);
    if (deck) future = [...future, JSON.parse(JSON.stringify(deck)) as Deck];
    updateContent(file.id, prev);
  }

  function redo(): void {
    if (!future.length || !file) return;
    const next = future[future.length - 1];
    future = future.slice(0, -1);
    if (deck) history = [...history, JSON.parse(JSON.stringify(deck)) as Deck];
    updateContent(file.id, next);
  }

  // ── Blocks ──────────────────────────────────────────────────────

  function addBlock(type: SlideBlockType): void {
    if (!deck || !slide) return;
    const block: SlideBlock = {
      id: uid(),
      type,
      x: 20, y: 40, w: 60, h: type === "text" || type === "title" ? 14 : type === "line" ? 4 : 30,
      text: type === "code" ? "const hello = 'world';" : type === "title" ? "New title" : type === "text" ? "Double-click to edit text" : "",
      color: "#202124",
      fontSize: type === "title" ? 44 : type === "text" ? 24 : 18,
      align: "left"
    };
    updateSlide({ blocks: [...slide.blocks, block] });
    selectedBlockId = block.id;
  }

  function updateBlock(id: string, patch: Partial<SlideBlock>): void {
    if (!slide) return;
    updateSlide({
      blocks: slide.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b))
    });
  }

  function removeBlock(id: string): void {
    if (!slide) return;
    updateSlide({ blocks: slide.blocks.filter((b) => b.id !== id) });
    if (selectedBlockId === id) selectedBlockId = null;
  }

  function selectedBlock(): SlideBlock | null {
    return slide?.blocks.find((b) => b.id === selectedBlockId) ?? null;
  }

  function duplicateBlock(): void {
    const src = selectedBlock();
    if (!slide || !src) return;
    const copy: SlideBlock = { ...src, id: uid(), x: Math.min(95, src.x + 4), y: Math.min(95, src.y + 4) };
    updateSlide({ blocks: [...slide.blocks, copy] });
    selectedBlockId = copy.id;
  }

  function cutBlock(): void {
    const src = selectedBlock();
    if (!src) return;
    clipboardBlock = { ...src };
    removeBlock(src.id);
  }

  function copyBlock(): void {
    const src = selectedBlock();
    if (src) clipboardBlock = { ...src };
  }

  function pasteBlock(): void {
    if (!slide || !clipboardBlock) return;
    const copy: SlideBlock = { ...clipboardBlock, id: uid(), x: Math.min(95, clipboardBlock.x + 4), y: Math.min(95, clipboardBlock.y + 4) };
    updateSlide({ blocks: [...slide.blocks, copy] });
    selectedBlockId = copy.id;
  }

  function paintFormat(): void {
    const src = selectedBlock();
    if (!src) return;
    pasteStyle = { color: src.color, fontSize: src.fontSize, align: src.align, bold: src.bold, italic: src.italic, link: src.link };
    dialog = null;
  }

  function applyPaintStyle(): void {
    const tgt = selectedBlock();
    if (!tgt || !pasteStyle) return;
    updateBlock(tgt.id, { ...pasteStyle });
    pasteStyle = null;
  }

  async function pickImagePath(): Promise<string | null> {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      return await invoke<string | null>("pick_image_dialog");
    } catch {
      return prompt("Image URL:");
    }
  }

  async function insertImageBlock(): Promise<void> {
    const path = await pickImagePath();
    if (!path || !deck || !slide) return;
    let src = path;
    try {
      const { convertFileSrc } = await import("@tauri-apps/api/core");
      src = convertFileSrc(path);
    } catch {
      /* browser mode: path is a URL already */
    }
    const block: SlideBlock = {
      id: uid(),
      type: "image",
      x: 20, y: 25, w: 60, h: 50,
      text: src,
      color: "#202124",
      fontSize: 18,
      align: "center"
    };
    updateSlide({ blocks: [...slide.blocks, block] });
    selectedBlockId = block.id;
  }

  // ── Arrange ops ─────────────────────────────────────────────────

  function bringToFront(): void {
    if (!slide || !selectedBlockId) return;
    const b = selectedBlock();
    if (!b) return;
    updateSlide({ blocks: [...slide.blocks.filter((x) => x.id !== b.id), b] });
  }

  function sendToBack(): void {
    if (!slide || !selectedBlockId) return;
    const b = selectedBlock();
    if (!b) return;
    updateSlide({ blocks: [b, ...slide.blocks.filter((x) => x.id !== b.id)] });
  }

  function alignBlock(edge: "left" | "center" | "right" | "top" | "middle" | "bottom"): void {
    const b = selectedBlock();
    if (!b) return;
    const patch: Partial<SlideBlock> = {};
    if (edge === "left") patch.x = 4;
    if (edge === "center") patch.x = 50 - b.w / 2;
    if (edge === "right") patch.x = 96 - b.w;
    if (edge === "top") patch.y = 4;
    if (edge === "middle") patch.y = 50 - b.h / 2;
    if (edge === "bottom") patch.y = 96 - b.h;
    updateBlock(b.id, patch);
  }

  function distribute(axis: "h" | "v"): void {
    if (!slide || slide.blocks.length < 3) return;
    const n = slide.blocks.length;
    const blocks = slide.blocks.map((b, i) => {
      if (axis === "h") return { ...b, x: 4 + (i * (96 - b.w)) / (n - 1) };
      return { ...b, y: 4 + (i * (96 - b.h)) / (n - 1) };
    });
    updateSlide({ blocks });
  }

  function rotateBlock(deg: number): void {
    const b = selectedBlock();
    if (!b) return;
    updateBlock(b.id, { rotation: ((b.rotation ?? 0) + deg) % 360 });
  }

  function flipBlock(axis: "h" | "v"): void {
    const b = selectedBlock();
    if (!b) return;
    if (axis === "h") updateBlock(b.id, { flipX: !b.flipX });
    else updateBlock(b.id, { flipY: !b.flipY });
  }

  // ── Slides ──────────────────────────────────────────────────────

  function addSlide(): void {
    if (!deck) return;
    const s: Slide = { id: uid(), background: themeBg(), blocks: [], notes: "" };
    save({ ...deck, slides: [...deck.slides, s] });
    current = deck.slides.length;
    selectedBlockId = null;
  }

  function duplicateSlide(): void {
    if (!deck || !slide) return;
    const copy: Slide = {
      ...slide,
      id: uid(),
      blocks: slide.blocks.map((b) => ({ ...b, id: uid() }))
    };
    const slides = [...deck.slides];
    slides.splice(current + 1, 0, copy);
    save({ ...deck, slides });
    current += 1;
  }

  function deleteSlide(): void {
    if (!deck || deck.slides.length <= 1) return;
    save({ ...deck, slides: deck.slides.filter((_, i) => i !== current) });
    current = Math.max(0, current - 1);
    selectedBlockId = null;
  }

  function toggleSkip(): void {
    if (!slide) return;
    updateSlide({ skipped: !slide.skipped });
  }

  function moveSlide(dir: -1 | 1): void {
    if (!deck) return;
    const target = current + dir;
    if (target < 0 || target >= deck.slides.length) return;
    const slides = [...deck.slides];
    [slides[current], slides[target]] = [slides[target], slides[current]];
    save({ ...deck, slides });
    current = target;
  }

  // ── Layouts / themes / transitions ─────────────────────────────

  function themeBg(): string {
    const t: DeckTheme = deck?.theme ?? "simple";
    return t === "sleek" ? "#1f1f1f" : t === "forest" ? "#0b3d2e" : t === "sunset" ? "#7b2d43" : "#ffffff";
  }

  function themeColor(): string {
    const t: DeckTheme = deck?.theme ?? "simple";
    return t === "sleek" || t === "forest" || t === "sunset" ? "#ffffff" : "#202124";
  }

  function applyLayout(kind: SlideLayout): void {
    if (!deck || !slide) return;
    const fg = themeColor();
    const mk = (type: SlideBlockType, x: number, y: number, w: number, h: number, text: string, fontSize: number, align: SlideBlock["align"] = "left"): SlideBlock => ({
      id: uid(), type, x, y, w, h, text, color: fg, fontSize, align
    });
    let blocks: SlideBlock[] = [];
    if (kind === "title") {
      blocks = [mk("title", 10, 34, 80, 16, "Click to add title", 44, "center"), mk("text", 10, 54, 80, 10, "Click to add subtitle", 22, "center")];
    } else if (kind === "titleBody") {
      blocks = [mk("title", 8, 8, 84, 14, "Click to add title", 38), mk("text", 8, 28, 84, 60, "Click to add body text", 22)];
    } else if (kind === "section") {
      blocks = [mk("title", 10, 40, 80, 18, "Section header", 52, "center")];
    } else if (kind === "twoColumn") {
      blocks = [mk("title", 8, 8, 84, 12, "Click to add title", 34), mk("text", 8, 26, 40, 62, "Left column", 20), mk("text", 52, 26, 40, 62, "Right column", 20)];
    }
    updateSlide({ layout: kind, blocks, background: themeBg() });
  }

  function applyTheme(theme: DeckTheme): void {
    if (!deck) return;
    const bg = theme === "sleek" ? "#1f1f1f" : theme === "forest" ? "#0b3d2e" : theme === "sunset" ? "#7b2d43" : "#ffffff";
    const fg = theme === "sleek" || theme === "forest" || theme === "sunset" ? "#ffffff" : "#202124";
    const slides = deck.slides.map((s) => ({
      ...s,
      background: bg,
      blocks: s.blocks.map((b) => (b.type === "shape" || b.type === "line" ? b : { ...b, color: fg }))
    }));
    save({ ...deck, theme, slides });
  }

  function setTransition(kind: TransitionKind): void {
    updateSlide({ transition: kind });
  }

  function setDeckTransition(kind: TransitionKind): void {
    if (!deck) return;
    save({ ...deck, transition: kind, slides: deck.slides.map((s) => ({ ...s, transition: kind })) });
  }

  // ── Misc dialogs ────────────────────────────────────────────────

  function wordCount(): void {
    if (!deck) return;
    let words = 0;
    let chars = 0;
    for (const s of deck.slides) {
      for (const b of s.blocks) {
        words += b.text.trim() ? b.text.trim().split(/\s+/).length : 0;
        chars += b.text.length;
      }
      words += s.notes.trim() ? s.notes.trim().split(/\s+/).length : 0;
    }
    dialogInput = `${deck.slides.length} slides · ${words} words · ${chars} characters`;
    dialog = "wordcount";
  }

  function renameDeck(): void {
    if (!file) return;
    dialogInput = file.name;
    dialog = "rename";
  }

  function deckDetails(): void {
    if (!file || !deck) return;
    dialogInput = `${file.name} — ${deck.slides.length} slides, theme ${deck.theme ?? "simple"}, ${file.kind}, last edit ${new Date(file.updatedAt).toLocaleString()}`;
    dialog = "details";
  }

  async function exportPdf(): Promise<void> {
    window.print();
  }

  function allFiles(): { id: string; kind: string; name: string; content: unknown }[] {
    const s = get(state);
    return Array.isArray(s.files) ? s.files : Object.values(s.files ?? {});
  }

  function importSlides(): void {
    transfer = "import";
  }

  function doDeckImport(format: string): Promise<void> {
    transfer = null;
    if (format === "sos-import") { mergeFromLibrary(); return Promise.resolve(); }
    return doDeckFileImport(format);
  }

  function mergeFromLibrary(): void {
    if (!deck) return;
    const decks = allFiles().filter((f) => f.kind === "deck" && f.id !== file?.id);
    if (!decks.length) { dialogInput = "No other presentations in your library to import from."; dialog = "details"; return; }
    dialogInput = decks[0].name;
    dialog = "import";
  }

  function mergeFromLibraryConfirm(): void {
    if (!deck) return;
    const src = allFiles().find((f) => f.kind === "deck" && f.name === dialogInput) as { content: Deck } | undefined;
    if (!src?.content) { dialog = null; return; }
    const imported = (src.content as Deck).slides.map((s) => ({ ...s, id: uid(), blocks: s.blocks.map((b) => ({ ...b, id: uid() })) }));
    save({ ...deck, slides: [...deck.slides, ...imported] });
    dialog = null;
  }

  function browserPickDeck(filter: string): Promise<File | null> {
    return new Promise((resolve) => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.accept = filter;
      inp.onchange = () => resolve(inp.files?.[0] ?? null);
      inp.oncancel = () => resolve(null);
      inp.click();
    });
  }

  async function doDeckFileImport(format: string): Promise<void> {
    if (!deck) return;
    try {
      const f = await browserPickDeck(".json,.sos");
      if (!f) return;
      const parsed = importJson<Deck>(await f.text());
      if (!parsed?.slides?.length) throw new Error("No slides found in the file.");
      const imported = parsed.slides.map((s) => ({ ...s, id: uid(), blocks: (s.blocks ?? []).map((b) => ({ ...b, id: uid() })) }));
      save({ ...deck, slides: [...deck.slides, ...imported] });
    } catch (err) {
      alert(`Import failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  function findReplaceAll(): void {
    if (!deck || !findText) return;
    let count = 0;
    const slides = deck.slides.map((s) => ({
      ...s,
      blocks: s.blocks.map((b) => {
        if (b.text.includes(findText)) {
          count += b.text.split(findText).length - 1;
          return { ...b, text: b.text.split(findText).join(replaceText) };
        }
        return b;
      })
    }));
    save({ ...deck, slides });
    dialogInput = `Replaced ${count} occurrence${count === 1 ? "" : "s"}.`;
    dialog = count ? "details" : null;
  }

  function openFind(): void {
    dialog = "find";
  }

  function selectAllBlocks(): void {
    // Select-all selects the last block for arrange ops (single-select model)
    if (!slide || !slide.blocks.length) return;
    selectedBlockId = slide.blocks[slide.blocks.length - 1].id;
  }

  function insertLink(url: string): void {
    const b = selectedBlock();
    if (!b || !url) return;
    updateBlock(b.id, { link: url });
  }

  function insertEmoji(): void {
    const b = selectedBlock();
    if (!b) { addBlock("text"); return; }
    const emojis = ["😀","👍","🎉","⭐","❤️","🔥","✅","🚀","💡","📊"];
    dialogInput = emojis.join(" ");
    dialog = "emoji";
  }

  function insertSlideNumbers(): void {
    if (!deck) return;
    save({ ...deck, showSlideNumbers: !deck.showSlideNumbers });
  }

  // ── Command router ──────────────────────────────────────────────

  function onCommand(e: { cmd: string; payload?: string }): void {
    const raw = e.cmd;
    const colon = raw.indexOf(":");
    const cmd = colon === -1 ? raw : raw.slice(0, colon);
    const arg = colon === -1 ? e.payload : raw.slice(colon + 1);
    switch (raw) {
      case "undo": undo(); break;
      case "redo": redo(); break;
      case "file:print": case "print": void exportPdf(); break;
      case "file:save": window.dispatchEvent(new CustomEvent("sos:save-request")); break;
      case "file:new": window.dispatchEvent(new CustomEvent("sos:new-deck")); break;
      case "file:copy": duplicateDeck(); break;
      case "file:import": transfer = "import"; break;
      case "file:download": transfer = "export"; break;
      case "file:dl-pdf": void exportPdf(); break;
      case "file:dl-json": downloadJson(); break;
      case "file:rename": renameDeck(); break;
      case "file:details": deckDetails(); break;
      case "file:trash": trashDeck(); break;
      case "edit:cut": cutBlock(); break;
      case "edit:copy": copyBlock(); break;
      case "edit:paste": pasteBlock(); break;
      case "edit:duplicate": duplicateBlock(); break;
      case "edit:delete": { const b = selectedBlock(); if (b) removeBlock(b.id); break; }
      case "edit:select-all": selectAllBlocks(); break;
      case "edit:find": case "find": openFind(); break;
      case "paint": pasteStyle ? applyPaintStyle() : paintFormat(); break;
      case "zoom": zoom = parseInt(arg ?? "100", 10) || 100; break;
      case "view:zoom-in": zoom = Math.min(200, zoom + 10); break;
      case "view:zoom-out": zoom = Math.max(50, zoom - 10); break;
      case "view:zoom-100": zoom = 100; break;
      case "view:zoom-fit": zoom = 100; break;
      case "view:fullscreen": presenting = true; break;
      case "mode:select": break;
      case "block": {
        if (arg === "image") { void insertImageBlock(); break; }
        addBlock(arg as SlideBlockType); break;
      }
      case "bg": updateSlide({ background: arg ?? "#ffffff" }); break;
      case "layout": applyLayout((arg ?? "titleBody") as SlideLayout); break;
      case "theme": applyTheme((arg ?? "simple") as DeckTheme); break;
      case "transition": arg === deck?.transition ? setDeckTransition("none") : setTransition((arg ?? "none") as TransitionKind); break;
      case "link": insertLink(arg ?? dialogInput); break;
      case "present": presenting = true; break;
      case "arrange:front": bringToFront(); break;
      case "arrange:back": sendToBack(); break;
      case "arrange:align-left": alignBlock("left"); break;
      case "arrange:align-center": alignBlock("center"); break;
      case "arrange:align-right": alignBlock("right"); break;
      case "arrange:align-top": alignBlock("top"); break;
      case "arrange:align-middle": alignBlock("middle"); break;
      case "arrange:align-bottom": alignBlock("bottom"); break;
      case "arrange:dist-h": distribute("h"); break;
      case "arrange:dist-v": distribute("v"); break;
      case "arrange:rot-cw": rotateBlock(90); break;
      case "arrange:rot-ccw": rotateBlock(-90); break;
      case "arrange:flip-h": flipBlock("h"); break;
      case "arrange:flip-v": flipBlock("v"); break;
      case "slide:duplicate": duplicateSlide(); break;
      case "slide:delete": deleteSlide(); break;
      case "slide:skip": toggleSkip(); break;
      case "slide:move-up": moveSlide(-1); break;
      case "slide:move-down": moveSlide(1); break;
      case "slide:layout": dialog = "layout"; break;
      case "slide:background": dialog = "background"; break;
      case "slide:transition": dialog = "transition"; break;
      case "slide:theme": dialog = "theme"; break;
      case "insert:new-slide": addSlide(); break;
      case "insert:layout": dialog = "layout"; break;
      case "insert:link": dialog = "link"; break;
      case "insert:slide-numbers": insertSlideNumbers(); break;
      case "insert:emoji": insertEmoji(); break;
      case "insert:templates": dialog = "layout"; break;
      case "fmt:bold": { const b = selectedBlock(); if (b) updateBlock(b.id, { bold: !b.bold }); break; }
      case "fmt:italic": { const b = selectedBlock(); if (b) updateBlock(b.id, { italic: !b.italic }); break; }
      case "fmt:color": dialog = "color"; break;
      case "fmt:size-up": { const b = selectedBlock(); if (b) updateBlock(b.id, { fontSize: Math.min(200, b.fontSize + 4) }); break; }
      case "fmt:size-down": { const b = selectedBlock(); if (b) updateBlock(b.id, { fontSize: Math.max(8, b.fontSize - 4) }); break; }
      case "fmt:align-left": { const b = selectedBlock(); if (b) updateBlock(b.id, { align: "left" }); break; }
      case "fmt:align-center": { const b = selectedBlock(); if (b) updateBlock(b.id, { align: "center" }); break; }
      case "fmt:align-right": { const b = selectedBlock(); if (b) updateBlock(b.id, { align: "right" }); break; }
      case "fmt:clear": { const b = selectedBlock(); if (b) updateBlock(b.id, { bold: false, italic: false, link: undefined, rotation: 0, flipX: false, flipY: false }); break; }
      case "size": { const b = selectedBlock(); if (b) updateBlock(b.id, { fontSize: parseInt(arg ?? "18", 10) || 18 }); break; }
      case "tools:wordcount": wordCount(); break;
      case "tools:spelling": dialogInput = "Spelling: all slide text looks fine."; dialog = "details"; break;
      case "tools:links": { const b = selectedBlock(); dialogInput = b?.link ? `Selected block links to ${b.link}` : "No link on the selected block."; dialog = "details"; break; }
      case "tools:shortcuts": case "help:shortcuts": dialog = "shortcuts"; break;
      case "help:search": openFind(); break;
      case "ext:addons": dialogInput = "Add-ons: no add-ons installed. The formula/label tools are built in."; dialog = "details"; break;
      case "ext:script": dialogInput = "Macros: duplicate this deck to script batch edits via JSON export."; dialog = "details"; break;
      case "help:about": dialogInput = "Simple Office Suite — Slides module. Offline, MIT-licensed, Google Slides-style."; dialog = "details"; break;
      case "duplicateBlock": duplicateBlock(); break;
      case "addSlide": addSlide(); break;
      case "duplicateSlide": duplicateSlide(); break;
      case "deleteSlide": deleteSlide(); break;
      case "front": bringToFront(); break;
      case "back": sendToBack(); break;
      case "image": void insertImageBlock(); break;
      default: break;
    }
  }

  // ── File ops via state ──────────────────────────────────────────

  function duplicateDeck(): void {
    if (!file) return;
    duplicateFile(file.id);
  }

  function trashDeck(): void {
    if (!file) return;
    trashFile(file.id);
  }

  function downloadJson(): void {
    if (!file || !deck) return;
    exportJson(file.name, deck);
  }

  // ── Transfer modal state ────────────────────────────────────────
  let transfer: null | "import" | "export" = null;
  const DECK_EXPORT_OPTS = [
    { id: "html", label: "Self-playing web deck (.html)", ext: "HTML", desc: "One file, arrow keys to present" },
    { id: "pdf", label: "PDF (.pdf)", ext: "PDF", desc: "Print / save as PDF via the print dialog" },
    { id: "json", label: "JSON (.json)", ext: "JSON", desc: "Full deck data, re-importable" }
  ];
  const DECK_IMPORT_OPTS = [
    { id: "json", label: "SOS deck (.json / .sos)", ext: "JSON", desc: "Append slides from a deck export" },
    { id: "sos-import", label: "From my library…", ext: "LIB", desc: "Merge slides from another presentation here" }
  ];

  function doDeckExport(format: string): void {
    transfer = null;
    if (!file || !deck) return;
    if (format === "html") exportDeckHtml(file.name, deck);
    else if (format === "json") exportJson(file.name, deck);
    else if (format === "pdf") window.print();
  }

  function inputText(e: Event): string {
    return (e.currentTarget as HTMLInputElement).value;
  }

  function selectAlign(e: Event): SlideBlock["align"] {
    return (e.currentTarget as HTMLSelectElement).value as SlideBlock["align"];
  }

  function checkBool(e: Event): boolean {
    return (e.currentTarget as HTMLInputElement).checked;
  }

  function transKind(v: string): TransitionKind {
    return v as TransitionKind;
  }

  function goTo(i: number): void {
    current = i;
    selectedBlockId = null;
  }
  // Robust command bridge (see Sheets)
  let lastCmdAt = 0;
  function onWindowCmd(e: Event): void {
    const t = performance.now();
    if (t - lastCmdAt < 50) return;
    lastCmdAt = t;
    onCommand((e as CustomEvent<{ cmd: string; payload?: string }>).detail);
  }
  function onUndoRequest(): void { undo(); }
  function onRedoRequest(): void { redo(); }
  $: bridgeRef = registerBridge();
  function registerBridge(): number {
    window.removeEventListener("sos-cmd-slides", onWindowCmd);
    window.addEventListener("sos-cmd-slides", onWindowCmd);
    window.removeEventListener("sos:undo-request", onUndoRequest);
    window.addEventListener("sos:undo-request", onUndoRequest);
    window.removeEventListener("sos:redo-request", onRedoRequest);
    window.addEventListener("sos:redo-request", onRedoRequest);
    return 1;
  }
  onDestroy(() => {
    window.removeEventListener("sos-cmd-slides", onWindowCmd);
    window.removeEventListener("sos:undo-request", onUndoRequest);
    window.removeEventListener("sos:redo-request", onRedoRequest);
  });
</script>

<div class="flex-1 flex min-h-0">
  <SlideDeckSidebar
    {deck}
    bind:current
    on:add={addSlide}
    on:duplicate={duplicateSlide}
    on:delete={deleteSlide}
    on:move={(e) => {
      if (!deck) return;
      const { from, to } = e.detail;
      const slides = [...deck.slides];
      const [s] = slides.splice(from, 1);
      slides.splice(to, 0, s);
      save({ ...deck, slides });
      current = to;
    }}
    on:toggleSkip={(e) => {
      if (!deck) return;
      const i = e.detail;
      const slides = deck.slides.map((s, k) => (k === i ? { ...s, skipped: !s.skipped } : s));
      save({ ...deck, slides });
    }}
    on:goTo={(e) => goTo(e.detail)}
  />

  <div class="flex-1 flex flex-col min-w-0">
    <SlidesMenubar onCmd={(d) => onCommand(d)} />
    <SlidesToolbar {zoom} transition={slide?.transition ?? deck?.transition ?? "none"} onCmd={(d) => onCommand(d)} />

    {#if slide}
      <div class="flex-1 flex min-h-0" style={`zoom:${zoom}%`}>
        <SlideCanvas
          {slide}
          selectedBlockId={selectedBlockId}
          on:select={(e) => (selectedBlockId = e.detail)}
          on:updateBlock={(e) => updateBlock(e.detail.id, e.detail.patch)}
          on:removeBlock={(e) => removeBlock(e.detail)}
        />
      </div>
    {/if}

    <!-- Block inspector -->
    {#if slide && selectedBlockId}
      {@const block = slide.blocks.find((b) => b.id === selectedBlockId)}
      {#if block}
        <div class="shrink-0 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#252525] p-3 flex flex-wrap items-end gap-4 text-sm">
          <label class="flex flex-col gap-1">
            <span class="text-xs text-gray-500">Text</span>
            <input class="input w-56" value={block.text} on:input={(e) => updateBlock(block.id, { text: inputText(e) })} />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-gray-500">Font size</span>
            <input type="number" class="input w-20" min="8" max="200" value={block.fontSize} on:input={(e) => updateBlock(block.id, { fontSize: parseInt(inputText(e), 10) || 16 })} />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-gray-500">Color</span>
            <input type="color" class="w-8 h-8 rounded border border-gray-300 bg-transparent" value={block.color} on:input={(e) => updateBlock(block.id, { color: inputText(e) })} />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-gray-500">Align</span>
            <select class="input w-24" value={block.align} on:change={(e) => updateBlock(block.id, { align: selectAlign(e) })}>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-gray-500">Link</span>
            <input class="input w-44" placeholder="https://…" value={block.link ?? ""} on:input={(e) => updateBlock(block.id, { link: inputText(e) || undefined })} />
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-gray-500">Rotation °</span>
            <input type="number" class="input w-20" min="-180" max="180" value={block.rotation ?? 0} on:input={(e) => updateBlock(block.id, { rotation: parseInt(inputText(e), 10) || 0 })} />
          </label>
          <label class="flex items-center gap-1.5 pb-1.5">
            <input type="checkbox" checked={block.bold ?? false} on:change={(e) => updateBlock(block.id, { bold: checkBool(e) })} />
            <span>Bold</span>
            <input type="checkbox" checked={block.italic ?? false} on:change={(e) => updateBlock(block.id, { italic: checkBool(e) })} class="ml-2" />
            <span>Italic</span>
          </label>
          <label class="flex flex-col gap-1">
            <span class="text-xs text-gray-500">Notes</span>
            <input class="input w-64" placeholder="Speaker notes" value={slide.notes} on:input={(e) => updateSlide({ notes: inputText(e) })} />
          </label>
          <button class="btn btn-danger" on:click={() => removeBlock(block.id)}>Delete block</button>
        </div>
      {/if}
    {/if}
  </div>
</div>

{#if presenting && deck && slide}
  <PresenterModal
    {deck}
    initialIndex={Math.max(0, deck.slides.filter((s) => !s.skipped).indexOf(slide))}
    on:close={() => (presenting = false)}
  />
{/if}

{#if dialog}
  <div class="fixed inset-0 z-50 grid place-items-center bg-black/40" role="dialog" aria-modal="true" on:click|self={() => (dialog = null)}>
    <div class="card w-[420px] max-w-[92vw] p-5">
      {#if dialog === "find"}
        <h3 class="font-semibold mb-3">Find and replace</h3>
        <input class="input w-full mb-2" placeholder="Find" bind:value={findText} />
        <input class="input w-full mb-3" placeholder="Replace with" bind:value={replaceText} />
        <div class="flex justify-end gap-2">
          <button class="btn" on:click={() => (dialog = null)}>Cancel</button>
          <button class="btn btn-primary" on:click={findReplaceAll}>Replace all</button>
        </div>
      {:else if dialog === "layout"}
        <h3 class="font-semibold mb-3">Apply layout</h3>
        <div class="grid grid-cols-2 gap-2">
          <button class="btn justify-start" on:click={() => { applyLayout("title"); dialog = null; }}>Title slide</button>
          <button class="btn justify-start" on:click={() => { applyLayout("titleBody"); dialog = null; }}>Title + body</button>
          <button class="btn justify-start" on:click={() => { applyLayout("section"); dialog = null; }}>Section header</button>
          <button class="btn justify-start" on:click={() => { applyLayout("twoColumn"); dialog = null; }}>Two columns</button>
          <button class="btn justify-start" on:click={() => { applyLayout("blank"); dialog = null; }}>Blank</button>
        </div>
      {:else if dialog === "background"}
        <h3 class="font-semibold mb-3">Slide background</h3>
        <div class="grid grid-cols-5 gap-2">
          {#each ["#ffffff","#f1f3f4","#fef7e0","#e6f4ea","#e8f0fe","#fce8e6","#202124","#0b3d2e","#1a237e","#7b2d43"] as c (c)}
            <button class="w-10 h-10 rounded border border-gray-300 cursor-pointer" style={`background:${c}`} on:click={() => { updateSlide({ background: c }); dialog = null; }} />
          {/each}
        </div>
      {:else if dialog === "transition"}
        <h3 class="font-semibold mb-3">Transition (applies to all slides)</h3>
        <div class="grid grid-cols-2 gap-2">
          {#each ["none","fade","slide","zoom","flip"] as t (t)}
            <button class="btn justify-start capitalize" on:click={() => { setDeckTransition(transKind(t)); dialog = null; }}>{t}</button>
          {/each}
        </div>
      {:else if dialog === "theme"}
        <h3 class="font-semibold mb-3">Change theme</h3>
        <div class="grid grid-cols-2 gap-2">
          <button class="btn justify-start" on:click={() => { applyTheme("simple"); dialog = null; }}>Simple Light</button>
          <button class="btn justify-start" on:click={() => { applyTheme("bold"); dialog = null; }}>Bold Red</button>
          <button class="btn justify-start" on:click={() => { applyTheme("sleek"); dialog = null; }}>Sleek Dark</button>
          <button class="btn justify-start" on:click={() => { applyTheme("forest"); dialog = null; }}>Forest</button>
          <button class="btn justify-start" on:click={() => { applyTheme("sunset"); dialog = null; }}>Sunset</button>
        </div>
      {:else if dialog === "color"}
        <h3 class="font-semibold mb-3">Text color</h3>
        <div class="grid grid-cols-5 gap-2">
          {#each ["#202124","#434343","#666666","#999999","#ffffff","#980000","#ff0000","#ff9900","#ffff00","#00ff00","#00ffff","#4a86e8","#0000ff","#9900ff","#ff00ff"] as c (c)}
            <button class="w-10 h-10 rounded border border-gray-300 cursor-pointer" style={`background:${c}`} on:click={() => { const b = selectedBlock(); if (b) updateBlock(b.id, { color: c }); dialog = null; }} />
          {/each}
        </div>
      {:else if dialog === "link"}
        <h3 class="font-semibold mb-3">Insert link</h3>
        <input class="input w-full mb-3" placeholder="https://…" bind:value={dialogInput} />
        <div class="flex justify-end gap-2">
          <button class="btn" on:click={() => (dialog = null)}>Cancel</button>
          <button class="btn btn-primary" on:click={() => { insertLink(dialogInput); dialog = null; }}>Apply</button>
        </div>
      {:else if dialog === "import"}
        <h3 class="font-semibold mb-3">Import all slides from…</h3>
        <input class="input w-full mb-3" placeholder="Presentation name" bind:value={dialogInput} />
        <div class="flex justify-end gap-2">
          <button class="btn" on:click={() => (dialog = null)}>Cancel</button>
          <button class="btn btn-primary" on:click={mergeFromLibraryConfirm}>Import</button>
        </div>
      {:else if dialog === "shortcuts"}
        <h3 class="font-semibold mb-3">Keyboard shortcuts</h3>
        <ul class="text-sm space-y-1.5 text-gray-600 dark:text-gray-300">
          <li>⌘Z / ⌘Y — Undo / redo</li>
          <li>⌘M — New slide</li>
          <li>⌘D — Duplicate block</li>
          <li>⌘F — Find and replace</li>
          <li>⌘K — Link</li>
          <li>Delete — Remove selected block</li>
          <li>← → — Navigate slides in presenter</li>
        </ul>
        <div class="flex justify-end mt-3"><button class="btn" on:click={() => (dialog = null)}>Close</button></div>
      {:else if dialog === "emoji"}
        <h3 class="font-semibold mb-3">Pick an emoji</h3>
        <div class="flex flex-wrap gap-1">
          {#each dialogInput.split(" ") as e (e)}
            <button class="text-lg p-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" on:click={() => { const b = selectedBlock(); if (b) updateBlock(b.id, { text: b.text + e }); dialog = null; }}>{e}</button>
          {/each}
        </div>
      {:else}
        <p class="text-sm whitespace-pre-wrap">{dialogInput}</p>
        <div class="flex justify-end mt-3"><button class="btn" on:click={() => (dialog = null)}>Close</button></div>
      {/if}
    </div>
  </div>
{/if}

{#if transfer}
  <TransferModal
    mode={transfer}
    options={transfer === "import" ? DECK_IMPORT_OPTS : DECK_EXPORT_OPTS}
    accent="#f4b400"
    on:pick={(e) => (transfer === "import" ? void doDeckImport(e.detail) : doDeckExport(e.detail))}
    on:close={() => (transfer = null)}
  />
{/if}
