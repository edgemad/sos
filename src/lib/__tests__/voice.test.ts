// Unit tests for the voice service's pure helpers: speech sanitization,
// utterance chunking, rate clamping and voice selection. (The Web Speech
// APIs themselves are platform features and are guarded at runtime, not
// tested here.)

import { describe, expect, it } from "vitest";
import {
  ackPhrase,
  chunkTextForSpeech,
  clampPitch,
  clampRate,
  kidVoiceScore,
  parseDictation,
  pickKidVoice,
  pickVoice,
  resolveVoicePrefs,
  sanitizeForSpeech
} from "../voice";

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

describe("clampPitch", () => {
  it("keeps pitch inside the Web Speech valid range", () => {
    expect(clampPitch(1)).toBe(1);
    expect(clampPitch(0.2)).toBe(0.5);
    expect(clampPitch(3)).toBe(2);
    expect(clampPitch(1.46)).toBe(1.5);
    expect(clampPitch(NaN)).toBe(1);
  });
});

describe("kid voice picking", () => {
  const voices = [
    { name: "Daniel", lang: "en-GB" },
    { name: "Google UK English Female", lang: "en-GB" },
    { name: "Junior", lang: "en-US" }
  ];

  it("scores child-named voices highest", () => {
    const [daniel, googleFemale, junior] = voices;
    expect(kidVoiceScore(junior)).toBeGreaterThan(kidVoiceScore(googleFemale));
    expect(kidVoiceScore(googleFemale)).toBeGreaterThan(kidVoiceScore(daniel));
  });

  it("picks the most kid-like voice first", () => {
    expect(pickKidVoice(voices)?.name).toBe("Junior");
  });

  it("still honours language when no kid voice exists", () => {
    expect(pickKidVoice([{ name: "Daniel", lang: "en-GB" }, { name: "Anna", lang: "de-DE" }], "de-DE")?.name).toBe("Anna");
    expect(pickKidVoice([])).toBeNull();
  });
});

describe("ackPhrase", () => {
  it("always returns a non-empty line, deterministic for a fixed rng", () => {
    for (const kind of ["greeting", "ack", "done", "stop", "error"] as const) {
      const line = ackPhrase(kind, () => 0);
      expect(line.length).toBeGreaterThan(0);
      expect(line).toBe(ackPhrase(kind, () => 0));
      // An extreme rng stays inside the bank (never undefined).
      expect(ackPhrase(kind, () => 0.999).length).toBeGreaterThan(0);
    }
  });

  it("can vary the line with the rng", () => {
    const lines = new Set([ackPhrase("ack", () => 0), ackPhrase("ack", () => 0.51), ackPhrase("ack", () => 0.99)]);
    expect(lines.size).toBeGreaterThan(1);
  });
});

describe("resolveVoicePrefs", () => {
  it("kid persona speaks faster, brighter and prefers a kid voice", () => {
    const prefs = resolveVoicePrefs({ voiceEnabled: true, voiceRate: 1, voiceName: "", voicePersona: "kid", voicePitch: 1.4 });
    expect(prefs.rate).toBe(1.1); // clampRate rounds to one decimal
    expect(prefs.pitch).toBe(1.4);
    expect(prefs.preferKid).toBe(true);
    expect(prefs.voiceName).toBeUndefined();
  });

  it("assistant persona keeps the configured rate and an even pitch", () => {
    const prefs = resolveVoicePrefs({ voiceEnabled: true, voiceRate: 1.3, voiceName: "", voicePersona: "assistant", voicePitch: 0 });
    expect(prefs.rate).toBe(1.3);
    expect(prefs.pitch).toBe(1);
    expect(prefs.preferKid).toBe(false);
  });

  it("an explicit voice always wins over kid preference", () => {
    const prefs = resolveVoicePrefs({ voiceEnabled: true, voiceRate: 1, voiceName: "Daniel", voicePersona: "kid", voicePitch: 1.4 });
    expect(prefs.voiceName).toBe("Daniel");
    expect(prefs.preferKid).toBe(false);
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

  it("maps canvas commands (bold, headings, lists, scratch, date)", () => {
    expect(parseDictation("bold that")).toEqual({ action: "command", command: "bold" });
    expect(parseDictation("Heading two.")).toEqual({ action: "command", command: "formatBlock:h2" });
    expect(parseDictation("bullet list")).toEqual({ action: "command", command: "insertUnorderedList" });
    expect(parseDictation("scratch that")).toEqual({ action: "command", command: "sos:scratch" });
    expect(parseDictation("insert date")).toEqual({ action: "command", command: "sos:date" });
    expect(parseDictation("undo that")).toEqual({ action: "command", command: "undo" });
  });

  it("maps app navigation and creation", () => {
    expect(parseDictation("open sheets")).toEqual({ action: "app", app: "sheets" });
    expect(parseDictation("Open calendar")).toEqual({ action: "app", app: "calendar" });
    expect(parseDictation("new note.")).toEqual({ action: "app", app: "new:note" });
    expect(parseDictation("go home")).toEqual({ action: "app", app: "home" });
  });

  it("still recognizes Talia as a stop name", () => {
    expect(parseDictation("Talia stop")).toEqual({ action: "stop" });
  });
});
