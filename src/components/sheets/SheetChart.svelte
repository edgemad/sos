<script lang="ts">
  // Pure-SVG chart renderer used by the ChartModal preview and the floating
  // chart cards on the Sheets grid. No chart library — deterministic output.
  export let kind: "bar" | "line" | "pie" = "bar";
  export let labels: string[] = [];
  export let series: { name: string; color: string; values: number[] }[] = [];
  export let w = 320;
  export let h = 230;
  export let title = "";

  const PAD = { l: 38, r: 10, t: title ? 22 : 10, b: 26 };

  $: plotW = Math.max(10, w - PAD.l - PAD.r);
  $: plotH = Math.max(10, h - PAD.t - PAD.b);
  $: n = labels.length;
  $: allVals = series.flatMap((s) => s.values).filter((v) => Number.isFinite(v));
  $: maxV = Math.max(1, ...allVals);
  $: minV = Math.min(0, ...allVals);

  function yScale(v: number): number {
    return PAD.t + plotH - ((v - minV) / (maxV - minV || 1)) * plotH;
  }

  $: xStep = n ? plotW / n : plotW;
  $: barGroupW = n ? (xStep * 0.7) / Math.max(1, series.length) : 0;

  $: gridLines = [0, 0.25, 0.5, 0.75, 1].map((f) => ({
    y: yScale(minV + (maxV - minV) * f),
    label: formatTick(minV + (maxV - minV) * f)
  }));

  function formatTick(v: number): string {
    const av = Math.abs(v);
    if (av >= 1000) return `${Math.round(v / 100) / 10}k`;
    if (av >= 10) return String(Math.round(v));
    return String(Math.round(v * 100) / 100);
  }

  function labelEvery(): number {
    return Math.max(1, Math.ceil(n / Math.max(3, Math.floor(plotW / 64))));
  }

  function linePoints(values: number[]): string {
    return values.map((v, i) => `${PAD.l + xStep * (i + 0.5)},${yScale(v)}`).join(" ");
  }

  // ── Pie geometry ────────────────────────────────────────────────
  $: pieValues = series[0]?.values ?? [];
  $: pieTotal = pieValues.reduce((a, b) => a + Math.max(0, b), 0);
  $: pieR = Math.min(plotW, plotH) / 2 - 6;
  $: pieCx = PAD.l + plotW / 2;
  $: pieCy = PAD.t + plotH / 2;

  interface Arc {
    d: string;
    color: string;
  }

  $: pieArcs = buildPie(pieValues, series[0]?.color ?? "#4285f4");
  $: pieLabels = pieValues.map((v, i) => ({
    text: `${labels[i] ?? ""} ${pieTotal ? Math.round((Math.max(0, v) / pieTotal) * 100) : 0}%`,
    color: seriesColor(i)
  }));

  function seriesColor(i: number): string {
    return series[i]?.color ?? PALETTE[i % PALETTE.length];
  }

  const PALETTE = ["#4285f4", "#ea4335", "#fbbc05", "#34a853", "#a142f4", "#24c1e0", "#ff6d01", "#795548"];

  function buildPie(values: number[], firstColor: string): Arc[] {
    const arcs: Arc[] = [];
    let angle = -Math.PI / 2;
    const total = values.reduce((a, b) => a + Math.max(0, b), 0);
    if (total <= 0) return arcs;
    values.forEach((v, i) => {
      const share = Math.max(0, v) / total;
      if (share <= 0) return;
      const sweep = share * Math.PI * 2;
      const large = sweep > Math.PI ? 1 : 0;
      const x0 = pieCx + pieR * Math.cos(angle);
      const y0 = pieCy + pieR * Math.sin(angle);
      angle += sweep;
      const x1 = pieCx + pieR * Math.cos(angle);
      const y1 = pieCy + pieR * Math.sin(angle);
      if (share >= 0.9999) {
        arcs.push({ d: `M ${pieCx - pieR} ${pieCy} A ${pieR} ${pieR} 0 1 1 ${pieCx + pieR} ${pieCy} A ${pieR} ${pieR} 0 1 1 ${pieCx - pieR} ${pieCy}`, color: firstColor });
        return;
      }
      arcs.push({ d: `M ${pieCx} ${pieCy} L ${x0} ${y0} A ${pieR} ${pieR} 0 ${large} 1 ${x1} ${y1} Z`, color: firstColor });
    });
    return arcs;
  }

  // For pies the color comes from the palette per slice, not per series.
  $: patchedPieArcs = pieArcs.map((a, i) => ({ ...a, color: PALETTE[i % PALETTE.length] }));
