<script lang="ts">
  // Talia Arcade — an in-app game store. Browse, install, play; personal
  // bests persist locally. Games are built in (offline, zero dependencies).
  import { onDestroy } from "svelte";
  import {
    GAMES,
    arcade,
    installGame,
    uninstallGame,
    recordScore,
    isInstalled,
    bestScore,
    gameById,
    type GameId,
    type GameMeta
  } from "../../lib/arcade";
  import { mountGame } from "../../lib/games";

  type Filter = "All" | GameMeta["category"];
  const CATEGORIES: Filter[] = ["All", "Arcade", "Puzzle", "Classic"];

  let filter: Filter = "All";
  let installingId: GameId | null = null;
  let progress = 0;
  let installTimer: ReturnType<typeof setInterval> | null = null;

  $: installedCount = $arcade.installed.length;
  $: featured = [...GAMES].sort((a, b) => Number(isInstalled($arcade, b.id)) - Number(isInstalled($arcade, a.id)) || b.rating - a.rating)[0];
  $: visible = GAMES.filter((g) => filter === "All" || g.category === filter);

  function startInstall(id: GameId): void {
    if (installingId) return;
    installingId = id;
    progress = 0;
    installTimer = setInterval(() => {
      progress = Math.min(100, progress + 9 + Math.random() * 14);
      if (progress >= 100) {
        if (installTimer) clearInterval(installTimer);
        installTimer = null;
        installGame(id);
        installingId = null;
        progress = 0;
      }
    }, 55);
  }

  // ── Play view ───────────────────────────────────────────────────

  let playing: GameId | null = null;
  let score = 0;
  let newBest = false;
  let host: HTMLDivElement | null = null;
  let cleanup: (() => void) | null = null;

  $: best = playing ? bestScore($arcade, playing) : 0;
  $: playGame = playing ? gameById(playing) : null;

  // Mount the engine when a game starts (or the host appears), tearing down
  // the previous one first. Arrow-scoped so the host binding re-runs it.
  $: if (host && playing) openGame(playing);
  function openGame(id: GameId): void {
    teardown();
    score = 0;
    newBest = false;
    cleanup = mountGame(host!, id, {
      onScore: (s) => (score = s),
      onGameOver: (final) => {
        newBest = recordScore(id, final);
      }
    });
  }
  function teardown(): void {
    cleanup?.();
    cleanup = null;
  }
  function closeGame(): void {
    teardown();
    playing = null;
  }

  function stars(rating: number): string {
    const full = Math.floor(rating);
    return "★".repeat(full) + (rating - full >= 0.5 ? "☆" : "") ;
  }

  onDestroy(() => {
    if (installTimer) clearInterval(installTimer);
    teardown();
  });
</script>

