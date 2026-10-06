// Unit tests for the arcade catalog and its pure state transitions.

import { describe, expect, it } from "vitest";
import {
  GAMES,
  gameById,
  isInstalled,
  bestScore,
  newArcadeState,
  withInstalled,
  withoutInstalled,
  withScore
} from "../arcade";

describe("catalog", () => {
  it("has unique ids across every game", () => {
    const ids = GAMES.map((g) => g.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("covers all six games with complete metadata", () => {
    expect(GAMES.length).toBe(6);
    for (const g of GAMES) {
      expect(g.name.length).toBeGreaterThan(0);
      expect(g.icon.length).toBeGreaterThan(0);
      expect(g.tagline.length).toBeGreaterThan(0);
      expect(g.controls.length).toBeGreaterThan(0);
      expect(g.rating).toBeGreaterThanOrEqual(3);
      expect(g.rating).toBeLessThanOrEqual(5);
      expect(g.from).toMatch(/^#/);
      expect(g.to).toMatch(/^#/);
    }
  });

  it("looks games up by id and returns undefined for unknown ids", () => {
    expect(gameById("snake")?.name).toBe("Snake Classic");
    expect(gameById("nope")).toBeUndefined();
  });
});

describe("install state", () => {
  it("starts with nothing installed", () => {
    const s = newArcadeState();
    expect(s.installed).toEqual([]);
    expect(isInstalled(s, "snake")).toBe(false);
  });

  it("installs idempotently and uninstalls", () => {
    let s = newArcadeState();
    s = withInstalled(s, "snake");
    const again = withInstalled(s, "snake");
    expect(again.installed).toEqual(["snake"]); // no duplicate
    s = withoutInstalled(s, "snake");
    expect(isInstalled(s, "snake")).toBe(false);
  });

  it("keeps best scores across an uninstall/reinstall", () => {
    let s = withScore(newArcadeState(), "snake", 120).state;
    s = withoutInstalled(s, "snake");
    s = withInstalled(s, "snake");
    expect(bestScore(s, "snake")).toBe(120);
  });
});

describe("scores", () => {
  it("records a personal best only when beaten", () => {
    let s = newArcadeState();
    let r = withScore(s, "g2048", 500);
    expect(r.newBest).toBe(true);
    s = r.state;
    r = withScore(s, "g2048", 300);
    expect(r.newBest).toBe(false);
    expect(bestScore(r.state, "g2048")).toBe(500);
    r = withScore(s, "g2048", 900);
    expect(r.newBest).toBe(true);
    expect(bestScore(r.state, "g2048")).toBe(900);
  });

  it("counts plays on every finished run", () => {
    let s = newArcadeState();
    s = withScore(s, "memory", 700).state;
    s = withScore(s, "memory", 900).state;
    expect(s.plays.memory).toBe(2);
  });

  it("ignores non-finite scores", () => {
    const s0 = newArcadeState();
    const r = withScore(s0, "snake", Number.NaN);
    expect(r.newBest).toBe(false);
    expect(bestScore(r.state, "snake")).toBe(0);
  });
});
