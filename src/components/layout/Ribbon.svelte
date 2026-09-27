<script lang="ts">
  // Generic Office-style ribbon: tabbed function groups with big launchers,
  // dropdown menus and color palettes. Fully data-driven; modules pass their
  // own tab definitions and receive `command` events back.
  import { createEventDispatcher } from "svelte";
  import type { RibbonTab } from "../../types/ribbon";

  export let tabs: RibbonTab[] = [];
  export let accent = "#1a73e8";
  export let activeTabId: string | null = null;

  const dispatch = createEventDispatcher<{
    command: { cmd: string; payload?: string };
  }>();

  let activeTab = 0;
  let collapsed = false;
  let openMenu: string | null = null;

  $: if (activeTabId && tabs[activeTab]?.id !== activeTabId) {
    const idx = tabs.findIndex((t) => t.id === activeTabId);
    if (idx >= 0) activeTab = idx;
  }

  $: tab = tabs[activeTab] ?? tabs[0];

  function fire(cmd: string, payload?: string): void {
    dispatch("command", { cmd, payload });
    openMenu = null;
  }

  function selectTab(i: number): void {
    activeTab = i;
    openMenu = null;
  }

  function closeMenus(): void {
    openMenu = null;
  }

  function inputText(e: Event): string {
    return (e.currentTarget as HTMLInputElement).value;
  }
</script>

<svelte:window on:click={closeMenus} />

<div class="ribbon select-none border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-[#252525] shrink-0">
  <!-- Tab strip -->
  <div class="flex items-end gap-0.5 px-2 pt-1">
    {#each tabs as t, i (t.id)}
      <button
        class="px-3 h-7 text-xs font-medium rounded-t-md transition-colors cursor-pointer
          {i === activeTab
            ? 'bg-white dark:bg-[#2d2d2d] border border-b-0 border-gray-200 dark:border-gray-700'
            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700/60'}"
        style={i === activeTab ? `color:${accent}` : ""}
        on:click={() => selectTab(i)}
      >
        {t.label}
      </button>
    {/each}
    <span class="flex-1" />
    <button
      class="px-2 h-7 text-xs text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded cursor-pointer"
      title={collapsed ? "Expand ribbon" : "Collapse ribbon"}
      on:click={() => (collapsed = !collapsed)}
    >{collapsed ? "⌄" : "⌃"}</button>
  </div>

  <!-- Ribbon body -->
  {#if !collapsed && tab}
    <div class="flex items-stretch gap-0 px-2 py-1.5 bg-white dark:bg-[#2d2d2d] overflow-x-auto ribbon-body">
      {#each tab.groups as g, gi (g.id)}
        {#if gi > 0}
          <div class="w-px bg-gray-200 dark:bg-gray-700 mx-2 shrink-0" />
        {/if}
        <div class="flex flex-col items-center gap-1 shrink-0 px-1">
          <div class="flex items-start gap-1">
            {#each g.items as item (item.id)}
              {@const big = item.big === true}
              {#if item.kind === "button"}
                <button
                  class="{big
                    ? 'w-[64px] h-[52px] flex-col gap-0.5'
                    : 'h-[52px] w-9 flex-col justify-center gap-0.5'}
                    flex items-center rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                  title={item.title ?? item.label}
                  on:click={() => fire(item.id, item.value)}
                >
                  <span class="{big ? 'text-xl' : 'text-base'} leading-none">{item.icon}</span>
                  <span class="text-[9px] leading-none text-gray-500 dark:text-gray-400 {big ? '' : 'hidden'}">
                    {item.label}
                  </span>
                  {#if !big}<span class="sr-only">{item.label}</span>{/if}
                </button>
              {:else if item.kind === "menu"}
                <div class="relative h-[52px] flex items-center" on:click|stopPropagation>
                  <button
                    class="flex flex-col items-center justify-center gap-0.5 h-full w-12 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                    title={item.title ?? item.label}
                    on:click={() => (openMenu = openMenu === item.id ? null : item.id)}
                  >
                    <span class="text-base leading-none">{item.icon}</span>
                    <span class="text-[9px] leading-none text-gray-500 dark:text-gray-400">{item.label}</span>
                  </button>
                  {#if openMenu === item.id}
                    <div class="menu left-0 top-[50px] max-h-[320px] overflow-y-auto">
                      {#each item.options ?? [] as opt (opt.value)}
                        <button class="menu-item" on:click={() => fire(item.id, opt.value)}>
                          {#if opt.swatch}
                            <span class="w-3.5 h-3.5 rounded-sm border border-gray-300 shrink-0" style={`background:${opt.swatch}`} />
                          {/if}
                          {opt.label ?? opt.value}
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              {:else if item.kind === "palette"}
                <div class="relative h-[52px] flex items-center" on:click|stopPropagation>
                  <button
                    class="flex flex-col items-center justify-center gap-0.5 h-full w-12 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer"
                    title={item.title ?? item.label}
                    on:click={() => (openMenu = openMenu === item.id ? null : item.id)}
                  >
                    <span class="text-base leading-none">{item.icon}</span>
                    <span class="text-[9px] leading-none text-gray-500 dark:text-gray-400">{item.label}</span>
                  </button>
                  {#if openMenu === item.id}
                    <div class="menu left-0 top-[50px] p-2 !min-w-0">
                      <div class="grid grid-cols-3 gap-1.5">
                        {#each item.options ?? [] as opt (opt.value)}
                          <button
                            class="w-7 h-7 rounded border border-gray-300 hover:scale-110 transition-transform"
                            style={`background:${opt.swatch ?? opt.value}`}
                            title={opt.label ?? opt.value}
                            on:click={() => fire(item.id, opt.value)}
                          />
                        {/each}
                      </div>
                    </div>
                  {/if}
                </div>
              {:else if item.kind === "input"}
                <div class="h-[52px] flex flex-col justify-center gap-1 px-1">
                  <span class="text-[9px] leading-none text-gray-500 dark:text-gray-400">{item.label}</span>
                  <input
                    class="input !h-6 !w-28 text-xs font-mono"
                    placeholder={item.placeholder ?? ""}
                    value={item.value ?? ""}
                    on:keydown={(e) => {
                      if (e.key === "Enter") fire(item.id, inputText(e));
                    }}
                  />
                </div>
              {/if}
            {/each}
          </div>
          <span class="text-[10px] text-gray-400 dark:text-gray-500 leading-none">{g.label}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .ribbon-body {
    scrollbar-width: thin;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
  }
</style>
