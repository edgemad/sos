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
  /** Direct download for this platform's installer, when one exists. */
  assetUrl: string | null;
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

// ── Platform/asset matching (pure, unit-tested) ───────────────────────

export type SosPlatform = "darwin" | "win32" | "linux" | "android";
export type SosArch = "aarch64" | "x86_64";

export interface ReleaseAsset {
  name: string;
  url: string;
}

/** Pick the release asset that installs on the running platform.
 *  macOS: prefers the aarch64 dmg (WKWebView's UA cannot distinguish the
 *  arch, so this is the pragmatic default on modern Macs). Windows: the
 *  NSIS setup exe, falling back to the msi. Linux: AppImage, then deb.
 *  Android: the release APK. */
export function pickAssetForPlatform(
  assets: readonly ReleaseAsset[],
  platform: SosPlatform,
  arch: SosArch
): string | null {
  const first = (...res: RegExp[]): string | null => {
    for (const re of res) {
      const hit = assets.find((a) => re.test(a.name));
      if (hit) return hit.url;
    }
    return null;
  };
  switch (platform) {
    case "android":
      return first(/\.apk$/i);
    case "darwin":
      return arch === "aarch64"
        ? first(/aarch64.*\.dmg$/i, /arm64.*\.dmg$/i, /x64.*\.dmg$/i)
        : first(/x64.*\.dmg$/i, /x86_64.*\.dmg$/i, /aarch64.*\.dmg$/i);
    case "win32":
      return first(/x64.*setup\.exe$/i, /x64.*\.msi$/i, /\.exe$/i, /\.msi$/i);
    case "linux":
      return first(/amd64.*\.AppImage$/i, /amd64.*\.deb$/i, /\.AppImage$/i, /\.deb$/i, /\.rpm$/i);
  }
}

/** Coarse platform detection inside the webview. Android is checked before
 *  the Linux fallback — Android webviews UA-string as Linux otherwise. */
export function detectPlatform(ua: string = navigator.userAgent): SosPlatform {
  if (/Android/i.test(ua)) return "android";
  if (/Mac|iPhone|iPad/i.test(ua)) return "darwin";
  if (/Win/i.test(ua)) return "win32";
  return "linux";
}

/** Best-effort arch detection; defaults to x86_64 (and darwin callers fall
 *  back sensibly since the UA cannot reveal the Apple Silicon arch). */
export function detectArch(ua: string = navigator.userAgent, platform: SosPlatform = detectPlatform(ua)): SosArch {
  if (/arm|aarch64/i.test(ua)) return "aarch64";
  if (platform === "darwin" && /Chrome/i.test(ua)) return "aarch64"; // heuristic
  return "x86_64";
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
    const data = (await res.json()) as {
      tag_name?: string;
      html_url?: string;
      name?: string;
      assets?: { name?: string; browser_download_url?: string }[];
    };
    const latest = (data.tag_name ?? "").replace(/^v/, "");
    if (!latest || !isNewerVersion(APP_VERSION, latest)) return null;
    const assets = (data.assets ?? [])
      .map((a) => ({ name: a.name ?? "", url: a.browser_download_url ?? "" }))
      .filter((a) => a.name && a.url);
    const info: UpdateInfo = {
      version: latest,
      url: data.html_url ?? `https://github.com/${REPO}/releases`,
      assetUrl: pickAssetForPlatform(assets, detectPlatform(), detectArch()),
      title: data.name ?? null
    };
    updateAvailable.set(info);
    return info;
  } catch (err) {
    if (manual) throw err;
    return null;
  }
}
