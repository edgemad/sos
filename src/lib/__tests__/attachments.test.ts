// Unit tests for the attachments library's pure helpers: extension sniffing,
// image detection, human sizes, chip HTML building. (The canvas-downscale and
// FileReader paths are runtime features, guarded, not tested here.)

import { describe, expect, it } from "vitest";
import {
  buildAttachmentChip,
  escapeAttr,
  extOf,
  formatBytes,
  iconForFile,
  isEmbeddedSrc,
  isImageFile
} from "../attachments";

describe("extOf", () => {
  it("returns the lowercased extension", () => {
    expect(extOf("photo.JPG")).toBe("jpg");
    expect(extOf("archive.tar.gz")).toBe("gz");
  });

  it("returns empty for extensionless names", () => {
    expect(extOf("Makefile")).toBe("");
    expect(extOf("")).toBe("");
  });
});

describe("isImageFile", () => {
  it("accepts by mime type", () => {
    expect(isImageFile("screenshot", "image/png")).toBe(true);
  });

  it("accepts by extension", () => {
    expect(isImageFile("photo.webp")).toBe(true);
    expect(isImageFile("song.mp3")).toBe(false);
  });
});

describe("formatBytes", () => {
  it("formats human-readable sizes", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(5.5 * 1024 * 1024 * 1024)).toBe("5.5 GB");
    expect(formatBytes(Number.NaN)).toBe("0 B");
  });
});

describe("iconForFile", () => {
  it("maps known kinds to friendly icons", () => {
    expect(iconForFile("cat.png")).toBe("🖼️");
    expect(iconForFile("report.pdf")).toBe("📕");
    expect(iconForFile("budget.csv")).toBe("📊");
    expect(iconForFile("tune.mp3")).toBe("🎵");
    expect(iconForFile("clip.mp4")).toBe("🎬");
    expect(iconForFile("main.ts")).toBe("🧩");
  });

  it("falls back to a paperclip", () => {
    expect(iconForFile("blob.bin")).toBe("📎");
  });
});

describe("escapeAttr", () => {
  it("escapes quotes and angle brackets", () => {
    expect(escapeAttr('a"b<c>&d')).toBe("a&quot;b&lt;c&gt;&amp;d");
  });
});

describe("buildAttachmentChip", () => {
  it("embeds name, size and target as safe attributes", () => {
    const html = buildAttachmentChip({ name: "my file.zip", size: 2048, target: "/home/me/my file.zip" });
    expect(html).toContain('data-sos-target="/home/me/my file.zip"');
    expect(html).toContain("my file.zip");
    expect(html).toContain("2.0 KB");
    expect(html).toContain("contenteditable=\"false\"");
  });

  it("omits the target for inert chips and the size when unknown", () => {
    const html = buildAttachmentChip({ name: "big.mp4" });
    expect(html).not.toContain("data-sos-target");
    expect(html).not.toContain("·");
  });

  it("escapes hostile names", () => {
    const html = buildAttachmentChip({ name: '<img src=x onerror="alert(1)">.png' });
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=&quot;alert(1)&quot;&gt;.png");
  });
});

describe("isEmbeddedSrc", () => {
  it("tells data URLs from disk paths", () => {
    expect(isEmbeddedSrc("data:image/png;base64,AAA")).toBe(true);
    expect(isEmbeddedSrc("/home/me/report.pdf")).toBe(false);
  });
});
