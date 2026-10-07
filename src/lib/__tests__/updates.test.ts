// Unit tests for the self-update layer: version comparison, per-platform
// installer picking, platform detection and the missing-release case.

import { describe, expect, it, vi } from "vitest";
import { checkForUpdates, detectArch, detectPlatform, isNewerVersion, pickAssetForPlatform } from "../updates";

const ASSETS = [
  { name: "Simple.Office.Suite_1.4.1_aarch64.dmg", url: "https://example.com/aarch64.dmg" },
  { name: "Simple.Office.Suite_1.4.1_x64.dmg", url: "https://example.com/x64.dmg" },
  { name: "Simple.Office.Suite_1.4.1_x64-setup.exe", url: "https://example.com/setup.exe" },
  { name: "Simple.Office.Suite_1.4.1_x64_en-US.msi", url: "https://example.com/x64.msi" },
  { name: "Simple.Office.Suite_1.4.1_amd64.AppImage", url: "https://example.com/AppImage" },
  { name: "Simple.Office.Suite_1.4.1_amd64.deb", url: "https://example.com/deb" },
  { name: "Simple.Office.Suite_1.4.1-1.x86_64.rpm", url: "https://example.com/rpm" },
  { name: "Simple.Office.Suite_1.4.1_aarch64.apk", url: "https://example.com/app.apk" }
];

describe("isNewerVersion", () => {
  it("detects higher versions", () => {
    expect(isNewerVersion("1.4.0", "1.4.1")).toBe(true);
    expect(isNewerVersion("1.4.0", "1.5.0")).toBe(true);
    expect(isNewerVersion("1.4.0", "2.0.0")).toBe(true);
  });

  it("rejects equal and older versions", () => {
    expect(isNewerVersion("1.4.0", "1.4.0")).toBe(false);
    expect(isNewerVersion("1.4.0", "1.3.9")).toBe(false);
    expect(isNewerVersion("1.4.0", "0.9.0")).toBe(false);
  });

  it("handles the v prefix and shorter tags", () => {
    expect(isNewerVersion("1.4.0", "v1.5")).toBe(true);
    expect(isNewerVersion("1.4.0", "v1.4")).toBe(false);
  });

  it("treats prerelease tags as their base version", () => {
    expect(isNewerVersion("1.4.0", "1.5.0-beta.1")).toBe(true);
    expect(isNewerVersion("1.5.0", "1.5.0-beta.1")).toBe(false);
  });
});

describe("pickAssetForPlatform", () => {
  it("picks the aarch64 dmg on Apple Silicon macOS", () => {
    expect(pickAssetForPlatform(ASSETS, "darwin", "aarch64")).toBe("https://example.com/aarch64.dmg");
  });

  it("picks the x64 dmg on Intel macOS", () => {
    expect(pickAssetForPlatform(ASSETS, "darwin", "x86_64")).toBe("https://example.com/x64.dmg");
  });

  it("picks the NSIS setup on Windows and AppImage on Linux", () => {
    expect(pickAssetForPlatform(ASSETS, "win32", "x86_64")).toBe("https://example.com/setup.exe");
    expect(pickAssetForPlatform(ASSETS, "linux", "x86_64")).toBe("https://example.com/AppImage");
  });

  it("falls back sanely when an expected format is missing", () => {
    const noSetup = ASSETS.filter((a) => !a.name.includes("setup"));
    expect(pickAssetForPlatform(noSetup, "win32", "x86_64")).toBe("https://example.com/x64.msi");
    const debOnly = ASSETS.filter((a) => !a.name.includes("AppImage"));
    expect(pickAssetForPlatform(debOnly, "linux", "x86_64")).toBe("https://example.com/deb");
  });

  it("picks the release APK on Android", () => {
    expect(pickAssetForPlatform(ASSETS, "android", "aarch64")).toBe("https://example.com/app.apk");
    expect(pickAssetForPlatform(ASSETS.filter((a) => !a.name.endsWith(".apk")), "android", "aarch64")).toBeNull();
  });

  it("returns null when nothing usable exists", () => {
    expect(pickAssetForPlatform([], "linux", "x86_64")).toBeNull();
  });
});

describe("platform detection", () => {
  it("detects macOS, Windows and Linux from the user agent", () => {
    expect(detectPlatform("Mozilla/5.0 (Macintosh) AppleWebKit")).toBe("darwin");
    expect(detectPlatform("Mozilla/5.0 (Windows NT 10.0)")).toBe("win32");
    expect(detectPlatform("Mozilla/5.0 (X11; Linux)")).toBe("linux");
  });

  it("detects Android before the Linux fallback (Android UAs claim X11; Linux)", () => {
    const ua = "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36";
    expect(detectPlatform(ua)).toBe("android");
  });

  it("defaults Apple Silicon heuristics safely", () => {
    expect(detectArch("Mozilla/5.0 (Macintosh) Chrome/120", "darwin")).toBe("aarch64");
    expect(detectArch("Mozilla/5.0 (Windows NT)", "win32")).toBe("x86_64");
  });
});

describe("checkForUpdates", () => {
  it("treats a missing release (404) as up-to-date, even for manual checks", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      await expect(checkForUpdates(true)).resolves.toBeNull();
      await expect(checkForUpdates()).resolves.toBeNull();
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
