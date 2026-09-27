<script lang="ts">
  // Settings modal — opened from the native menu or the header gear.
  import { get } from "svelte/store";
  import { settings, resetSettings } from "../../lib/settings";
  import { state } from "../../lib/state";
  import { saveFileDialog } from "../../lib/tauri";
  import { createEventDispatcher } from "svelte";

  const dispatch = createEventDispatcher<{ close: void }>();

  const fonts = [
    { label: "System UI", value: "'Segoe UI', system-ui, -apple-system, sans-serif" },
    { label: "Serif (Georgia)", value: "Georgia, 'Times New Roman', serif" },
    { label: "Rounded (Avenir)", value: "'Avenir Next', 'Segoe UI', sans-serif" },
    { label: "Monospace", value: "SFMono-Regular, Consolas, 'Liberation Mono', monospace" },
    { label: "Comic-friendly", value: "'Comic Sans MS', 'Chalkboard SE', cursive" }
  ];

  async function exportAllData(): Promise<void> {
    const payload = JSON.stringify({ exportedAt: Date.now(), data: get(state) }, null, 2);
    await saveFileDialog(`sos-backup-${new Date().toISOString().slice(0, 10)}.json`, payload);
  }

  const inputText = (e: Event): string => (e.currentTarget as HTMLInputElement).value;
  const selectValue = (e: Event): string => (e.currentTarget as HTMLSelectElement).value;
  const checkboxValue = (e: Event): boolean => (e.currentTarget as HTMLInputElement).checked;
</script>

<div class="fixed inset-0 z-[60] bg-black/40 grid place-items-center" on:click|self={() => dispatch("close")}>
  <div class="card w-[520px] max-w-[94vw] shadow-modal" on:click|stopPropagation>
    <div class="flex items-center justify-between px-5 py-3 border-b border-gray-200 dark:border-gray-700">
      <h2 class="font-semibold">Settings</h2>
      <button class="btn btn-ghost !px-2" title="Close" on:click={() => dispatch("close")}>✕</button>
    </div>

    <div class="p-5 space-y-5 max-h-[70vh] overflow-y-auto">
      <!-- Appearance -->
      <section>
        <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Appearance</h3>
        <div class="flex items-center justify-between">
          <span class="text-sm">Theme</span>
          <div class="flex gap-1">
            <button class="btn btn-ghost text-xs border border-gray-300" on:click={() => document.documentElement.classList.remove("dark")}>Light</button>
            <button class="btn btn-ghost text-xs border border-gray-300" on:click={() => document.documentElement.classList.add("dark")}>Dark</button>
          </div>
        </div>
      </section>

      <!-- Editor fonts -->
      <section>
        <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Editor font</h3>
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-gray-500 text-xs">Family</span>
            <select class="input" value={$settings.editorFont} on:change={(e) => settings.update((s) => ({ ...s, editorFont: selectValue(e) }))}>
              {#each fonts as f (f.value)}
                <option value={f.value}>{f.label}</option>
              {/each}
            </select>
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-gray-500 text-xs">Size: {$settings.editorFontSize}px</span>
            <input type="range" min="11" max="22" value={$settings.editorFontSize} on:input={(e) => settings.update((s) => ({ ...s, editorFontSize: parseInt(inputText(e), 10) }))} />
          </label>
        </div>
      </section>

      <!-- Autosave -->
      <section>
        <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Saving</h3>
        <label class="flex items-center justify-between text-sm">
          <span>Autosave</span>
          <input type="checkbox" checked={$settings.autosave} on:change={(e) => settings.update((s) => ({ ...s, autosave: checkboxValue(e) }))} />
        </label>
        <label class="flex flex-col gap-1 text-sm mt-2">
          <span class="text-gray-500 text-xs">Autosave delay: {$settings.autosaveMs} ms</span>
          <input type="range" min="200" max="3000" step="100" value={$settings.autosaveMs} on:input={(e) => settings.update((s) => ({ ...s, autosaveMs: parseInt(inputText(e), 10) }))} />
        </label>
      </section>

      <!-- Data -->
      <section>
        <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Data</h3>
        <div class="flex gap-2">
          <button class="btn btn-ghost border border-gray-300 dark:border-gray-600 text-xs" on:click={exportAllData}>
            ⬇️ Export all data (JSON)
          </button>
          <button class="btn btn-ghost border border-gray-300 dark:border-gray-600 text-xs text-red-600" on:click={resetSettings}>
            ↺ Reset settings
          </button>
        </div>
        <p class="text-xs text-gray-400 mt-2">All data lives on this device. Export creates a full backup.</p>
      </section>
    </div>

    <div class="px-5 py-3 border-t border-gray-200 dark:border-gray-700 flex justify-end">
      <button class="btn btn-primary" on:click={() => dispatch("close")}>Done</button>
    </div>
  </div>
</div>
