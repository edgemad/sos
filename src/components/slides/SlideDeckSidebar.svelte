<script lang="ts">
  // Deck organizer: thumbnails, reorder, add/duplicate/delete, skip indicator.
  import { createEventDispatcher } from "svelte";
  import type { Deck } from "../../types";

  export let deck: Deck | null;
  export let current = 0;

  const dispatch = createEventDispatcher<{
    add: void;
    duplicate: void;
    delete: void;
    move: { from: number; to: number };
    toggleSkip: number;
    goTo: number;
  }>();

  function preview(s: Deck["slides"][number]): string {
    const t = s.blocks.find((b) => b.type === "title") ?? s.blocks[0];
    return t?.text?.slice(0, 28) || `Slide ${deck!.slides.indexOf(s) + 1}`;
  }
</script>

{#if deck}
  <aside class="w-44 shrink-0 flex flex-col bg-gray-50 dark:bg-[#252525] border-r border-gray-200 dark:border-gray-700">
    <div class="flex items-center justify-between px-3 h-9 shrink-0">
      <span class="text-xs font-semibold text-gray-500 uppercase tracking-wider">Slides</span>
      <span class="text-xs text-gray-400">{current + 1}/{deck.slides.length}</span>
    </div>
    <div class="flex-1 overflow-y-auto p-2 space-y-2">
      {#each deck.slides as s, i (s.id)}
        <div class="group relative">
          <div
            class="relative rounded-md overflow-hidden cursor-pointer border-2 transition-colors
              {current === i ? 'border-docs' : 'border-transparent hover:border-gray-300 dark:hover:border-gray-600'}
              {s.skipped ? 'opacity-50' : ''}"
            on:click={() => dispatch("goTo", i)}
          >
            <div class="aspect-video bg-white dark:bg-[#303030] relative overflow-hidden">
              {#each s.blocks.slice(0, 4) as b (b.id)}
                <div
                  class="absolute overflow-hidden"
                  style={`left:${b.x}%;top:${b.y}%;width:${b.w}%;height:${b.h}%;font-size:${Math.max(4, b.fontSize / 5)}px;color:${b.color};text-align:${b.align}`}
                >
                  {b.text}
                </div>
              {/each}
            </div>
            <div class="px-2 py-1 text-xs bg-white dark:bg-[#303030] border-t border-gray-100 dark:border-gray-700 truncate">
              {preview(s)}
            </div>
            {#if s.skipped}
              <div class="absolute top-1 right-1 bg-amber-500 text-white text-[9px] px-1.5 py-0.5 rounded font-semibold">SKIPPED</div>
            {/if}
          </div>
          <div class="absolute left-1 top-1 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            {#if i > 0}
              <button class="w-5 h-5 grid place-items-center rounded bg-white/90 dark:bg-gray-800/90 text-[10px] shadow cursor-pointer" title="Move earlier" on:click={() => dispatch("move", { from: i, to: i - 1 })}>↑</button>
            {/if}
            {#if i < deck.slides.length - 1}
              <button class="w-5 h-5 grid place-items-center rounded bg-white/90 dark:bg-gray-800/90 text-[10px] shadow cursor-pointer" title="Move later" on:click={() => dispatch("move", { from: i, to: i + 1 })}>↓</button>
            {/if}
          </div>
          <button
            class="absolute right-1 top-1 w-5 h-5 grid place-items-center rounded bg-white/90 dark:bg-gray-800/90 text-[10px] shadow cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity"
            title={s.skipped ? "Include in presentation" : "Skip in presentation"}
            on:click={() => dispatch("toggleSkip", i)}
          >{s.skipped ? "👁" : "🚫"}</button>
        </div>
      {/each}
    </div>
    <div class="p-2 border-t border-gray-200 dark:border-gray-700 flex gap-1">
      <button class="btn btn-ghost flex-1 !px-1" title="Add slide" on:click={() => dispatch("add")}>＋</button>
      <button class="btn btn-ghost flex-1 !px-1" title="Duplicate" on:click={() => dispatch("duplicate")}>⧉</button>
      <button class="btn btn-ghost flex-1 !px-1" title="Delete slide" on:click={() => dispatch("delete")}>🗑</button>
    </div>
  </aside>
{/if}
