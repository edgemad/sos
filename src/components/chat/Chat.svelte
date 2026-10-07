<script lang="ts">
  // Talia Chat — the Jarvis-style conversation surface. Paste screenshots,
  // attach files of ANY type, talk with the mic, and Talia answers in her kid
  // voice — from a self-hosted Ollama model when configured, from her built-in
  // offline brain otherwise. History persists on-device only.
  import { onDestroy, tick } from "svelte";
  import { get } from "svelte/store";
  import {
    askTalia,
    classifyAttachment,
    summarizeText,
    type ChatMessage,
    type TaliaAttachment
  } from "../../lib/talia";
  import { settings } from "../../lib/settings";
  import { toast } from "../../lib/uiBridge";
  import { recordCommand } from "../../lib/adaptive";
  import { uid, now as unixNow } from "../../lib/utils";
  import { fileToEmbeddedImageSrc, formatBytes, iconForFile } from "../../lib/attachments";
  import { isTauri } from "../../lib/tauri";
  import { createVoiceTyping, isSpeechRecognitionSupported, speakTalia, stopSpeaking, type VoiceTypingHandle } from "../../lib/voice";

  const STORE_KEY = "sos.talia.chat.v1";
  const MAX_MESSAGES = 200;

  function loadHistory(): ChatMessage[] {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      const parsed = raw ? (JSON.parse(raw) as ChatMessage[]) : [];
      return Array.isArray(parsed) ? parsed.slice(-MAX_MESSAGES) : [];
    } catch {
      return [];
    }
  }

  function saveHistory(messages: ChatMessage[]): void {
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify(messages.slice(-MAX_MESSAGES)));
    } catch {
      /* quota — chat history is disposable */
    }
  }

  let messages: ChatMessage[] = loadHistory();
  let input = "";
  let thinking = false;
  let attachments: TaliaAttachment[] = [];
  let listEl: HTMLDivElement | undefined;
  let typing: VoiceTypingHandle | null = null;
  let micOn = false;

  $: endpointConfigured = !!$settings.taliaEndpoint.trim() && !!$settings.taliaModel.trim();

  async function scrollToEnd(): Promise<void> {
    await tick();
    listEl?.scrollTo({ top: listEl.scrollHeight, behavior: "smooth" });
  }

  // ── Attachment ingestion ────────────────────────────────────────

  const MAX_CHAT_ATTACHMENT_BYTES = 20 * 1024 * 1024; // 20 MB safety cap

  async function ingestFileLike(name: string, mime: string | undefined, size: number, readText: () => Promise<string>, readImage: () => Promise<string | null>): Promise<TaliaAttachment> {
    const kind = classifyAttachment(name, mime);
    if (size > MAX_CHAT_ATTACHMENT_BYTES) {
      return { name, kind: "other", size };
    }
    if (kind === "image") {
      const dataUrl = await readImage();
      return { name, kind, size, ...(dataUrl ? { dataUrl } : {}) };
    }
    if (kind === "text") {
      try {
        const { preview, truncated } = summarizeText(await readText());
        return { name, kind, size, textPreview: preview, truncated };
      } catch {
        return { name, kind: "other", size };
      }
    }
    return { name, kind, size };
  }

  function pickFileInput(): Promise<File | null> {
    return new Promise((resolve) => {
      const inp = document.createElement("input");
      inp.type = "file";
      inp.onchange = () => resolve(inp.files?.[0] ?? null);
      inp.oncancel = () => resolve(null);
      inp.click();
    });
  }

  async function attachAny(): Promise<void> {
    recordCommand("chat:attach");
    if (isTauri()) {
      try {
        const core = await import("@tauri-apps/api/core");
        const picked = await core.invoke<{ path: string; name: string } | null>("pick_any_file_dialog");
        if (picked) {
          attachments = [...attachments, await ingestTauriPath(picked.path, picked.name)];
          void scrollToEnd();
          return;
        }
        return;
      } catch {
        /* fall through to browser picker */
      }
    }
    const f = await pickFileInput();
    if (f) {
      attachments = [...attachments, await ingestFileLike(f.name, f.type, f.size, () => f.text(), () => fileToEmbeddedImageSrc(f))];
      void scrollToEnd();
    }
  }

  /** Desktop path: text-ish files via the native reader; images preview via
   *  the asset protocol (no bytes copied). */
  async function ingestTauriPath(path: string, name: string): Promise<TaliaAttachment> {
    const kind = classifyAttachment(name);
    if (kind === "text") {
      try {
        const core = await import("@tauri-apps/api/core");
        const text = await core.invoke<string>("read_text_file", { path });
        const { preview, truncated } = summarizeText(text);
        return { name, kind, textPreview: preview, truncated };
      } catch {
        return { name, kind: "other" };
      }
    }
    if (kind === "image") {
      try {
        const core = await import("@tauri-apps/api/core");
        return { name, kind, dataUrl: core.convertFileSrc(path) };
      } catch {
        return { name, kind };
      }
    }
    return { name, kind };
  }

  /** Screenshot paste: image clipboard items become attachments. */
  async function onPaste(e: ClipboardEvent): Promise<void> {
    const files = Array.from(e.clipboardData?.files ?? []);
    const images = files.filter((f) => f.type.startsWith("image/"));
    if (images.length === 0) return; // normal text paste
    e.preventDefault();
    recordCommand("chat:paste");
    for (const f of images) {
      attachments = [...attachments, await ingestFileLike(f.name || "screenshot.png", f.type, f.size, () => f.text(), () => fileToEmbeddedImageSrc(f))];
    }
    void scrollToEnd();
  }

  async function onDrop(e: DragEvent): Promise<void> {
    const files = Array.from(e.dataTransfer?.files ?? []);
    if (files.length === 0) return;
    e.preventDefault();
    for (const f of files) {
      attachments = [...attachments, await ingestFileLike(f.name, f.type, f.size, () => f.text(), () => fileToEmbeddedImageSrc(f))];
    }
    void scrollToEnd();
  }

  function removeAttachment(index: number): void {
    attachments = attachments.filter((_, i) => i !== index);
  }

  // ── Voice ───────────────────────────────────────────────────────

  function toggleMic(): void {
    if (micOn) {
      typing?.stop();
      micOn = false;
      return;
    }
    if (!isSpeechRecognitionSupported()) {
      toast("Voice input needs the Web Speech API — available in the desktop app and Chrome.");
      return;
    }
    recordCommand("chat:mic");
    typing = createVoiceTyping({
      onFinal: (text) => {
        input = (input ? input + " " : "") + text;
      },
      onStateChange: (active) => (micOn = active),
      onError: (err) => toast("Voice input error: " + err),
      continuous: false
    });
    typing?.start();
  }

  // ── Send / receive ──────────────────────────────────────────────

  async function send(): Promise<void> {
    const text = input.trim();
    if ((!text && attachments.length === 0) || thinking) return;
    recordCommand("chat:send");
    const userMsg: ChatMessage = { id: uid(), role: "user", text, ts: unixNow(), attachments: attachments.length ? attachments : undefined };
    messages = [...messages, userMsg];
    input = "";
    attachments = [];
    void scrollToEnd();

    const s = get(settings);
    thinking = true;
    try {
      const answer = await askTalia({
        input: text || "(see attachment)",
        history: messages.slice(0, -1),
        attachments: userMsg.attachments ?? [],
        endpoint: s.taliaEndpoint,
        model: s.taliaModel,
        now: Date.now()
      });
      const reply: ChatMessage = { id: uid(), role: "talia", text: answer.text, ts: Date.now(), source: answer.source };
      messages = [...messages, reply];
      saveHistory(messages);
      if (answer.fallbackReason) {
        console.warn("Talia: self-hosted model unavailable:", answer.fallbackReason);
        toast("Self-hosted model unreachable — answered with the built-in brain.");
      }
      void scrollToEnd();
      speakTalia(answer.text, s);
    } catch (err) {
      toast("Talia hit a snag: " + (err instanceof Error ? err.message : String(err)));
    } finally {
      thinking = false;
    }
  }

  function clearChat(): void {
    stopSpeaking();
    messages = [];
    attachments = [];
    saveHistory(messages);
  }

  function fmtTime(ts: number): string {
    return new Date(ts).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function chipIcon(a: TaliaAttachment): string {
    return a.kind === "image" ? "🖼️" : iconForFile(a.name);
  }

  function onKeydown(e: KeyboardEvent): void {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  }

  onDestroy(() => {
    typing?.stop();
    stopSpeaking();
    saveHistory(messages);
  });
</script>

<div class="flex-1 flex flex-col min-h-0" on:paste={onPaste} on:dragover|preventDefault on:drop={onDrop}>
  <!-- Header -->
  <div class="flex items-center gap-2 px-5 pt-4 pb-2 max-w-[820px] mx-auto w-full">
    <div class="w-9 h-9 rounded-full grid place-items-center text-xl" style="background:var(--sos-accent)22">💬</div>
    <div class="flex-1 min-w-0">
      <p class="font-medium text-sm">Talk to Talia</p>
      <p class="text-[11px] text-gray-500 dark:text-gray-400">
        {#if endpointConfigured}
          🧠 Self-hosted: {$settings.taliaModel}
        {:else}
          🧠 Built-in brain · <button class="underline hover:no-underline" on:click={() => toast("Settings → Talia AI: point Talia at your own Ollama model for full brainpower.")}>connect a model</button> for more power
        {/if}
      </p>
    </div>
    <button class="btn btn-ghost !px-2 text-xs" title="Clear conversation" on:click={clearChat}>🧹</button>
  </div>

  <!-- Messages -->
  <div bind:this={listEl} class="flex-1 overflow-y-auto px-5 pb-3">
    <div class="max-w-[820px] mx-auto w-full space-y-3">
      {#if messages.length === 0}
        <div class="text-center py-14 text-gray-400">
          <p class="text-4xl mb-2">👋</p>
          <p class="text-sm">Say hi, paste a screenshot, or attach any file — Talia's on duty!</p>
        </div>
      {/if}
      {#each messages as m (m.id)}
        <div class="flex {m.role === 'user' ? 'justify-end' : 'justify-start'}">
          <div
            class="max-w-[78%] rounded-2xl px-4 py-2.5 {m.role === 'user'
              ? 'text-white rounded-br-md'
              : 'card glass rounded-bl-md'}"
            style={m.role === "user" ? `background:linear-gradient(135deg, var(--sos-accent), color-mix(in srgb, var(--sos-accent) 75%, #000 10%))` : ""}
          >
            {#if m.attachments?.length}
              <div class="flex flex-wrap gap-1.5 mb-1.5">
                {#each m.attachments as a (a.name + String(a.size ?? ""))}
                  {#if a.kind === "image" && a.dataUrl}
                    <img src={a.dataUrl} alt={a.name} class="max-h-40 rounded-lg border border-black/10 dark:border-white/10" />
                  {:else}
                    <span class="chip text-[11px] {m.role === 'user' ? 'bg-white/20' : 'glass-strong'}" title={a.name}>
                      {chipIcon(a)} {a.name}{a.size != null ? ` · ${formatBytes(a.size)}` : ""}
                    </span>
                  {/if}
                {/each}
              </div>
            {/if}
            {#if m.text}
              <p class="text-sm whitespace-pre-wrap break-words leading-snug">{m.text}</p>
            {/if}
            <p class="text-[10px] mt-1 opacity-60 flex items-center gap-1">
              {fmtTime(m.ts)}
              {#if m.role === "talia" && m.source === "local"}
                <span title="Answered by Talia's built-in offline brain">· built-in brain</span>
              {:else if m.role === "talia" && m.source === "ollama"}
                <span title="Answered by your self-hosted model">· self-hosted</span>
              {/if}
            </p>
          </div>
        </div>
      {/each}
      {#if thinking}
        <div class="flex justify-start">
          <div class="card glass rounded-2xl rounded-bl-md px-4 py-2.5">
            <p class="text-sm text-gray-500 dark:text-gray-400 animate-pulse">Talia is thinking…</p>
          </div>
        </div>
      {/if}
    </div>
  </div>

  <!-- Pending attachment chips -->
  {#if attachments.length}
    <div class="px-5 pb-2">
      <div class="max-w-[820px] mx-auto w-full flex flex-wrap gap-1.5">
        {#each attachments as a, i (a.name + i)}
          <span class="chip glass-strong text-[11px]">
            {chipIcon(a)} {a.name}{a.size != null ? ` · ${formatBytes(a.size)}` : ""}
            <button class="opacity-60 hover:opacity-100 ml-0.5" title="Remove" on:click={() => removeAttachment(i)}>✕</button>
          </span>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Composer -->
  <div class="px-5 pb-5">
    <div class="max-w-[820px] mx-auto w-full card glass rounded-2xl p-2 flex items-end gap-1.5">
      <button class="btn btn-ghost !px-2" title="Attach any file" on:click={() => void attachAny()}>📎</button>
      <button class="btn btn-ghost !px-2 {micOn ? '!text-red-600 animate-pulse' : ''}" title="Voice input" on:click={toggleMic}>🎙</button>
      <textarea
        class="flex-1 bg-transparent outline-none resize-none text-sm py-1.5 max-h-32"
        placeholder="Message Talia… (paste a screenshot anytime)"
        rows={1}
        bind:value={input}
        on:keydown={onKeydown}
      />
      <button class="btn btn-primary !h-8 !px-3 text-sm" disabled={thinking || (!input.trim() && attachments.length === 0)} on:click={() => void send()}>Send</button>
    </div>
  </div>
</div>
