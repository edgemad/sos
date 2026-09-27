<script lang="ts">
  // Forms: editor, preview and response tally.
  import { openFile, updateContent, fileMetas, createFile, openInEditor, trashFile } from "../../lib/state";
  import { uid } from "../../lib/utils";
  import type { FormDoc, FormQuestion, FormQuestionType, FormResponse } from "../../types";

  $: file = $openFile;
  $: form = file && file.kind === "form" ? (file.content as FormDoc & { responses: FormResponse[] }) : null;

  let mode: "editor" | "preview" | "responses" = "editor";
  let draft: Record<string, string | string[] | number> = {};

  function inputText(e: Event): string {
    return (e.currentTarget as HTMLInputElement).value;
  }

  function setMode(m: string): void {
    mode = m as typeof mode;
  }

  function answerString(q: FormQuestion): string {
    const v = draft[q.id];
    return typeof v === "string" ? v : "";
  }

  function setAnswer(q: FormQuestion, v: string): void {
    draft[q.id] = v;
    draft = draft;
  }

  function answerNumber(q: FormQuestion): number | undefined {
    const v = draft[q.id];
    return typeof v === "number" ? v : undefined;
  }

  function setAnswerNum(q: FormQuestion, v: string): void {
    draft[q.id] = parseInt(v, 10);
    draft = draft;
  }

  function checkedOptions(q: FormQuestion): string[] {
    const v = draft[q.id];
    return Array.isArray(v) ? v : [];
  }

  function toggleCheckbox(q: FormQuestion, opt: string, checked: boolean): void {
    const cur = checkedOptions(q);
    draft[q.id] = checked ? [...cur, opt] : cur.filter((o) => o !== opt);
    draft = draft;
  }

  function checkboxChecked(e: Event): boolean {
    return (e.currentTarget as HTMLInputElement).checked;
  }

  function questionType(e: Event): FormQuestionType {
    return (e.currentTarget as HTMLSelectElement).value as FormQuestionType;
  }

  function addQuestionOfType(t: string): void {
    addQuestion(t as FormQuestionType);
  }

  function save(next: FormDoc & { responses: FormResponse[] }): void {
    if (!file) return;
    updateContent(file.id, next);
  }

  function addQuestion(type: FormQuestionType): void {
    if (!form) return;
    const q: FormQuestion = {
      id: uid(),
      type,
      prompt: type === "scale" ? "Rate from 1 to 5" : "Your question",
      required: false,
      options: type === "choice" || type === "checkbox" ? ["Option 1", "Option 2"] : []
    };
    save({ ...form, questions: [...form.questions, q] });
  }

  function updateQuestion(id: string, patch: Partial<FormQuestion>): void {
    if (!form) return;
    save({ ...form, questions: form.questions.map((q) => (q.id === id ? { ...q, ...patch } : q)) });
  }

  function removeQuestion(id: string): void {
    if (!form) return;
    save({ ...form, questions: form.questions.filter((q) => q.id !== id) });
  }

  function moveQuestion(i: number, dir: -1 | 1): void {
    if (!form) return;
    const j = i + dir;
    if (j < 0 || j >= form.questions.length) return;
    const qs = [...form.questions];
    [qs[i], qs[j]] = [qs[j], qs[i]];
    save({ ...form, questions: qs });
  }

  function submit(): void {
    if (!form) return;
    const resp: FormResponse = { submittedAt: Date.now(), answers: draft };
    save({ ...form, responses: [...(form.responses ?? []), resp] });
    draft = {};
    mode = "responses";
  }

  const typeLabels: Record<FormQuestionType, string> = {
    short: "Short answer",
    long: "Paragraph",
    choice: "Multiple choice",
    checkbox: "Checkboxes",
    scale: "Linear scale 1–5"
  };

  // ── List view when no form is open ─────────────────────────────

  $: forms = $fileMetas.filter((f) => f.kind === "form" && !f.trashed).sort((a, b) => b.updatedAt - a.updatedAt);
</script>

