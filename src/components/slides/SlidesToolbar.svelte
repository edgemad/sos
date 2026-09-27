<script lang="ts">
  // Slides toolbar mirroring Google Slides. Emits cmd events.
  
  interface CmdDetail { cmd: string; payload?: string }
  // Callback prop (robust across Svelte HMR; replaces createEventDispatcher)
  export let onCmd: (detail: { cmd: string; payload?: string }) => void = () => {};


  export let zoom = 100;
  export let transition: string | null = null;

  let openMenu: string | null = null;

  const textColors = ["#202124","#434343","#666666","#999999","#ffffff","#980000","#ff0000","#ff9900","#ffff00","#00ff00","#00ffff","#4a86e8","#0000ff","#9900ff","#ff00ff"];
  const fills = ["#ffffff","#fff2cc","#fce8e6","#e6f4ea","#e8f0fe","#f3e8fd","#fef7e0","#f1f3f4","#d9ead3","#cfe2f3"];

  function fire(cmd: string, payload?: string): void {
    onCmd({ cmd, payload });
    window.dispatchEvent(new CustomEvent("sos-cmd-slides", { detail: { cmd, payload } }));
    openMenu = null;
  }

  function inputText(e: Event): string {
    return (e.currentTarget as HTMLInputElement).value;
  }

  const transitions: { value: string; label: string }[] = [
    { value: "none", label: "None" },
    { value: "fade", label: "Fade" },
    { value: "slide", label: "Slide" },
    { value: "zoom", label: "Zoom" },
    { value: "flip", label: "Flip" }
  ];
</script>

<svelte:window on:click={() => (openMenu = null)} />

<div class="relative z-20 flex items-center gap-0.5 px-2 h-10 overflow-x-auto bg-gray-50 dark:bg-[#2d2d2d] border-b border-gray-200 dark:border-gray-700 select-none">
  <button class="tb" title="Search" on:click={() => fire("edit:find")}>🔍</button>
  <button class="tb" title="Insert new block" on:click={() => fire("block:text")}>＋</button>
  <button class="tb" title="Duplicate" on:click={() => fire("edit:duplicate")}>⧉</button>
  <span class="tbsep" />
  <button class="tb" title="Undo (⌘Z)" on:click={() => fire("undo")}>↺</button>
  <button class="tb" title="Redo (⌘Y)" on:click={() => fire("redo")}>↻</button>
  <button class="tb" title="Print (⌘P)" on:click={() => fire("file:print")}>🖨</button>
  <button class="tb" title="Paint format" on:click={() => fire("paint")}>🖌</button>
  <span class="tbsep" />

  <div class="relative" on:click|stopPropagation>
    <button class="tb w-[64px] justify-center gap-1" title="Zoom" on:click={() => (openMenu = openMenu === "zoom" ? null : "zoom")}>
      {zoom}% <span class="text-[9px]">▼</span>
    </button>
    {#if openMenu === "zoom"}
      <div class="menu left-0 top-[38px] min-w-[90px]">
        {#each [50, 75, 90, 100, 125, 150, 200] as z (z)}
          <button class="menu-item" on:click={() => fire("zoom", String(z))}>{z}%</button>
        {/each}
        <button class="menu-item" on:click={() => fire("view:zoom-fit")}>Fit</button>
      </div>
    {/if}
  </div>
  <span class="tbsep" />

  <button class="tb" title="Select" on:click={() => fire("mode:select")}>↖</button>
  <button class="tb" title="Text box" on:click={() => fire("block:text")}>Tt</button>
  <button class="tb" title="Shape" on:click={() => fire("block:shape")}>◯</button>
  <button class="tb" title="Line" on:click={() => fire("block:line")}>╱</button>
  <div class="relative" on:click|stopPropagation>
    <button class="tb" title="Link (⌘K)" on:click={() => (openMenu = openMenu === "link" ? null : "link")}>🔗</button>
    {#if openMenu === "link"}
      <div class="menu left-0 top-[38px] min-w-[220px] p-2 flex gap-1">
        <input class="input flex-1" placeholder="https://…" on:keydown={(e) => { if (e.key === "Enter") fire("link", inputText(e)); }} />
        <button class="btn btn-primary !h-7" on:click={() => {
          const inp = document.querySelector<HTMLInputElement>("div.relative input.input");
          if (inp) fire("link", inp.value);
        }}>Apply</button>
      </div>
    {/if}
  </div>
  <span class="tbsep" />

  <div class="relative" on:click|stopPropagation>
    <button class="tb !px-2.5 justify-center" title="Slide background" on:click={() => (openMenu = openMenu === "bg" ? null : "bg")}>Background</button>
    {#if openMenu === "bg"}
      <div class="menu left-0 top-[38px] p-2 grid grid-cols-5 gap-1.5 w-[190px]">
        {#each fills as c (c)}
          <button class="w-7 h-7 rounded border border-gray-300 cursor-pointer" style="background:{c}" title={c} on:click={() => fire("bg", c)} />
        {/each}
      </div>
    {/if}
  </div>

  <div class="relative" on:click|stopPropagation>
    <button class="tb !px-2.5 justify-center" title="Apply a layout" on:click={() => (openMenu = openMenu === "layout" ? null : "layout")}>Layout</button>
    {#if openMenu === "layout"}
      <div class="menu left-0 top-[38px] min-w-[170px]">
        <button class="menu-item" on:click={() => fire("layout", "title")}>Title slide</button>
        <button class="menu-item" on:click={() => fire("layout", "titleBody")}>Title + body</button>
        <button class="menu-item" on:click={() => fire("layout", "section")}>Section header</button>
        <button class="menu-item" on:click={() => fire("layout", "twoColumn")}>Two columns</button>
        <button class="menu-item" on:click={() => fire("layout", "blank")}>Blank</button>
      </div>
    {/if}
  </div>

  <div class="relative" on:click|stopPropagation>
    <button class="tb !px-2.5 justify-center" title="Change theme" on:click={() => (openMenu = openMenu === "theme" ? null : "theme")}>Theme</button>
    {#if openMenu === "theme"}
      <div class="menu left-0 top-[38px] min-w-[170px]">
        <button class="menu-item" on:click={() => fire("theme", "simple")}>Simple Light</button>
        <button class="menu-item" on:click={() => fire("theme", "bold")}>Bold Red</button>
        <button class="menu-item" on:click={() => fire("theme", "sleek")}>Sleek Dark</button>
        <button class="menu-item" on:click={() => fire("theme", "forest")}>Forest</button>
        <button class="menu-item" on:click={() => fire("theme", "sunset")}>Sunset</button>
      </div>
    {/if}
  </div>

  <div class="relative" on:click|stopPropagation>
    <button class="tb !px-2.5 justify-center gap-1" title="Transition" on:click={() => (openMenu = openMenu === "trans" ? null : "trans")}>
      Transition{transition && transition !== "none" ? " ·" : ""}
    </button>
    {#if openMenu === "trans"}
      <div class="menu left-0 top-[38px] min-w-[130px]">
        {#each transitions as t (t.value)}
          <button class="menu-item" on:click={() => fire("transition", t.value)}>{t.label}</button>
        {/each}
      </div>
    {/if}
  </div>
  <span class="tbsep" />

  <button class="tb font-bold" title="Present (▶)" on:click={() => fire("present")}>▶</button>
  <span class="flex-1" />
</div>
