<script lang="ts">
  // Calendar: month grid with local events.
  import { state, addEvent, updateEvent, deleteEvent } from "../../lib/state";
  import type { CalendarEvent } from "../../types";

  let cursor = new Date();
  cursor = new Date(cursor.getFullYear(), cursor.getMonth(), 1);

  let selectedDate = todayStr();
  let showEditor = false;
  let editTitle = "";
  let editTime = "09:00";
  let editColor = "#1a73e8";
  let editingId: string | null = null;

  const colors = ["#1a73e8", "#0f9d58", "#f4b400", "#ea4335", "#7248b9"];
  const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  $: events = $state.events as CalendarEvent[];
  $: year = cursor.getFullYear();
  $: month = cursor.getMonth();

  $: firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
  $: daysInMonth = new Date(year, month + 1, 0).getDate();

  $: cells = buildCells(firstWeekday, daysInMonth);

  function buildCells(first: number, days: number): (number | null)[] {
    const out: (number | null)[] = [
      ...Array(first).fill(null),
      ...Array.from({ length: days }, (_, i) => i + 1)
    ];
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }

  $: monthLabel = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  function todayStr(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function dateOf(day: number | null): string {
    if (day === null) return "";
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  $: dayEvents = (day: number | null): CalendarEvent[] =>
    day === null ? [] : events.filter((e) => e.date === dateOf(day)).sort((a, b) => a.time.localeCompare(b.time));

  function openEditor(date: string): void {
    selectedDate = date;
    editingId = null;
    editTitle = "";
    editTime = "09:00";
    editColor = "#1a73e8";
    showEditor = true;
  }

  function openEdit(ev: CalendarEvent): void {
    editingId = ev.id;
    selectedDate = ev.date;
    editTitle = ev.title;
    editTime = ev.time;
    editColor = ev.color;
    showEditor = true;
  }

  function saveEvent(): void {
    if (!editTitle.trim()) return;
    if (editingId) updateEvent(editingId, { title: editTitle, time: editTime, color: editColor });
    else addEvent({ date: selectedDate, title: editTitle, time: editTime, color: editColor });
    showEditor = false;
  }

  function shiftMonth(d: number): void {
    cursor = new Date(year, month + d, 1);
  }

  function removeEditing(): void {
    if (editingId) deleteEvent(editingId);
    showEditor = false;
  }
</script>

<div class="flex-1 flex flex-col min-h-0">
  <div class="h-12 shrink-0 flex items-center gap-2 px-4 border-b border-gray-200 dark:border-gray-700">
    <button class="btn btn-ghost" on:click={() => shiftMonth(-1)}>←</button>
    <h1 class="text-lg font-medium">{monthLabel}</h1>
    <button class="btn btn-ghost" on:click={() => shiftMonth(1)}>→</button>
    <button class="btn btn-ghost text-sm" on:click={() => (cursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1))}>Today</button>
    <span class="flex-1" />
    <span class="text-xs text-gray-500">{events.length} events stored locally</span>
  </div>

  <div class="flex-1 overflow-auto p-4">
    <div class="grid grid-cols-7 gap-px bg-gray-200 dark:bg-gray-700 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 h-full min-h-[480px]">
      {#each dow as d (d)}
        <div class="bg-gray-50 dark:bg-[#252525] text-xs font-semibold text-gray-500 py-1.5 text-center">{d}</div>
      {/each}
      {#each cells as day, i (i)}
        {@const evs = dayEvents(day)}
        <div
          class="bg-white dark:bg-[#2d2d2d] min-h-[84px] p-1.5 text-xs relative group
            {day === null ? 'bg-gray-50 dark:bg-[#252525]' : ''}"
          on:click={() => day !== null && openEditor(dateOf(day))}
          role="button"
          tabindex="-1"
        >
          {#if day !== null}
            <span class="inline-grid place-items-center w-6 h-6 rounded-full text-xs {dateOf(day) === todayStr() ? 'bg-docs text-white font-bold' : ''}">
              {day}
            </span>
            <div class="mt-1 space-y-0.5">
              {#each evs.slice(0, 3) as ev (ev.id)}
                <button
                  class="block w-full text-left truncate rounded px-1.5 py-0.5 text-white hover:opacity-90"
                  style={`background:${ev.color}`}
                  title={`${ev.time} ${ev.title}`}
                  on:click|stopPropagation={() => openEdit(ev)}
                >
                  {ev.time} {ev.title}
                </button>
              {/each}
              {#if evs.length > 3}
                <button class="text-gray-500 px-1" on:click|stopPropagation={() => openEditor(dateOf(day))}>
                  +{evs.length - 3} more
                </button>
              {/if}
            </div>
            <button
              class="absolute top-1 right-1 w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-600 opacity-0 group-hover:opacity-100 text-sm grid place-items-center"
              title="Add event"
              on:click|stopPropagation={() => openEditor(dateOf(day))}
            >＋</button>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</div>

{#if showEditor}
  <div class="fixed inset-0 z-50 bg-black/40 grid place-items-center" on:click|self={() => (showEditor = false)}>
    <div class="card p-5 w-[360px] shadow-modal" on:click|stopPropagation>
      <h3 class="font-medium mb-3">
        {editingId ? "Edit event" : "New event"} · {selectedDate}
      </h3>
      <input class="input w-full mb-2" placeholder="Title" bind:value={editTitle} on:keydown={(e) => e.key === "Enter" && saveEvent()} />
      <input type="time" class="input w-full mb-2" bind:value={editTime} />
      <div class="flex gap-1.5 mb-4">
        {#each colors as c (c)}
          <button
            class="w-7 h-7 rounded-full border-2 {editColor === c ? 'border-gray-800 dark:border-white' : 'border-transparent'}"
            style={`background:${c}`}
            on:click={() => (editColor = c)}
          />
        {/each}
      </div>
      <div class="flex justify-between">
        {#if editingId}
          <button class="btn btn-ghost text-red-600" on:click={removeEditing}>Delete</button>
        {:else}
          <span />
        {/if}
        <div class="flex gap-2">
          <button class="btn btn-ghost" on:click={() => (showEditor = false)}>Cancel</button>
          <button class="btn btn-primary" on:click={saveEvent}>Save</button>
        </div>
      </div>
    </div>
  </div>
{/if}
