<script lang="ts">
  // Docs canvas: A4 pages with full page-settings support.
  // Emits edit(html) and exposes exec/focus/scrollToHeading via onApi.
  import { createEventDispatcher, onDestroy, onMount } from "svelte";
  import type { WriterSettings } from "../../types";

  export let html: string;
  export let settings: Partial<WriterSettings> = {};
  export let onApi: ((api: {
    exec: (cmd: string, val?: string) => void;
    focus: () => void;
    scrollToHeading: (index: number) => void;
  }) => void) | null = null;

  const dispatch = createEventDispatcher<{ edit: string; api: unknown }>();

  let editor: HTMLDivElement;
  let pageIndicator: string[] = [""];
  let clipboardFormat = "";

  const A4 = { w: 794, h: 1123 }; // px @96dpi
  $: pageW = settings.orientation === "landscape" ? A4.h : A4.w;
  $: pageH = settings.orientation === "landscape" ? A4.w : A4.h;
  $: zoom = (settings.zoom ?? 100) / 100;
  $: columns = settings.columns ?? 1;
  $: pageless = settings.pageless === true;
  $: dir = settings.textDirection ?? "ltr";

  $: contentStyle = pageless
    ? `max-width:900px;margin:16px auto;padding:32px;direction:${dir};`
    : `width:${pageW * zoom}px;min-height:${pageH * zoom}px;padding:${Math.round(76 * zoom)}px ${Math.round(90 * zoom)}px;direction:${dir};` +
      (columns > 1 ? `column-count:${columns};column-gap:${Math.round(36 * zoom)}px;` : "");

  let debounce: ReturnType<typeof setTimeout>;
  function emit(): void {
    clearTimeout(debounce);
    debounce = setTimeout(() => dispatch("edit", editor.innerHTML), 250);
  }

  function exec(cmd: string, val?: string): void {
    editor.focus();
    if (cmd === "sos:table") return insertTable();
    if (cmd === "sos:checklist") return insertChecklist();
    if (cmd === "sos:paint-get") { clipboardFormat = getCurrentFormat(); return; }
    if (cmd === "sos:paint-apply") { applyFormat(); return; }
    if (cmd === "sos:lineSpacing") { applyLineSpacing(val ?? "1"); return; }
    if (cmd === "sos:pagebreak") {
      document.execCommand("insertHTML", false, `<div style="page-break-after:always;border-top:1px dashed #bbb;margin:16px 0"></div><p><br></p>`);
      emit(); return;
    }
    if (cmd === "sos:fontSizePx") {
      document.execCommand("fontSize", false, "7");
      const fonts = editor.querySelectorAll('font[size="7"]');
      fonts.forEach((f) => {
        const span = document.createElement("span");
        span.style.fontSize = `${val ?? 11}px`;
        span.innerHTML = f.innerHTML;
        f.replaceWith(span);
      });
      emit(); return;
    }
    if (cmd === "sos:toc") { insertToc(); return; }
    if (cmd === "formatBlock" && val) {
      if (val === "title") {
        document.execCommand("formatBlock", false, "h1");
        emit(); return;
      }
      document.execCommand("formatBlock", false, val.replace(/[<>]/g, ""));
      emit(); return;
    }
    document.execCommand(cmd, false, val);
    emit();
  }

  function getCurrentFormat(): string {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return "";
    const frag = sel.getRangeAt(0).cloneContents();
    const div = document.createElement("div");
    div.appendChild(frag);
    return div.innerHTML;
  }

  function applyFormat(): void {
    if (!clipboardFormat) return;
    document.execCommand("insertHTML", false, clipboardFormat);
    emit();
  }

  function applyLineSpacing(mult: string): void {
    const sel = window.getSelection();
    const target = sel && sel.rangeCount > 0 && editor.contains((sel.anchorNode as Node | null))
      ? (sel.anchorNode as Node)
      : editor;
    const block = (target.nodeType === 1 ? (target as Element) : target.parentElement)?.closest("p,h1,h2,h3,h4,li,blockquote") ?? editor;
    (block as HTMLElement).style.lineHeight = mult;
    emit();
  }

  function insertChecklist(): void {
    document.execCommand("insertHTML", false, `<ul class="sos-checklist"><li><input type="checkbox"> item</li></ul><p><br></p>`);
    emit();
  }

  function insertToc(): void {
    const hs = [...editor.querySelectorAll("h1, h2, h3")];
    let toc = `<div class="sos-toc" style="border:1px solid #ddd;border-radius:6px;padding:12px 18px;margin:12px 0"><p style="font-weight:700;margin:0 0 6px">Table of contents</p>`;
    if (hs.length === 0) {
      toc += `<p style="color:#888;margin:0">Add headings (H1–H3) to build the outline.</p>`;
    } else {
      hs.forEach((h) => {
        const lvl = parseInt(h.tagName[1], 10);
        toc += `<p style="margin:2px 0 2px ${lvl * 14}px">${h.textContent}</p>`;
      });
    }
    toc += `</div><p><br></p>`;
    document.execCommand("insertHTML", false, toc);
    emit();
  }

  function insertTable(): void {
    const rows = parseInt(prompt("Rows:", "3") ?? "3", 10) || 3;
    const cols = parseInt(prompt("Columns:", "3") ?? "3", 10) || 3;
    let t = `<table><tbody>`;
    for (let r = 0; r < rows; r++) {
      t += "<tr>";
      for (let c = 0; c < cols; c++) t += r === 0 ? "<th><br></th>" : "<td><br></td>";
      t += "</tr>";
    }
    t += "</tbody></table><p><br></p>";
    document.execCommand("insertHTML", false, t);
    emit();
  }

  function scrollToHeading(index: number): void {
    const hs = [...editor.querySelectorAll("h1, h2, h3")];
    const h = hs[index];
    if (h) h.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function onInput(): void {
    emit();
    updatePageCount();
  }

  function updatePageCount(): void {
    if (pageless) { pageIndicator = [""]; return; }
    const pageHeight = pageH * zoom;
    const pages = Math.max(1, Math.ceil((editor.scrollHeight + 150) / pageHeight));
    pageIndicator = Array.from({ length: pages }, () => "");
  }

  $: if (editor && html !== undefined) {
    if (editor.innerHTML !== html && document.activeElement !== editor) {
      editor.innerHTML = html;
      updatePageCount();
    }
  }

  $: if (editor && (settings.orientation || settings.columns || settings.pageless || settings.zoom)) {
    // Re-measure pagination after page settings change.
    requestAnimationFrame(updatePageCount);
  }

  function onKeydown(e: KeyboardEvent): void {
    const mod = e.ctrlKey || e.metaKey;
    if (!mod) return;
    const k = e.key.toLowerCase();
    if (k === "b") { e.preventDefault(); exec("bold"); }
    else if (k === "i") { e.preventDefault(); exec("italic"); }
    else if (k === "u") { e.preventDefault(); exec("underline"); }
    else if (k === "\\") { e.preventDefault(); exec("removeFormat"); }
  }

  onMount(() => {
    editor.innerHTML = html;
    updatePageCount();
    onApi?.({ exec, focus: () => editor?.focus(), scrollToHeading });
  });

  onDestroy(() => clearTimeout(debounce));
</script>

<div class="flex-1 overflow-y-auto bg-gray-100 dark:bg-[#161616] print-area">
  {#if !pageless}
    <!-- header / footer strips per page (rendered decoratively) -->
    <div class="max-w-fit mx-auto my-6 px-4" style={`min-width:${pageW * zoom + 32}px`}>
      {#if settings.showHeader && settings.header}
        <div
          class="text-gray-500 text-sm border-b border-dashed border-gray-300 mb-2 mx-auto"
          style={`width:${pageW * zoom}px;padding:0 ${Math.round(90 * zoom)}px;`}
        >{settings.header}</div>
      {/if}

      {#each pageIndicator as _, i}
        <div
          class="writer-page bg-white dark:bg-[#303030] shadow-card rounded-sm relative {i > 0 ? 'mt-6' : ''}"
          style={contentStyle}
        >
          {#if i === 0}
            <div
              bind:this={editor}
              contenteditable="true"
              spellcheck="true"
              class="outline-none min-h-full"
              on:input={onInput}
              on:keydown={onKeydown}
              on:blur={emit}
              role="textbox"
              aria-multiline="true"
            />
          {:else}
            <div style={`min-height:${pageH * zoom - Math.round(152 * zoom)}px`} />
          {/if}

          {#if i === pageIndicator.length - 1 && settings.showFooter && settings.footer}
            <div class="absolute bottom-2 left-0 right-0 text-center text-xs text-gray-500">{settings.footer}</div>
          {/if}
          {#if settings.pageNumbers === "bottom" || settings.pageNumbers === "top"}
            <div class="absolute {settings.pageNumbers === 'bottom' ? 'bottom-2' : 'top-2'} left-0 right-0 text-center text-xs text-gray-500">
              {i + 1}
            </div>
          {/if}
        </div>
      {/each}
    </div>
  {:else}
    <!-- Pageless -->
    <div class="max-w-[900px] mx-auto my-6">
      <div
        class="writer-page bg-white dark:bg-[#303030] shadow-card rounded-lg"
        style={contentStyle}
      >
        <div
          bind:this={editor}
          contenteditable="true"
          spellcheck="true"
          class="outline-none min-h-[400px]"
          on:input={onInput}
          on:keydown={onKeydown}
          on:blur={emit}
          role="textbox"
          aria-multiline="true"
        />
        {#if settings.pageNumbers !== "none"}
          <div class="text-center text-xs text-gray-400 pb-3">1</div>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  .writer-page :global(.sos-checklist) {
    list-style: none;
    padding-left: 8px;
  }
  .writer-page :global(.sos-checklist input) {
    margin-right: 6px;
  }
</style>
