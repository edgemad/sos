// Unit tests for the self-update version comparison.

import { describe, expect, it } from "vitest";
import { isNewerVersion } from "../updates";

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
