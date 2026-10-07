// Unit tests for Talia's chat brain: endpoint normalization, attachment
// classification, offline personality replies, safe arithmetic and the
// unified askTalia fallback path.

import { describe, expect, it, vi } from "vitest";
import {
  askTalia,
  buildLocalReply,
  buildSystemPrompt,
  classifyAttachment,
  dataUrlToBase64,
  normalizeEndpoint,
  ollamaChatUrl,
  summarizeText,
  safeArithmetic,
  ATTACHMENT_TEXT_PREVIEW_LIMIT
} from "../talia";

describe("normalizeEndpoint", () => {
  it("accepts bare hosts, missing slashes and pasted full endpoints alike", () => {
    expect(normalizeEndpoint("")).toBe("");
    expect(normalizeEndpoint("  ")).toBe("");
    expect(normalizeEndpoint("localhost:11434")).toBe("http://localhost:11434");
    expect(normalizeEndpoint("http://localhost:11434")).toBe("http://localhost:11434");
    expect(normalizeEndpoint("http://localhost:11434/")).toBe("http://localhost:11434");
    expect(normalizeEndpoint("http://localhost:11434/api")).toBe("http://localhost:11434");
    expect(normalizeEndpoint("http://localhost:11434/api/chat")).toBe("http://localhost:11434");
    expect(normalizeEndpoint("https://ai.myhome.lan:8080//")).toBe("https://ai.myhome.lan:8080");
  });

  it("builds the chat endpoint from the base", () => {
    expect(ollamaChatUrl("localhost:11434")).toBe("http://localhost:11434/api/chat");
  });
});

describe("classifyAttachment", () => {
  it("spots images by mime or extension", () => {
    expect(classifyAttachment("shot.png", "image/png")).toBe("image");
    expect(classifyAttachment("pic.jpeg")).toBe("image");
  });

  it("spots text-ish files", () => {
    expect(classifyAttachment("notes.md")).toBe("text");
    expect(classifyAttachment("data.csv")).toBe("text");
    expect(classifyAttachment("main.rs")).toBe("text");
    expect(classifyAttachment("blob", "text/plain")).toBe("text");
  });

  it("treats binary files as chips", () => {
    expect(classifyAttachment("video.mp4")).toBe("other");
    expect(classifyAttachment("archive.zip")).toBe("other");
    expect(classifyAttachment("noext")).toBe("other");
  });
});

describe("summarizeText", () => {
  it("keeps short text whole", () => {
    expect(summarizeText("hello")).toEqual({ preview: "hello", truncated: false });
  });

  it("truncates long text at the limit", () => {
    const long = "x".repeat(ATTACHMENT_TEXT_PREVIEW_LIMIT + 100);
    const out = summarizeText(long);
    expect(out.truncated).toBe(true);
    expect(out.preview.length).toBe(ATTACHMENT_TEXT_PREVIEW_LIMIT);
  });
});

describe("dataUrlToBase64", () => {
  it("strips the data URL prefix", () => {
    expect(dataUrlToBase64("data:image/png;base64,QUJD")).toBe("QUJD");
    expect(dataUrlToBase64("QUJD")).toBe("QUJD");
  });
});

describe("safeArithmetic", () => {
  it("evaluates simple and nested arithmetic", () => {
    expect(safeArithmetic("2+2")).toBe("4");
    expect(safeArithmetic("what is 12*3?")).toBe("36");
    expect(safeArithmetic("(2+3)*4")).toBe("20");
    expect(safeArithmetic("10/4")).toBe("2.5");
  });

  it("rejects anything that is not plain arithmetic", () => {
    expect(safeArithmetic("delete all files")).toBeNull();
    expect(safeArithmetic("alert(1)")).toBeNull();
    expect(safeArithmetic("")).toBeNull();
    expect(safeArithmetic("1/0")).toBeNull(); // non-finite
  });
});

describe("buildLocalReply", () => {
  const rng = () => 0;

  it("greets, introduces itself and explains capabilities", () => {
    expect(buildLocalReply("hi!", { rng }).length).toBeGreaterThan(0);
    expect(buildLocalReply("who are you?", { rng })).toMatch(/Talia/i);
    expect(buildLocalReply("what can you do", { rng })).toMatch(/attach|self-hosted/i);
  });

  it("answers time questions with the provided clock", () => {
    const noon = new Date("2026-10-08T12:00:00").getTime();
    const reply = buildLocalReply("what time is it", { now: noon, rng });
    expect(reply).toMatch(/12:00/);
  });

  it("does math", () => {
    expect(buildLocalReply("what is 7*6", { rng })).toMatch(/42/);
  });

  it("acknowledges attachments on short inputs", () => {
    const reply = buildLocalReply("look!", { hasAttachments: true, attachmentNames: ["cat.png"], rng });
    expect(reply).toMatch(/cat\.png/);
  });

  it("always answers with something for unknown input", () => {
    expect(buildLocalReply("zzz qqquuux", { rng }).length).toBeGreaterThan(0);
    expect(buildLocalReply("", { rng }).length).toBeGreaterThan(0);
  });

  it("tells a joke on demand", () => {
    expect(buildLocalReply("tell me a joke", { rng })).toMatch(/\?\s*\S/);
  });
});

describe("buildSystemPrompt", () => {
  it("establishes the kid persona", () => {
    expect(buildSystemPrompt()).toMatch(/Talia/);
    expect(buildSystemPrompt()).toMatch(/offline/);
  });
});

describe("askTalia", () => {
  it("uses the local brain when no endpoint is configured", async () => {
    const answer = await askTalia({ input: "hi", history: [], attachments: [], rng: () => 0 });
    expect(answer.source).toBe("local");
    expect(answer.fallbackReason).toBeUndefined();
  });

  it("falls back to the local brain when the endpoint is unreachable", async () => {
    const fetchMock = vi.fn(async () => new Response("nope", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      const answer = await askTalia({
        input: "hi",
        history: [],
        attachments: [],
        endpoint: "127.0.0.1:9", // nothing listens here
        model: "llama3.2",
        rng: () => 0
      });
      expect(answer.source).toBe("local");
      expect(answer.fallbackReason).toBeTruthy();
      expect(answer.text.length).toBeGreaterThan(0);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("talks to a self-hosted model when one answers", async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}"));
      expect(body.model).toBe("llama3.2");
      expect(body.stream).toBe(false);
      expect(Array.isArray(body.messages)).toBe(true);
      return new Response(JSON.stringify({ message: { role: "assistant", content: "Hi hi! It's Talia via Ollama!" } }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const answer = await askTalia({
        input: "hello",
        history: [],
        attachments: [],
        endpoint: "http://localhost:11434",
        model: "llama3.2"
      });
      expect(answer.source).toBe("ollama");
      expect(answer.text).toMatch(/Ollama/);
      expect(answer.fallbackReason).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
