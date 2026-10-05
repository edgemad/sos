// Unit tests for the self-learning layer: usage bumping, recency-decay
// scoring and stable ranking.

import { describe, expect, it } from "vitest";
import { bumpUsage, rankIds, usageScore } from "../adaptive";

const DAY = 86_400_000;
const NOW = 1_000 * DAY;

describe("bumpUsage", () => {
  it("counts repeated commands and refreshes recency", () => {
    let map = bumpUsage({}, "nav-writer", NOW);
    map = bumpUsage(map, "nav-writer", NOW + DAY);
    expect(map["nav-writer"]).toEqual({ count: 2, last: NOW + DAY });
  });

  it("does not mutate the input map", () => {
    const map = bumpUsage({}, "a", NOW);
    const next = bumpUsage(map, "a", NOW);
    expect(map["a"].count).toBe(1);
    expect(next["a"].count).toBe(2);
  });
});

describe("usageScore", () => {
  it("scores unknown commands as zero", () => {
    expect(usageScore(undefined, NOW)).toBe(0);
  });

  it("prefers recent usage over stale usage with equal counts", () => {
    const fresh = usageScore({ count: 3, last: NOW }, NOW);
    const stale = usageScore({ count: 3, last: NOW - 28 * DAY }, NOW);
    expect(fresh).toBeGreaterThan(stale);
  });

  it("decays with a 14-day half-life", () => {
    const entry = { count: 8, last: NOW };
    expect(usageScore(entry, NOW)).toBe(8);
    expect(usageScore(entry, NOW + 14 * DAY)).toBeCloseTo(4, 5);
    expect(usageScore(entry, NOW + 28 * DAY)).toBeCloseTo(2, 5);
  });
});

describe("rankIds", () => {
  it("floats frequently and recently used commands to the top", () => {
    const map = bumpUsage(bumpUsage({}, "files", NOW - DAY), "files", NOW);
    const ranked = rankIds(map, ["nav-home", "files", "new-doc"], NOW);
    expect(ranked[0]).toBe("files");
  });

  it("keeps unknown commands in their original relative order", () => {
    const ranked = rankIds({}, ["b", "a", "c"], NOW);
    expect(ranked).toEqual(["b", "a", "c"]);
  });

  it("is stable: equal scores keep original order", () => {
    const map = bumpUsage({}, "x", NOW);
    const ranked = rankIds(map, ["x", "y", "z"], NOW);
    expect(ranked).toEqual(["x", "y", "z"]);
  });
});