</script>

<svg viewBox={`0 0 ${w} ${h}`} class="w-full h-full" role="img" aria-label={title || "Chart"}>
  {#if title}
    <text x={w / 2} y={14} text-anchor="middle" class="fill-gray-700 dark:fill-gray-200" style="font-size:11px;font-weight:600">{title}</text>
  {/if}

  {#if kind === "pie"}
    {#if patchedPieArcs.length === 0}
      <text x={w / 2} y={h / 2} text-anchor="middle" style="font-size:10px" class="fill-gray-400">No numeric data</text>
    {:else}
      {#each patchedPieArcs as a, i (i)}
        <path d={a.d} fill={a.color} opacity="0.9" />
      {/each}
      {#each pieLabels.slice(0, 8) as pl, i (i)}
        <rect x={8} y={h - 12 - (pieLabels.length - i) * 12} width="7" height="7" rx="1.5" fill={pl.color} />
        <text x={19} y={h - 6 - (pieLabels.length - i) * 12} style="font-size:8.5px" class="fill-gray-600 dark:fill-gray-300">{pl.text}</text>
      {/each}
    {/if}
  {:else}
    <!-- axes -->
    <line x1={PAD.l} y1={PAD.t} x2={PAD.l} y2={PAD.t + plotH} class="stroke-gray-300 dark:stroke-gray-600" stroke-width="1" />
    <line x1={PAD.l} y1={PAD.t + plotH} x2={PAD.l + plotW} y2={PAD.t + plotH} class="stroke-gray-300 dark:stroke-gray-600" stroke-width="1" />
    {#each gridLines as g, i (i)}
      <line x1={PAD.l} y1={g.y} x2={PAD.l + plotW} y2={g.y} class="stroke-gray-200 dark:stroke-gray-700" stroke-width="1" stroke-dasharray="2,3" />
      <text x={PAD.l - 4} y={g.y + 3} text-anchor="end" style="font-size:8px" class="fill-gray-400">{g.label}</text>
    {/each}

    {#if n === 0 || series.length === 0}
      <text x={w / 2} y={h / 2} text-anchor="middle" style="font-size:10px" class="fill-gray-400">No numeric data</text>
    {:else if kind === "bar"}
      {#each labels as lab, i (i)}
        {#each series as s, si (si)}
          {@const v = Number.isFinite(s.values[i]) ? s.values[i] : 0}
          {@const bw = Math.max(2, barGroupW - 2)}
          {@const x = PAD.l + xStep * i + xStep * 0.15 + si * barGroupW}
          <rect x={x} y={Math.min(yScale(v), yScale(0))} width={bw} height={Math.max(1, Math.abs(yScale(v) - yScale(0)))} fill={s.color} rx="1.5" opacity="0.9" />
        {/each}
        {#if i % labelEvery() === 0}
          <text x={PAD.l + xStep * (i + 0.5)} y={h - 10} text-anchor="middle" style="font-size:8.5px" class="fill-gray-500 dark:fill-gray-400">{lab.length > 8 ? `${lab.slice(0, 7)}…` : lab}</text>
        {/if}
      {/each}
    {:else}
      {#each series as s, si (si)}
        <polyline points={linePoints(s.values)} fill="none" stroke={s.color} stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
        {#each s.values as v, i (i)}
          <circle cx={PAD.l + xStep * (i + 0.5)} cy={yScale(v)} r="2.5" fill={s.color} />
        {/each}
      {/each}
      {#each labels as lab, i (i)}
        {#if i % labelEvery() === 0}
          <text x={PAD.l + xStep * (i + 0.5)} y={h - 10} text-anchor="middle" style="font-size:8.5px" class="fill-gray-500 dark:fill-gray-400">{lab.length > 8 ? `${lab.slice(0, 7)}…` : lab}</text>
        {/if}
      {/each}
    {/if}

    <!-- legend (multi-series only) -->
    {#if series.length > 1}
      {#each series.slice(0, 6) as s, i (i)}
        <rect x={PAD.l + i * 70} y={PAD.t + 2} width="7" height="7" rx="1.5" fill={s.color} />
        <text x={PAD.l + 10 + i * 70} y={PAD.t + 9} style="font-size:8.5px" class="fill-gray-600 dark:fill-gray-300">{(s.name || `S${i + 1}`).slice(0, 8)}</text>
      {/each}
    {/if}
  {/if}
</svg>
