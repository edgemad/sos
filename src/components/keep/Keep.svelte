<script lang="ts">
  // Keep: pinboard of colored notes with checklists.
  import { state, addNote, updateNote, deleteNote } from "../../lib/state";
  import type { Note } from "../../types";

  let query = "";
  let newNoteColor = "#fff475";

  const colors = ["#fff475", "#aecbfa", "#d7aefb", "#fcc2b7", "#ccff90", "#e8eaed", "#fbbc04"];

  $: notes = ($state.notes as Note[])
    .filter((n) => !query || n.text.toLowerCase().includes(query.toLowerCase()))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.updatedAt - a.updatedAt);

  function toggleChecklistItem(n: Note, itemId: string): void {
    updateNote(n.id, {
      checklist: n.checklist.map((c) => (c.id === itemId ? { ...c, done: !c.done } : c))
    });
  }

  function addItem(n: Note): void {
    updateNote(n.id, {
      checklist: [...n.checklist, { id: Math.random().toString(36).slice(2), text: "", done: false }]
    });
  }

  function setItemText(n: Note, itemId: string, text: string): void {
    updateNote(n.id, {
      checklist: n.checklist.map((c) => (c.id === itemId ? { ...c, text } : c))
    });
  }

  function removeItem(n: Note, itemId: string): void {
    updateNote(n.id, { checklist: n.checklist.filter((c) => c.id !== itemId) });
  }

  function inputText(e: Event): string {
    return (e.currentTarget as HTMLTextAreaElement).value;
  }

  function listItemText(e: Event): string {
    return (e.currentTarget as HTMLInputElement).value;
  }
</script>

<div class="flex-1 overflow-y-auto">
  <div class="max-w-[900px] mx-auto p-6">
    <div class="flex items-center gap-2 mb-4">
      <input class="input flex-1 max-w-sm" placeholder="🔍 Search notes…" bind:value={query} />
      <span class="flex-1" />
      {#each colors as c (c)}
        <button
          class="w-6 h-6 rounded-full border border-gray-300 cursor-pointer hover:scale-110 transition-transform"
          style={`background:${c}`}
          title="New note with this color"
          on:click={() => addNote(c)}
        />
      {/each}
      <button class="btn btn-primary" on:click={() => addNote(newNoteColor)}>＋ New note</button>
    </div>

    {#if notes.length === 0}
      <div class="text-center py-16 text-gray-400">
        <p class="text-4xl mb-2">🗒️</p>
        <p class="text-sm">Notes you add appear here — all stored locally.</p>
      </div>
    {:else}
      <div class="grid gap-3" style="grid-template-columns:repeat(auto-fill,minmax(220px,1fr)); align-items:start">
        {#each notes as n (n.id)}
          <div class="card p-3 rounded-lg" style={`background:${n.color}`}>
            <div class="flex items-start justify-between gap-1">
              <textarea
                class="flex-1 bg-transparent outline-none resize-none text-sm min-h-[44px]"
                placeholder="Take a note…"
                value={n.text}
                on:input={(e) => updateNote(n.id, { text: inputText(e) })}
              />
              <button
                class="text-sm opacity-50 hover:opacity-100"
                title={n.pinned ? "Unpin" : "Pin"}
                on:click={() => updateNote(n.id, { pinned: !n.pinned })}
              >{n.pinned ? "📌" : "📍"}</button>
            </div>

            {#if n.checklist.length > 0 || true}
              <div class="mt-1 space-y-1">
                {#each n.checklist as item (item.id)}
                  <div class="flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={item.done}
                      on:change={() => toggleChecklistItem(n, item.id)}
                    />
                    <input
                      class="flex-1 bg-transparent outline-none text-sm {item.done ? 'line-through opacity-60' : ''}"
                      value={item.text}
                      placeholder="List item"
                      on:input={(e) => setItemText(n, item.id, listItemText(e))}
                    />
                    <button class="text-xs opacity-50 hover:opacity-100" on:click={() => removeItem(n, item.id)}>✕</button>
                  </div>
                {/each}
                <button class="text-xs text-gray-600 dark:text-gray-800 opacity-60 hover:opacity-100 flex items-center gap-1" on:click={() => addItem(n)}>
                  ＋ List item
                </button>
              </div>
            {/if}

            <div class="flex justify-end mt-1">
              <button class="text-xs opacity-50 hover:opacity-100" title="Delete note" on:click={() => deleteNote(n.id)}>🗑</button>
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>
