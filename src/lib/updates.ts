// Self-update: Talia checks GitHub Releases for a newer version of the suite
// on her own (quietly, a few times a day) and can run a manual check from the
// Help menu. When an update exists she announces it and deep-links the
// download. Everything else about installing stays in your hands.

import { writable } from "svelte/store";
import { version as APP_VERSION } from "../../package.json";

export { APP_VERSION };

const REPO = "edgemad/sos";

export interface UpdateInfo {
  version: string;
  url: string;
  title: string | null;
}

/** Latest known update, or null when up to date / never checked. */
export const updateAvailable = writable<UpdateInfo | null>(null);

/** Strict numeric semver compare of the first three components. Prerelease
 *  suffixes ("1.5.0-beta.1") compare as their base version. */
export function isNewerVersion(current: string, latest: string): boolean {
  const parse = (v: string): number[] =>
    v
      .trim()
      .replace(/^v/i, "")
      .split(".")
      .slice(0, 3)
      .map((p) => parseInt(p.split("-")[0], 10) || 0);
  const cur = parse(current);
  const lat = parse(latest);
  for (let i = 0; i < 3; i++) {
    if ((lat[i] ?? 0) > (cur[i] ?? 0)) return true;
    if ((lat[i] ?? 0) < (cur[i] ?? 0)) return false;
  }
  return false;
}

/** Query the GitHub Releases API for the latest published release.
 *  - Background checks (`manual: false`) fail silently (offline, rate limit).
 *  - Manual checks rethrow so the caller can explain what went wrong. */
export async function checkForUpdates(manual = false): Promise<UpdateInfo | null> {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { Accept: "application/vnd.github+json" }
    });
    if (res.status === 404) return null; // no published releases yet
    if (!res.ok) throw new Error(`GitHub API returned ${res.status}`);
    const data = (await res.json()) as { tag_name?: string; html_url?: string; name?: string };
    const latest = (data.tag_name ?? "").replace(/^v/, "");
    if (!latest || !isNewerVersion(APP_VERSION, latest)) return null;
    const info: UpdateInfo = {
      version: latest,
      url: data.html_url ?? `https://github.com/${REPO}/releases`,
      title: data.name ?? null
    };
    updateAvailable.set(info);
    return info;
  } catch (err) {
    if (manual) throw err;
    return null;
  }
}
