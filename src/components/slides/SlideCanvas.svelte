<script lang="ts">
  // 16:9 slide canvas: draggable, inline-editable blocks.
  import { createEventDispatcher, onDestroy } from "svelte";
  import type { Slide, SlideBlock } from "../../types";

  export let slide: Slide;
  export let selectedBlockId: string | null = null;

  const dispatch = createEventDispatcher<{
    select: string | null;
    updateBlock: { id: string; patch: Partial<SlideBlock> };
    removeBlock: string;
  }>();

  let canvas: HTMLDivElement;
  let editingTextId: string | null = null;
  let canvasWidth = 960;
  let ro: ResizeObserver | undefined;

  $: if (canvas) observe();

  function observe(): void {
    if (!canvas || typeof ResizeObserver === "undefined") return;
    ro?.disconnect();
    ro = new ResizeObserver((entries) => {
      canvasWidth = entries[0].contentRect.width;
    });
    ro.observe(canvas);
  }

  onDestroy(() => ro?.disconnect());

  function blockStyle(b: SlideBlock): string {
    const bg = b.type === "shape" ? b.color + "22" : "transparent";
    return `left:${b.x}%;top:${b.y}%;width:${b.w}%;height:${b.h}%;
      font-size:${fontSizePx(b)}px;color:${b.color};text-align:${b.align};background:${bg};
      font-weight:${b.bold ? 700 : 400};font-style:${b.italic ? "italic" : "normal"};
      transform:rotate(${b.rotation ?? 0}deg) scaleX(${b.flipX ? -1 : 1}) scaleY(${b.flipY ? -1 : 1});`;
  }

  function fontSizePx(b: SlideBlock): number {
    const scale = canvasWidth / 960;
    return Math.max(8, b.fontSize * scale);
  }

  // ── Drag / resize ───────────────────────────────────────────────

  interface DragState {
    id: string;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    origW: number;
    canvasW: number;
    canvasH: number;
    mode: "move" | "resize";
  }

  let drag: DragState | null = null;

  function beginDrag(e: MouseEvent, b: SlideBlock, mode: "move" | "resize"): void {
    if (editingTextId === b.id && mode === "move") return;
    e.stopPropagation();
    e.preventDefault();
    dispatch("select", b.id);
    const rect = canvas.getBoundingClientRect();
    drag = {
      id: b.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: b.x,
      origY: b.y,
      origW: b.w,
      canvasW: rect.width,
      canvasH: rect.height,
      mode
    };
    window.addEventListener("mousemove", onDragMove);
    window.addEventListener("mouseup", onDragEnd);
  }

  function onDragMove(e: MouseEvent): void {
    if (!drag) return;
    const dx = ((e.clientX - drag.startX) / drag.canvasW) * 100;
    const dy = ((e.clientY - drag.startY) / drag.canvasH) * 100;
    if (drag.mode === "move") {
      dispatch("updateBlock", {
        id: drag.id,
        patch: { x: clamp(drag.origX + dx, -20, 98), y: clamp(drag.origY + dy, -5, 95) }
      });
    } else {
      dispatch("updateBlock", { id: drag.id, patch: { w: clamp(drag.origW + dx, 5, 120) } });
    }
  }

  function clamp(v: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, v));
  }

  function onDragEnd(): void {
    drag = null;
    window.removeEventListener("mousemove", onDragMove);
    window.removeEventListener("mouseup", onDragEnd);
  }

  function onCanvasClick(): void {
    dispatch("select", null);
    editingTextId = null;
  }

  function startTextEdit(b: SlideBlock): void {
    if (b.type === "shape") return;
    editingTextId = b.id;
  }

  function onTextBlur(e: FocusEvent, id: string): void {
    dispatch("updateBlock", { id, patch: { text: (e.currentTarget as HTMLElement).innerText } });
    editingTextId = null;
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (editingTextId) return;
    if ((e.key === "Delete" || e.key === "Backspace") && selectedBlockId) {
      e.preventDefault();
      dispatch("removeBlock", selectedBlockId);
    }
  }
</script>

<svelte:window on:keydown={onKeyDown} />

<div class="flex-1 overflow-auto grid place-items-center p-8 bg-gray-100 dark:bg-[#161616]">
  <div
    bind:this={canvas}
    class="relative bg-white shadow-card rounded-sm"
    style="aspect-ratio:16/9; width:min(100%, calc((100vh - 280px) * 16/9));"
    on:click={onCanvasClick}
  >
    {#each slide.blocks as b (b.id)}
      <div
        class="slide-block rounded-sm"
        class:selected={selectedBlockId === b.id}
        style={blockStyle(b)}
        on:mousedown={(e) => beginDrag(e, b, "move")}
        on:dblclick|stopPropagation={() => startTextEdit(b)}
        role="button"
        tabindex="-1"
      >
        {#if b.type === "image"}
          {#if b.text}
            <img src={b.text} alt="slide image" class="w-full h-full object-contain pointer-events-none" draggable="false" />
          {:else}
            <div class="w-full h-full grid place-items-center text-gray-400 text-sm">🖼 Image</div>
          {/if}
        {:else if b.type === "line"}
          <div class="w-full h-full grid place-items-center pointer-events-none">
            <div class="w-full" style={`height:2px;background:${b.color};transform:rotate(${b.h > 30 ? 90 : 0}deg)`} />
          </div>
        {:else if editingTextId === b.id}
          <div
            class="w-full h-full outline-none"
            contenteditable="true"
            on:blur={(e) => onTextBlur(e, b.id)}
            on:keydown={(e) => e.stopPropagation()}
            on:mousedown|stopPropagation
          >
            {b.text}
          </div>
        {:else if b.type === "code"}
          <pre class="w-full h-full m-0 p-2 overflow-hidden font-mono" style="font-size:inherit">{b.text}</pre>
        {:else}
          <div
            class="w-full h-full flex items-start overflow-hidden"
            style={`justify-content:${b.align === "center" ? "center" : b.align === "right" ? "flex-end" : "flex-start"}`}
          >
            {#if b.link}
              <a class="whitespace-pre-wrap underline underline-offset-2" style="color:inherit" href={b.link} target="_blank" rel="noreferrer" on:mousedown|stopPropagation>{b.text}</a>
            {:else}
              <span class="whitespace-pre-wrap">{b.text}</span>
            {/if}
          </div>
        {/if}

        {#if selectedBlockId === b.id}
          <div
            class="absolute -right-1.5 -bottom-1.5 w-3.5 h-3.5 bg-white border-2 border-blue-500 cursor-nwse-resize rounded-full"
            on:mousedown={(e) => beginDrag(e, b, "resize")}
          />
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .slide-block.selected {
    outline: 2px solid #1a73e8;
    outline-offset: 1px;
  }
  .slide-block pre {
    background: rgba(0, 0, 0, 0.05);
  }
  :global(.dark) .slide-block pre {
    background: rgba(255, 255, 255, 0.06);
  }
</style>
