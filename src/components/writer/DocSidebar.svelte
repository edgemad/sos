<script lang="ts">
  // Docs document sidebar: tabs + heading outline (Google Docs style).
  import { createEventDispatcher } from "svelte";
  import type { WriterDoc, WriterTab } from "../../types";

  export let doc: WriterDoc;
  export let tabs: WriterTab[];
  export let activeTabId: string | null;
  export let headings: { level: number; text: string; index: number }[];

  const dispatch = createEventDispatcher<{
    addTab: void;
    selectTab: string;
    renameTab: string;
    deleteTab: string;
    gotoHeading: number;
  }>();

  let menuFor: string | null = null;
</script>

<aside class="w-56 shrink-0 flex flex-col bg-gray-50 dark:bg-[#252525] border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
  <div class="px-3 pt-3 pb-1 flex items-center justify-between">
    <span class="text-[13px] font-medium text-gray-700 dark:text-gray-200">Document tabs</span>
    <button class="text-base leading-none text-gray-500 hover:text-gray-800 dark:hover:text-gray-200" title="Add tab" on:click={() => dispatch("addTab")}>＋</button>
  </div>

  <div class="px-2 space-y-0.5">
    {#each tabs as t (t.id)}
      <div class="relative">
        <button
          class="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-[13px] cursor-pointer
            {t.id === activeTabId ? 'bg-blue-100 dark:bg-blue-900/40 text-docs font-medium' : 'hover:bg-gray-200/60 dark:hover:bg-gray-700/60'}"
          on:click={() => dispatch("selectTab", t.id)}
          on:dblclick={() => dispatch("renameTab", t.id)}
          title={t.name} 
        >
          <span class="text-xs">📄</span>
          <span class="flex-1 truncate text-left">{t.name}</span>
          <span
            class="text-[10px] text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 px-1"
            role="button"
            tabindex="-1"
            on:click|stopPropagation={() => (menuFor = menuFor === t.id ? null : t.id)}
          >⋮</span>
        </button>
        {#if menuFor === t.id}
          <div class="menu left-2 top-[34px] min-w-[130px] z-40" on:click|stopPropagation>
            <button class="menu-item" on:click={() => { dispatch("renameTab", t.id); menuFor = null; }}>✏️ Rename</button>
            <button class="menu-item text-red-600 dark:text-red-400" on:click={() => { dispatch("deleteTab", t.id); menuFor = null; }}>🗑 Delete</button>
          </div>
        {/if}
      </div>
    {/each}
  </div>

  <div class="px-3 mt-4 mb-1">
    <p class="text-xs italic text-gray-500 dark:text-gray-400 leading-snug">
      {headings.length === 0
        ? "Headings you add to the document will appear here."
        : "Outline"}
    </p>
  </div>

  <div class="px-2 pb-4 space-y-0.5">
    {#each headings as h (h.index)}
      <button
        class="w-full text-left text-[13px] rounded px-2 py-1 truncate cursor-pointer text-gray-700 dark:text-gray-300 hover:bg-gray-200/60 dark:hover:bg-gray-700/60"
        style={`padding-left:${8 + (h.level - 1) * 12}px; font-weight:${h.level === 1 ? 600 : 400};`}
        title={h.text}
        on:click={() => dispatch("gotoHeading", h.index)}
      >
        {h.text}
      </button>
    {/each}
  </div>
</aside>
