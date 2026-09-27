<script lang="ts">
  // Fullscreen presenter: slide renderer, notes, stopwatch.
  import { createEventDispatcher, onMount, onDestroy } from "svelte";
  import type { Deck, Slide, SlideBlock } from "../../types";

  export let deck: Deck;
  export let initialIndex = 0;

  const dispatch = createEventDispatcher<{ close: void }>();

  let index = initialIndex;
  let seconds = 0;
  let showNotes = false;
  let timer: ReturnType<typeof setInterval>;
  let transitionClass = "";

  $: visibleSlides = (deck.slides ?? []).filter((s) => !s.skipped);
  $: slide = visibleSlides[Math.min(index, Math.max(0, visibleSlides.length - 1))] ?? visibleSlides[0] ?? deck.slides[0] ?? null;
  $: if (slide) pulseTransition(slide);

  onMount(() => {
    timer = setInterval(() => (seconds += 1), 1000);
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  });

  onDestroy(() => {
    clearInterval(timer);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  });

  function fmt(t: number): string {
    const m = Math.floor(t / 60);
    const s = t % 60;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  function next(): void {
    index = Math.min(index + 1, visibleSlides.length - 1);
  }

  function prev(): void {
    index = Math.max(index - 1, 0);
  }

  function pulseTransition(s: Slide): void {
    const kind = s.transition ?? deck.transition ?? "none";
    if (kind === "none") { transitionClass = ""; return; }
    transitionClass = "";
    requestAnimationFrame(() => (transitionClass = `anim-${kind}`));
  }

  function totalIndex(): number {
    if (!slide) return 0;
    const i = (deck.slides ?? []).indexOf(slide);
    return i + 1;
  }

  function onKey(e: KeyboardEvent): void {
    if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") next();
    else if (e.key === "ArrowLeft" || e.key === "PageUp") prev();
    else if (e.key === "Escape") dispatch("close");
    else if (e.key.toLowerCase() === "n") showNotes = !showNotes;
  }

  function styleFor(b: SlideBlock): string {
    const bg = b.type === "shape" ? b.color + "22" : "transparent";
    return `left:${b.x}%;top:${b.y}%;width:${b.w}%;height:${b.h}%;
      font-size:${Math.max(10, b.fontSize)}px;color:${b.color};text-align:${b.align};background:${bg};
      font-weight:${b.bold ? 700 : 400};font-style:${b.italic ? "italic" : "normal"};
      transform:rotate(${b.rotation ?? 0}deg) scaleX(${b.flipX ? -1 : 1}) scaleY(${b.flipY ? -1 : 1});`;
  }
</script>

<svelte:window on:keydown={onKey} />

<svelte:head>
  <style>
    @keyframes sos-fade { from { opacity: 0 } to { opacity: 1 } }
    @keyframes sos-slide { from { transform: translateX(6%) } to { transform: translateX(0) } }
    @keyframes sos-zoom { from { transform: scale(0.94) } to { transform: scale(1) } }
    @keyframes sos-flip { from { transform: perspective(1200px) rotateY(12deg) } to { transform: perspective(1200px) rotateY(0) } }
    .anim-fade { animation: sos-fade 260ms ease-out }
    .anim-slide { animation: sos-slide 260ms ease-out }
    .anim-zoom { animation: sos-zoom 260ms ease-out }
    .anim-flip { animation: sos-flip 320ms ease-out }
  </style>
</svelte:head>

<div class="fixed inset-0 z-50 bg-black flex flex-col" role="dialog" aria-modal="true">
  <!-- Slide viewport -->
  <div class="flex-1 grid place-items-center p-6 min-h-0">
    <div
      class="relative w-full shadow-modal {transitionClass}"
      style="aspect-ratio:16/9; max-width:min(100%, calc((100vh - 120px) * 16/9)); background:{slide.background};"
    >
      {#each slide.blocks as b (b.id)}
        <div class="absolute overflow-hidden" style={styleFor(b)}>
          {#if b.type === "image" && b.text}
            <img src={b.text} alt="slide image" class="w-full h-full object-contain" draggable="false" />
          {:else if b.type === "code"}
            <pre class="w-full h-full m-0 p-3 overflow-hidden font-mono" style="font-size:inherit">{b.text}</pre>
          {:else if b.type === "line"}
            <div class="w-full h-full grid place-items-center">
              <div class="w-full" style={`height:2px;background:${b.color};transform:rotate(${b.h > 30 ? 90 : 0}deg)`} />
            </div>
          {:else}
            {#if b.link}
              <span class="whitespace-pre-wrap underline underline-offset-2">{b.text}</span>
            {:else}
              <span class="whitespace-pre-wrap">{b.text}</span>
            {/if}
          {/if}
        </div>
      {/each}
      {#if deck.showSlideNumbers}
        <div class="absolute bottom-3 right-4 text-sm opacity-60" style={`color:${slide.background === "#ffffff" ? "#202124" : "#ffffff"}`}>
          {totalIndex()}
        </div>
      {/if}
    </div>
  </div>

  <!-- Presenter controls -->
  <div class="shrink-0 h-14 flex items-center gap-4 px-6 text-white/90">
    <span class="font-mono text-lg" title="Elapsed time">⏱ {fmt(seconds)}</span>
    <span class="text-sm text-white/60">{index + 1} / {visibleSlides.length}</span>
    <span class="flex-1" />
    <button class="btn btn-ghost !text-white/90 hover:!bg-white/10" on:click={prev}>← Prev</button>
    <button class="btn btn-ghost !text-white/90 hover:!bg-white/10" on:click={next}>Next →</button>
    <button class="btn btn-ghost !text-white/90 hover:!bg-white/10" on:click={() => (showNotes = !showNotes)}>📝 Notes (N)</button>
    <button class="btn btn-ghost !text-white/90 hover:!bg-white/10" on:click={() => dispatch("close")}>✕ Exit (Esc)</button>
  </div>

  {#if showNotes}
    <div class="shrink-0 max-h-[30vh] overflow-y-auto px-6 pb-4 text-white/85 text-sm">
      <div class="card !bg-[#111] p-4 whitespace-pre-wrap">
        {slide.notes || "No notes for this slide."}
      </div>
    </div>
  {/if}
</div>