<div class="flex-1 overflow-y-auto">
  {#if !form}
    <!-- Forms landing: list of forms + create -->
    <div class="max-w-[760px] mx-auto p-6">
      <div class="flex items-center justify-between mb-4">
        <h1 class="text-xl font-medium">Forms</h1>
        <button class="btn btn-primary" on:click={() => createFile("form")}>＋ Blank form</button>
      </div>
      {#if forms.length === 0}
        <div class="text-center py-16 text-gray-400">
          <p class="text-4xl mb-2">📝</p>
          <p class="text-sm">No forms yet. Create one to get started.</p>
        </div>
      {:else}
        <div class="card divide-y divide-gray-200 dark:divide-gray-700">
          {#each forms as f (f.id)}
            <div class="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700/40">
              <span class="text-xl">📝</span>
              <button class="flex-1 text-left min-w-0" on:click={() => openInEditor(f.id)}>
                <p class="text-sm font-medium truncate">{f.name}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400">
                  Updated {new Date(f.updatedAt).toLocaleDateString()}
                </p>
              </button>
              <button class="btn btn-ghost !px-2 text-sm" title="Trash" on:click={() => trashFile(f.id)}>🗑️</button>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  {:else}
    <!-- Form editor -->
    <div class="max-w-[760px] mx-auto p-6 w-full">
      <div class="flex gap-1 mb-4">
        {#each ["editor", "preview", "responses"] as m (m)}
          <button
            class="btn {mode === m ? 'btn-primary' : 'btn-ghost'}"
            on:click={() => setMode(m)}
          >
            {m === "editor" ? "✏️ Editor" : m === "preview" ? "👁 Preview" : "📊 Responses"}
          </button>
        {/each}
      </div>

      {#if mode === "editor"}
        <div class="card p-5 mb-4">
          <input
            class="w-full text-xl font-medium bg-transparent outline-none border-b border-transparent focus:border-docs pb-1"
            value={form.title}
            on:input={(e) => save({ ...form, title: inputText(e) })}
            placeholder="Form title"
          />
          <input
            class="w-full mt-2 text-sm bg-transparent outline-none"
            value={form.description}
            on:input={(e) => save({ ...form, description: inputText(e) })}
            placeholder="Form description"
          />
        </div>

        {#each form.questions as q, i (q.id)}
          <div class="card p-4 mb-3">
            <div class="flex items-start gap-2">
              <input
                class="flex-1 text-sm font-medium bg-transparent outline-none border-b border-transparent focus:border-gray-300"
                value={q.prompt}
                on:input={(e) => updateQuestion(q.id, { prompt: inputText(e) })}
              />
              <select
                class="input !h-7 text-xs"
                value={q.type}
                on:change={(e) => updateQuestion(q.id, { type: questionType(e) })}
              >
                {#each Object.entries(typeLabels) as [t, label] (t)}
                  <option value={t}>{label}</option>
                {/each}
              </select>
            </div>

            {#if q.type === "choice" || q.type === "checkbox"}
              <div class="mt-2 space-y-1.5">
                {#each q.options as opt, oi (oi)}
                  <div class="flex items-center gap-2">
                    <span class="text-gray-400">{q.type === "choice" ? "○" : "☐"}</span>
                    <input
                      class="flex-1 text-sm bg-transparent outline-none border-b border-dotted border-gray-300"
                      value={opt}
                      on:input={(e) => {
                        const options = [...q.options];
                        options[oi] = inputText(e);
                        updateQuestion(q.id, { options });
                      }}
                    />
                    <button class="btn btn-ghost !px-1 text-xs" title="Remove option"
                      on:click={() => updateQuestion(q.id, { options: q.options.filter((_, k) => k !== oi) })}
                    >✕</button>
                  </div>
                {/each}
                <button class="btn btn-ghost text-xs" on:click={() => updateQuestion(q.id, { options: [...q.options, `Option ${q.options.length + 1}`] })}>
                  ＋ Add option
                </button>
              </div>
            {:else if q.type === "scale"}
              <div class="mt-2 flex items-center gap-2 text-xs text-gray-500">
                <span>1</span>
                <span class="flex gap-1">{#each Array(5) as _, k}<span class="w-4 h-4 rounded-full border border-gray-300 inline-block" />{/each}</span>
                <span>5</span>
              </div>
            {:else}
              <div class="mt-2 text-sm text-gray-400 border-b border-dotted border-gray-300 w-1/2 pb-1">
                {q.type === "long" ? "Long answer text" : "Short answer text"}
              </div>
            {/if}

            <div class="flex items-center gap-2 mt-3 pt-2 border-t border-gray-100 dark:border-gray-700">
              <label class="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
                <input type="checkbox" checked={q.required} on:change={(e) => updateQuestion(q.id, { required: checkboxChecked(e) })} />
                Required
              </label>
              <span class="flex-1" />
              <button class="btn btn-ghost !px-1.5 text-xs" title="Move up" disabled={i === 0} on:click={() => moveQuestion(i, -1)}>↑</button>
              <button class="btn btn-ghost !px-1.5 text-xs" title="Move down" disabled={i === form.questions.length - 1} on:click={() => moveQuestion(i, 1)}>↓</button>
              <button class="btn btn-ghost !px-1.5 text-xs" title="Delete" on:click={() => removeQuestion(q.id)}>🗑</button>
            </div>
          </div>
        {/each}

        <div class="flex gap-1.5 flex-wrap">
          {#each Object.entries(typeLabels) as [t, label] (t)}
            <button class="btn btn-ghost border border-dashed border-gray-300 dark:border-gray-600 text-xs" on:click={() => addQuestionOfType(t)}>
              ＋ {label}
            </button>
          {/each}
        </div>
      {:else if mode === "preview"}
        <div class="card p-6">
          <h2 class="text-xl font-medium">{form.title}</h2>
          {#if form.description}<p class="text-sm text-gray-500 mt-1">{form.description}</p>{/if}

          {#each form.questions as q (q.id)}
            <div class="mt-5">
              <p class="text-sm font-medium">
                {q.prompt}
                {#if q.required}<span class="text-red-500">*</span>{/if}
              </p>
              {#if q.type === "short"}
                <input class="input w-full mt-2" placeholder="Your answer" value={answerString(q)} on:input={(e) => setAnswer(q, inputText(e))} />
              {:else if q.type === "long"}
                <textarea class="input w-full mt-2 !h-24" placeholder="Your answer" value={answerString(q)} on:input={(e) => setAnswer(q, inputText(e))} />
              {:else if q.type === "choice"}
                {#each q.options as opt (opt)}
                  <label class="flex items-center gap-2 mt-1.5 text-sm cursor-pointer">
                    <input type="radio" name={q.id} value={opt} checked={answerString(q) === opt} on:change={() => setAnswer(q, opt)} />
                    {opt}
                  </label>
                {/each}
              {:else if q.type === "checkbox"}
                {#each q.options as opt (opt)}
                  <label class="flex items-center gap-2 mt-1.5 text-sm cursor-pointer">
                    <input
                      type="checkbox"
                      checked={checkedOptions(q).includes(opt)}
                      on:change={(e) => toggleCheckbox(q, opt, checkboxChecked(e))}
                    />
                    {opt}
                  </label>
                {/each}
              {:else if q.type === "scale"}
                <div class="flex gap-3 mt-2">
                  {#each [1, 2, 3, 4, 5] as v (v)}
                    <label class="flex flex-col items-center text-xs cursor-pointer">
                      <input type="radio" name={q.id} value={v} checked={answerNumber(q) === v} on:change={() => setAnswerNum(q, String(v))} />
                      {v}
                    </label>
                  {/each}
                </div>
              {/if}
            </div>
          {/each}

          <button class="btn btn-primary mt-6" on:click={submit}>Submit</button>
        </div>
      {:else}
        <!-- Responses -->
        <div class="card p-5 mb-4">
          <p class="text-3xl font-medium">{form.responses?.length ?? 0}</p>
          <p class="text-sm text-gray-500">responses</p>
        </div>

        {#each form.questions as q (q.id)}
          {@const answers = (form.responses ?? []).map((r) => r.answers[q.id]).filter((a) => a !== undefined)}
          <div class="card p-4 mb-3">
            <p class="text-sm font-medium mb-2">{q.prompt}</p>
            {#if q.type === "choice" || q.type === "scale"}
              {#each q.type === "scale" ? ["1", "2", "3", "4", "5"] : q.options as opt (opt)}
                {@const n = answers.filter((a) => String(a) === String(opt)).length}
                <div class="flex items-center gap-2 text-sm mb-1">
                  <span class="w-40 truncate">{opt}</span>
                  <div class="flex-1 h-2 bg-gray-100 dark:bg-gray-700 rounded overflow-hidden">
                    <div class="h-full bg-forms" style={`width:${answers.length ? (n / answers.length) * 100 : 0}%`} />
                  </div>
                  <span class="text-xs text-gray-500 w-8 text-right">{n}</span>
                </div>
              {/each}
            {:else}
              {#each answers.slice(0, 8) as a, i (i)}
                <p class="text-sm text-gray-600 dark:text-gray-300 border-b border-gray-100 dark:border-gray-700 py-1">
                  {Array.isArray(a) ? a.join(", ") : String(a)}
                </p>
              {/each}
              {#if answers.length === 0}
                <p class="text-xs text-gray-400">No answers yet</p>
              {/if}
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  {/if}
</div>
