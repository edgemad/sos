// Self-learning layer: Talia adapts to how you actually work. Every command
// you run is remembered on-device (frequency + recency — never synced, never
// leaves the machine) and used to rank the command palette, so the things
// you do most float to the top on their own.

import { writable } from "svelte/store";

export interface UsageEntry {
  count: number;
  last: number;
}

export type UsageMap = Record<string, UsageEntry>;

const KEY = "sos.adaptive.v1";
const MAX_ENTRIES = 300;
const HALF_LIFE_DAYS = 14;
const DAY_MS = 86_400_000;

export function loadUsage(): UsageMap {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as UsageMap) : {};
  } catch {
    return {};
  }
}

export function saveUsage(map: UsageMap): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    /* non-fatal (private mode, quota) — learning just resets next launch */
  }
}

export const usage = writable<UsageMap>(loadUsage());

/** Record one command execution and persist the updated map. */
export function recordCommand(id: string): void {
  usage.update((map) => {
    const next = bumpUsage(map, id, Date.now());
    saveUsage(next);
    return next;
  });
}

/** Add one hit for `id`, evicting the least valuable entries when oversized. */
export function bumpUsage(map: UsageMap, id: string, now: number): UsageMap {
  const prev = map[id];
  const next: UsageMap = { ...map, [id]: { count: (prev?.count ?? 0) + 1, last: now } };
  const ids = Object.keys(next);
  if (ids.length > MAX_ENTRIES) {
    const scored = ids.map((k) => [k, usageScore(next[k], now)] as const).sort((a, b) => b[1] - a[1]);
    for (const [k] of scored.slice(MAX_ENTRIES)) delete next[k];
  }
  return next;
}

/** Exponential recency decay: frequent + recent commands score highest. */
export function usageScore(entry: UsageEntry | undefined, now: number): number {
  if (!entry) return 0;
  const ageDays = Math.max(0, (now - entry.last) / DAY_MS);
  return entry.count * Math.pow(0.5, ageDays / HALF_LIFE_DAYS);
}

/** Stable rank: commands you've used, best-learned first; the rest keep
 *  their original order (so a fresh install behaves exactly as before). */
export function rankIds(map: UsageMap, ids: string[], now: number): string[] {
  return ids
    .map((id, index) => ({ id, index, score: usageScore(map[id], now) }))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((x) => x.id);
}
