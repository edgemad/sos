<script lang="ts">
  // Chart builder for Sheets: pick a range + chart type, live SVG preview,
  // floating overlay card on the grid. Pure inline SVG — no chart dependency.
  import { createEventDispatcher, onMount } from "svelte";
  import SheetChart from "./SheetChart.svelte";

  export let initialRange = ""; // e.g. "A1:B5"
  /** Resolve a range string to {labels, series} — provided by the parent sheet. */
  export let getData: (range: string) => { labels: string[]; series: { name: string; color: string; values: number[] }[] } = () => ({ labels: [], series: [] });

  const dispatch = createEventDispatcher<{ close: void; create: { kind: string; range: string; title: string } }>();

  const KINDS: { id: "bar" | "line" | "pie"; label: string; icon: string }[] = [
    { id: "bar", label: "Bar", icon: "▮" },
    { id: "line", label: "Line", icon: "📈" },
    { id: "pie", label: "Pie", icon: "◕" }
  ];

  let kind: "bar" | "line" | "pie" = "bar";
  let rangeText = initialRange;
  let title = "Chart";
  let previewHost: HTMLDivElement;

  onMount(() => {
    const inp = previewHost?.querySelector("input");
    inp?.focus();
    inp?.select();
  });

  /** Parse "A1:B5" (or a single cell) into {r0,r1,c0,c1} or null. */
  function parseRange(text: string): { r0: number; r1: number; c0: number; c1: number } | null {
    const norm = text.trim().toUpperCase().replace(/\$/g, "");
    const m = /^([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(norm);
    if (!m) return null;
    const c0 = colNum(m[1]);
    const r0 = parseInt(m[2], 10) - 1;
    const c1 = m[3] ? colNum(m[3]) : c0;
    const r1 = m[4] ? parseInt(m[4], 10) - 1 : r0;
    return { r0: Math.min(r0, r1), r1: Math.max(r0, r1), c0: Math.min(c0, c1), c1: Math.max(c0, c1) };
  }

  function colNum(letters: string): number {
    let n = 0;
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
  }

  function create(): void {
    if (!parseRange(rangeText)) return;
    dispatch("create", { kind, range: rangeText.trim().toUpperCase(), title: title.trim() || "Chart" });
  }

  $: preview = parseRange(rangeText) ? getData(rangeText) : { labels: [], series: [] };
</script>

<div class="fixed inset-0 z-[70] bg-black/40 grid place-items-center" on:click|self={() => dispatch("close")}>
  <div class="card w-[560px] max-w-[94vw] p-5 shadow-modal" on:click|stopPropagation>
    <h3 class="font-medium mb-3">Insert chart</h3>
    <p class="text-xs text-gray-500 mb-3">
      First row/column are used as labels. Formulas are evaluated before charting.
    </p>
    <div class="flex gap-2 mb-3">
      {#each KINDS as k (k.id)}
        <button
          class="btn text-xs flex-1 {kind === k.id ? 'btn-primary' : 'btn-ghost'}"
          on:click={() => (kind = k.id)}
        >{k.icon} {k.label}</button>
      {/each}
    </div>
    <div bind:this={previewHost} class="grid grid-cols-2 gap-3 mb-3">
      <label class="text-xs text-gray-500 block">
        Data range
        <input class="input w-full mt-1 font-mono" bind:value={rangeText} placeholder="A1:B5"
          on:keydown={(e) => e.key === "Enter" && create()} />
      </label>
      <label class="text-xs text-gray-500 block">
        Title
        <input class="input w-full mt-1" bind:value={title} placeholder="Chart" on:keydown={(e) => e.key === "Enter" && create()} />
      </label>
    </div>
    <div class="border border-gray-200 dark:border-gray-700 rounded-md h-[220px] grid place-items-center bg-white dark:bg-[#1f1f1f] mb-4 overflow-hidden">
      {#if parseRange(rangeText)}
        <div class="w-full h-full p-1">
          <SheetChart {kind} labels={preview.labels} series={preview.series} {title} w={520} h={210} />
        </div>
      {:else}
        <span class="text-xs text-gray-400">Enter a range like A1:B5</span>
      {/if}
    </div>
    <div class="flex justify-end gap-2">
      <button class="btn btn-ghost text-xs" on:click={() => dispatch("close")}>Cancel</button>
      <button class="btn btn-primary text-xs disabled:opacity-40" disabled={!parseRange(rangeText)} on:click={create}>
        Insert chart
      </button>
    </div>
  </div>
</div>
