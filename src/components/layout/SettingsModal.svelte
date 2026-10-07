<script lang="ts">
  // Settings modal — opened from the native menu or the header gear.
  import { get } from "svelte/store";
  import { settings, resetSettings } from "../../lib/settings";
  import { THEME_PRESETS } from "../../lib/themes";
  import { toast } from "../../lib/uiBridge";
  import { speechVoices, isSpeechSynthesisSupported, speakTalia, stopSpeaking } from "../../lib/voice";
  import { state, darkMode } from "../../lib/state";
  import { saveFileDialog } from "../../lib/tauri";
  import { createEventDispatcher, onMount, onDestroy } from "svelte";

  const dispatch = createEventDispatcher<{ close: void }>();

  // ── Voice (Web Speech synthesis) ────────────────────────────────
  const speechAvailable = isSpeechSynthesisSupported();
  let voices: { name: string; lang: string }[] = [];
  let unsubscribeVoices: (() => void) | null = null;
  onMount(() => {
    unsubscribeVoices = speechVoices.subscribe((v) => (voices = v));
  });
  onDestroy(() => {
    unsubscribeVoices?.();
    stopSpeaking();
  });
  function testVoice(): void {
    stopSpeaking();
    const spoken = speakTalia("Hi hi! It's Talia! This is how I'll sound when I help you.", get(settings));
    if (!spoken) toast("Voice is turned off — enable voice features first.");
  }

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

  // ── Talia AI connection test ─────────────────────────────────────
  let testingAi = false;
  async function testAiConnection(): Promise<void> {
    const s = get(settings);
    if (!s.taliaEndpoint.trim() || !s.taliaModel.trim()) {
      toast("Fill in both the server URL and the model name first.");
      return;
    }
    testingAi = true;
    try {
      const { askTalia } = await import("../../lib/talia");
      const answer = await askTalia({ input: "ping", history: [], attachments: [], endpoint: s.taliaEndpoint, model: s.taliaModel });
      if (answer.source === "ollama") toast(`✅ ${s.taliaModel} is alive and talking!`);
      else toast(`❌ Couldn't reach the model (${answer.fallbackReason ?? "unknown error"}).`);
    } catch {
      toast("❌ Couldn't reach the model — check the URL and that the server is running.");
    } finally {
      testingAi = false;
    }
  }
</script>

<div class="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm grid place-items-center" on:click|self={() => dispatch("close")}>
  <div class="glass-strong w-[520px] max-w-[94vw] rounded-xl" on:click|stopPropagation>
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
          <button class="btn btn-ghost text-xs border border-gray-300 {$darkMode ? '' : '!bg-docs/10 !border-docs !text-docs'}" on:click={() => darkMode.set(false)}>Light</button>
          <button class="btn btn-ghost text-xs border border-gray-300 {$darkMode ? '!bg-docs/10 !border-docs !text-docs' : ''}" on:click={() => darkMode.set(true)}>Dark</button>
        </div>
        </div>
        <label class="flex flex-col gap-1 text-sm mt-3">
          <span class="text-gray-500 text-xs">Color world — pick your vibe</span>
          <div class="flex flex-wrap gap-1.5">
            {#each THEME_PRESETS as t (t.id)}
              <button
                class="chip cursor-pointer border text-xs px-2.5 py-1 rounded-full
                  {$settings.themePreset === t.id ? 'border-transparent text-white' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}"
                style={$settings.themePreset === t.id ? `background:${t.accent}` : `border-color:${t.accent}66`}
                on:click={() => settings.update((s) => ({ ...s, themePreset: t.id }))}
              >{t.emoji} {t.label}</button>
            {/each}
          </div>
        </label>
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

      <!-- Talia AI -->
      <section>
        <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Talia AI</h3>
        <p class="text-xs text-gray-400 mb-2">Optional: point Talia at a self-hosted model (any Ollama-compatible server). Everything stays on your machine or your own server.</p>
        <div class="grid grid-cols-2 gap-3">
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-gray-500 text-xs">Server URL</span>
            <input class="input" placeholder="http://localhost:11434" value={$settings.taliaEndpoint} on:change={(e) => settings.update((s) => ({ ...s, taliaEndpoint: inputText(e).trim() }))} />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-gray-500 text-xs">Model</span>
            <input class="input" placeholder="llama3.2" value={$settings.taliaModel} on:change={(e) => settings.update((s) => ({ ...s, taliaModel: inputText(e).trim() }))} />
          </label>
        </div>
        <p class="text-xs text-gray-400 mt-2">{$settings.taliaEndpoint && $settings.taliaModel ? `🧠 Self-hosted brain: ${$settings.taliaModel}` : "🧠 Using Talia's built-in offline brain (no setup needed)."}</p>
        <button
          class="btn btn-ghost border border-gray-300 dark:border-gray-600 text-xs mt-2"
          disabled={testingAi}
          on:click={() => void testAiConnection()}
        >{testingAi ? "Testing…" : "🔌 Test connection"}</button>
      </section>

      <!-- Voice -->
      <section>
        <h3 class="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">Voice</h3>
        <label class="flex items-center justify-between text-sm">
          <span>Enable voice features</span>
          <input type="checkbox" checked={$settings.voiceEnabled} on:change={(e) => settings.update((s) => ({ ...s, voiceEnabled: checkboxValue(e) }))} />
        </label>
        <div class="grid grid-cols-2 gap-3 mt-2">
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-gray-500 text-xs">Persona</span>
            <select class="input" value={$settings.voicePersona} on:change={(e) => settings.update((s) => ({ ...s, voicePersona: selectValue(e) === "assistant" ? "assistant" : "kid" }))}>
              <option value="kid">🧒 Kid — cute & bright</option>
              <option value="assistant">🤖 Assistant — calm & even</option>
            </select>
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-gray-500 text-xs">Pitch: {$settings.voicePitch.toFixed(1)}</span>
            <input type="range" min="0.5" max="2" step="0.1" value={$settings.voicePitch} on:input={(e) => settings.update((s) => ({ ...s, voicePitch: parseFloat(inputText(e)) || 1 }))} />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-gray-500 text-xs">Reading speed: {$settings.voiceRate.toFixed(1)}×</span>
            <input type="range" min="0.5" max="2" step="0.1" value={$settings.voiceRate} on:input={(e) => settings.update((s) => ({ ...s, voiceRate: parseFloat(inputText(e)) || 1 }))} />
          </label>
          <label class="flex flex-col gap-1 text-sm">
            <span class="text-gray-500 text-xs">Voice</span>
            <select class="input" value={$settings.voiceName} on:change={(e) => settings.update((s) => ({ ...s, voiceName: selectValue(e) }))}>
              <option value="">Automatic{($settings.voicePersona === "kid") ? " (kid-like)" : ""}</option>
              {#each voices as v (v.name)}
                <option value={v.name}>{v.name} ({v.lang})</option>
              {/each}
            </select>
          </label>
        </div>
        {#if !speechAvailable}
          <p class="text-xs text-gray-400 mt-2">Speech synthesis is not available in this environment.</p>
        {:else}
          <button class="btn btn-ghost border border-gray-300 dark:border-gray-600 text-xs mt-3" on:click={testVoice}>▶ Test voice</button>
        {/if}
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

    <div class="px-5 py-3 border-t border-gray-200/70 dark:border-gray-700/60 flex items-center justify-between">
      <span class="text-xs text-gray-400">Developed by <span class="font-medium text-gray-600 dark:text-gray-300">Talia</span> · MIT License</span>
      <button class="btn btn-primary" on:click={() => dispatch("close")}>Done</button>
    </div>
  </div>
</div>