<div class="flex-1 overflow-y-auto">
  {#if playing && playGame}
    <!-- ── Play view ── -->
    <div class="px-6 pt-4 pb-10 max-w-[760px] mx-auto w-full">
      <div class="flex items-center gap-3 mb-4">
        <button class="btn btn-ghost !px-2.5" on:click={closeGame} title="Back to the store">←</button>
        <div class="w-9 h-9 rounded-lg grid place-items-center text-lg" style={`background:linear-gradient(135deg,${playGame.from},${playGame.to})`}>
          {playGame.icon}
        </div>
        <div class="flex-1 min-w-0">
          <p class="font-medium text-sm truncate">{playGame.name}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400">{playGame.controls}</p>
        </div>
        <div class="text-right">
          <p class="text-sm font-semibold tabular-nums">{score}</p>
          <p class="text-[11px] text-gray-500 dark:text-gray-400">best {best}</p>
        </div>
      </div>

      {#if newBest}
        <div class="mb-3 text-center text-xs font-medium text-amber-600 dark:text-amber-400">🏆 New personal best!</div>
      {/if}

      <div class="card glass p-4">
        <div bind:this={host}></div>
      </div>
      <p class="text-center text-[11px] text-gray-400 mt-3">Progress saves automatically · your best is {best}</p>
    </div>
  {:else}
    <!-- ── Store view ── -->
    <div class="px-6 pt-6 pb-10 max-w-[1000px] mx-auto w-full">
      <div class="flex items-end justify-between mb-4">
        <div>
          <h1 class="text-xl font-medium">🕹️ Talia Arcade</h1>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Tiny games, installed in a blink — everything runs on your device.</p>
        </div>
        <span class="chip">{installedCount}/{GAMES.length} installed</span>
      </div>

      <!-- Featured banner -->
      {#if featured}
        <div class="card glass overflow-hidden mb-5 relative">
          <div class="h-36 flex items-center px-6 gap-5" style={`background:linear-gradient(120deg,${featured.from}22,${featured.to}33)`}>
            <div class="w-20 h-20 rounded-2xl grid place-items-center text-5xl shadow-card shrink-0" style={`background:linear-gradient(135deg,${featured.from},${featured.to})`}>
              {featured.icon}
            </div>
            <div class="min-w-0 flex-1">
              <p class="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">Featured game</p>
              <p class="text-lg font-semibold">{featured.name}</p>
              <p class="text-xs text-gray-600 dark:text-gray-300 mt-0.5">{featured.tagline}</p>
            </div>
            {#if isInstalled($arcade, featured.id)}
              <button class="btn btn-primary shrink-0" on:click={() => (playing = featured.id)}>▶ Play</button>
            {:else}
              <button class="btn btn-primary shrink-0" disabled={!!installingId} on:click={() => startInstall(featured.id)}>
                {installingId === featured.id ? `Installing ${Math.round(progress)}%` : "Install"}
              </button>
            {/if}
          </div>
        </div>
      {/if}

      <!-- Category chips -->
      <div class="flex flex-wrap gap-2 mb-4">
        {#each CATEGORIES as c (c)}
          <button
            class="chip cursor-pointer border border-gray-200 dark:border-gray-600
              {filter === c ? 'bg-docs text-white border-docs' : 'bg-transparent text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'}"
            on:click={() => (filter = c)}
          >{c}</button>
        {/each}
      </div>

      <!-- Game grid -->
      <div class="grid gap-4" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">
        {#each visible as g (g.id)}
          <div class="card glass overflow-hidden flex flex-col hover:shadow-modal transition-transform hover:-translate-y-0.5">
            <div class="h-24 grid place-items-center text-4xl relative" style={`background:linear-gradient(135deg,${g.from}33,${g.to}44)`}>
              <div class="w-14 h-14 rounded-xl grid place-items-center text-3xl shadow-card" style={`background:linear-gradient(135deg,${g.from},${g.to})`}>
                {g.icon}
              </div>
              <span class="absolute top-2 right-2 text-[11px] text-amber-500" title={`${g.rating} out of 5`}>{stars(g.rating)}</span>
            </div>
            <div class="p-3 flex-1 flex flex-col">
              <p class="text-sm font-medium">{g.name}</p>
              <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5 flex-1 leading-snug">{g.tagline}</p>
              <p class="text-[10px] text-gray-400 mt-1.5">{g.category} · {g.controls}</p>
              <div class="flex gap-2 mt-3">
                {#if isInstalled($arcade, g.id)}
                  <button class="btn btn-primary text-xs flex-1" on:click={() => (playing = g.id)}>▶ Play{bestScore($arcade, g.id) ? ` · ${bestScore($arcade, g.id)}` : ""}</button>
                  <button class="btn btn-ghost text-xs border border-gray-300 dark:border-gray-600 !px-2" title="Uninstall" on:click={() => uninstallGame(g.id)}>🗑</button>
                {:else if installingId === g.id}
                  <div class="flex-1">
                    <div class="h-1.5 rounded-full bg-gray-200 dark:bg-gray-700 overflow-hidden">
                      <div class="h-full bg-docs rounded-full transition-all" style={`width:${progress}%`}></div>
                    </div>
                    <p class="text-[10px] text-gray-400 mt-1 text-center">Installing… {Math.round(progress)}%</p>
                  </div>
                {:else}
                  <button class="btn btn-primary text-xs flex-1" disabled={!!installingId} on:click={() => startInstall(g.id)}>⬇ Install</button>
                {/if}
              </div>
            </div>
          </div>
        {/each}
      </div>

      <p class="text-center text-[11px] text-gray-400 mt-6">
        More games arrive with updates — Talia checks for new releases automatically.
      </p>
    </div>
  {/if}
</div>
