// Unit tests for the voice service's pure helpers: speech sanitization,
// utterance chunking, rate clamping and voice selection. (The Web Speech
// APIs themselves are platform features and are guarded at runtime, not
// tested here.)

import { describe, expect, it } from "vitest";
import { chunkTextForSpeech, clampRate, parseDictation, pickVoice, sanitizeForSpeech } from "../voice";

describe("sanitizeForSpeech", () => {
  it("collapses whitespace and strips zero-width characters", () => {
    expect(sanitizeForSpeech("Hello\u200b world\n\tagain  ")).toBe("Hello world again");
  });

  it("keeps punctuation intact", () => {
    expect(sanitizeForSpeech("Hi!  Are you… ok?")).toBe("Hi! Are you… ok?");
  });

  it("returns empty string for whitespace-only text", () => {
    expect(sanitizeForSpeech("   \n\t ")).toBe("");
  });
});

describe("chunkTextForSpeech", () => {
  it("returns a single chunk for short text", () => {
    expect(chunkTextForSpeech("Short text.")).toEqual(["Short text."]);
  });

  it("returns no chunks for empty text", () => {
    expect(chunkTextForSpeech("   ")).toEqual([]);
  });

  it("splits on sentence boundaries and recombines up to maxLen", () => {
    expect(chunkTextForSpeech("One. Two. Three. Four.", 12)).toEqual(["One. Two.", "Three. Four."]);
  });

  it("never breaks inside numbers like 3.14", () => {
    const chunks = chunkTextForSpeech("Pi is about 3.14 or so.", 30);
    expect(chunks).toEqual(["Pi is about 3.14 or so."]);
  });

  it("preserves every word when chunking long text", () => {
    const text = "The value is 3.14 for pi. Extra words follow here. ".repeat(3);
    const chunks = chunkTextForSpeech(text, 30);
    expect(chunks.length).toBeGreaterThan(1);
    // Joining the chunks back restores the sanitized text exactly.
    expect(chunks.join(" ")).toBe(sanitizeForSpeech(text));
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(30);
  });
});

describe("clampRate", () => {
  it("keeps rates inside the Web Speech valid range", () => {
    expect(clampRate(1)).toBe(1);
    expect(clampRate(0.2)).toBe(0.5);
    expect(clampRate(5)).toBe(2);
    expect(clampRate(1.234)).toBe(1.2);
    expect(clampRate(NaN)).toBe(1);
  });
});

describe("pickVoice", () => {
  const voices = [
    { name: "Samantha", lang: "en-US", default: true },
    { name: "Daniel", lang: "en-GB" },
    { name: "Anna", lang: "de-DE" }
  ];

  it("prefers the exact configured voice over language", () => {
    expect(pickVoice(voices, "Daniel", "de-DE")?.name).toBe("Daniel");
  });

  it("falls back to a name prefix", () => {
    expect(pickVoice(voices, "Dan")?.name).toBe("Daniel");
  });

  it("falls back to a language match, loose or exact", () => {
    expect(pickVoice(voices, undefined, "de-DE")?.name).toBe("Anna");
    expect(pickVoice(voices, undefined, "de-AT")?.name).toBe("Anna");
  });

  it("falls back to the platform default voice", () => {
    expect(pickVoice(voices)?.name).toBe("Samantha");
  });

  it("returns null when there are no voices", () => {
    expect(pickVoice([])).toBeNull();
  });
});

describe("parseDictation", () => {
  it("recognizes stop commands", () => {
    expect(parseDictation("stop listening")).toEqual({ action: "stop" });
    expect(parseDictation("Stop listening.")).toEqual({ action: "stop" });
    expect(parseDictation("GO TO SLEEP")).toEqual({ action: "stop" });
    expect(parseDictation("Jarvis stop")).toEqual({ action: "stop" });
  });

  it("recognizes paragraph breaks", () => {
    expect(parseDictation("new paragraph")).toEqual({ action: "newline" });
    expect(parseDictation("New line")).toEqual({ action: "newline" });
  });

  it("converts spoken punctuation", () => {
    expect(parseDictation("period")).toEqual({ action: "insert", text: "." });
    expect(parseDictation("full stop")).toEqual({ action: "insert", text: "." });
    expect(parseDictation("Question mark")).toEqual({ action: "insert", text: "?" });
  });

  it("passes normal text through untouched", () => {
    expect(parseDictation("Hello world")).toEqual({ action: "insert", text: "Hello world" });
    expect(parseDictation("  spaced out  ")).toEqual({ action: "insert", text: "spaced out" });
  });
});
