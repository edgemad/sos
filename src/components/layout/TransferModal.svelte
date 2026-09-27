<script lang="ts">
  // Unified Import / Export dialog shared by Docs, Sheets and Slides so the
  // three modules behave identically. Emits `pick` with the chosen format id.
  import { createEventDispatcher } from "svelte";

  export let mode: "import" | "export" = "export";
  export let options: { id: string; label: string; ext: string; desc: string }[] = [];
  export let accent = "#1a73e8";

  const dispatch = createEventDispatcher<{ pick: string; close: void }>();

  let error = "";

  function pick(id: string): void {
    dispatch("pick", id);
  }

  export function showError(msg: string): void {
    error = msg;
  }
</script>

<div class="fixed inset-0 z-50 grid place-items-center bg-black/40" role="dialog" aria-modal="true" on:click|self={() => dispatch("close")}>
  <div class="card w-[480px] max-w-[94vw] p-5">
    <h3 class="font-semibold text-lg mb-1">{mode === "import" ? "Import file" : "Download as"}</h3>
    <p class="text-sm text-gray-500 mb-4">
      {mode === "import"
        ? "The file is converted locally — nothing leaves your machine."
        : "Choose a format. Everything is generated offline."}
    </p>

    <div class="grid gap-2">
      {#each options as o (o.id)}
        <button
          class="flex items-center gap-3 p-3 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-400 hover:bg-blue-50/40 dark:hover:bg-blue-900/20 text-left transition-colors cursor-pointer"
          on:click={() => pick(o.id)}
        >
          <span class="w-10 h-10 rounded-md grid place-items-center text-white text-[11px] font-bold shrink-0" style={`background:${accent}`}>{o.ext}</span>
          <span class="flex-1 min-w-0">
            <span class="block text-sm font-medium">{o.label}</span>
            <span class="block text-xs text-gray-500 truncate">{o.desc}</span>
          </span>
          <span class="text-gray-300">›</span>
        </button>
      {/each}
    </div>

    {#if error}
      <div class="mt-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/20 dark:text-red-300 rounded-md px-3 py-2">⚠️ {error}</div>
    {/if}

    <div class="flex justify-end mt-4">
      <button class="btn" on:click={() => dispatch("close")}>Cancel</button>
    </div>
  </div>
</div>
