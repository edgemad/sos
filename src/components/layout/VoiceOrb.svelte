<script lang="ts">
  // Jarvis-style voice orb: a floating, animated presence that appears while
  // Talia is listening or speaking. Reacts to live mic loudness while
  // dictating and pulses on each spoken word while reading aloud. Click it
  // to stop the current voice session.
  import { onDestroy } from "svelte";
  import {
    isListening,
    isSpeaking,
    micLevel,
    interimText,
    speakPulse,
    startMicLevel,
    stopMicLevel,
    stopSpeaking,
    stopVoiceTyping,
    ackPhrase
  } from "../../lib/voice";

  $: active = $isListening || $isSpeaking;

  // Mic loudness is only meaningful while listening; release the device as
  // soon as the session ends. Both no-op safely when unsupported/denied.
  $: if ($isListening) void startMicLevel();
  $: if (!$isListening) stopMicLevel();
  onDestroy(() => {
    stopMicLevel();
    if (greetingTimer) clearTimeout(greetingTimer);
  });

  // One-shot cute greeting each time the orb wakes up. Visual only — Talia
  // never speaks while the mic is live, or she would transcribe herself.
  let wasActive = false;
  let greeting = "";
  let greetingTimer: ReturnType<typeof setTimeout> | null = null;
  function showGreeting(): void {
    greeting = ackPhrase("greeting");
    if (greetingTimer) clearTimeout(greetingTimer);
    greetingTimer = setTimeout(() => (greeting = ""), 4200);
  }
  $: handleActiveChange($isListening, $isSpeaking);
  function handleActiveChange(listening: boolean, speaking: boolean): void {
    const nowActive = listening || speaking;
    if (nowActive && !wasActive) showGreeting();
    wasActive = nowActive;
  }

  $: status = $isListening ? "Listening…" : "Reading aloud…";

  function onOrbClick(): void {
    if ($isSpeaking) stopSpeaking();
    else if ($isListening) stopVoiceTyping();
  }
</script>

{#if active}
  <div class="fixed right-6 bottom-10 z-[55] flex flex-col items-center gap-2 select-none">
    {#if greeting}
      <div class="glass-strong !py-1.5 !px-3 rounded-full text-xs">{greeting}</div>
    {/if}
    {#if $isListening && $interimText}
      <div
        class="glass-strong !py-1.5 !px-3 rounded-full text-xs text-gray-500 dark:text-gray-400 max-w-[280px] truncate"
        role="status"
        aria-live="polite"
      >
        “{$interimText}”
      </div>
    {/if}
    <button
      class="relative w-20 h-20 rounded-full cursor-pointer"
      title="Talia voice — click to stop"
      aria-label="Voice orb — click to stop"
      on:click={onOrbClick}
    >
      <!-- halo scales with live mic loudness while listening -->
      <div
        class="absolute inset-0 rounded-full orb-halo"
        style="transform: scale({1 + ($isListening ? $micLevel : 0) * 0.8}); opacity: {0.35 + ($isListening ? $micLevel : 0) * 0.5};"
      ></div>
      <!-- ring that re-ripples on every spoken word while reading aloud -->
      {#key $speakPulse}
        <div class="absolute inset-0 rounded-full orb-wordpulse"></div>
      {/key}
      <div class="absolute inset-2 rounded-full orb-core" class:orb-speaking={$isSpeaking}></div>
      <div class="absolute inset-0 rounded-full orb-ring"></div>
      <div class="absolute inset-3 rounded-full orb-ring orb-ring-rev"></div>
    </button>
    <span class="text-xs text-gray-500 dark:text-gray-400">{status}</span>
  </div>
{/if}

<style>
  .orb-core {
    background: radial-gradient(circle at 35% 30%, rgba(140, 225, 255, 0.95), rgba(26, 115, 232, 0.8) 55%, rgba(9, 42, 96, 0.95));
    box-shadow: 0 0 26px rgba(64, 165, 255, 0.55), inset 0 0 14px rgba(255, 255, 255, 0.35);
    animation: orb-breathe 2.6s ease-in-out infinite;
  }
  .orb-core.orb-speaking {
    background: radial-gradient(circle at 35% 30%, rgba(160, 255, 220, 0.95), rgba(15, 157, 88, 0.8) 55%, rgba(6, 66, 44, 0.95));
    box-shadow: 0 0 26px rgba(35, 200, 130, 0.55), inset 0 0 14px rgba(255, 255, 255, 0.35);
  }
  .orb-halo {
    background: radial-gradient(circle, rgba(64, 165, 255, 0.45), transparent 70%);
    transition: transform 80ms linear, opacity 80ms linear;
  }
  .orb-ring {
    border: 1.5px dashed rgba(140, 205, 255, 0.55);
    animation: orb-spin 9s linear infinite;
  }
  .orb-ring-rev {
    animation: orb-spin 6s linear infinite reverse;
  }
  .orb-wordpulse {
    border: 2px solid rgba(140, 225, 255, 0.7);
    animation: orb-word 0.5s ease-out forwards;
  }
  @keyframes orb-breathe {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.07); }
  }
  @keyframes orb-spin {
    to { transform: rotate(360deg); }
  }
  @keyframes orb-word {
    from { transform: scale(0.85); opacity: 0.85; }
    to { transform: scale(1.55); opacity: 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .orb-core, .orb-ring, .orb-ring-rev, .orb-wordpulse { animation: none; }
  }
</style>
