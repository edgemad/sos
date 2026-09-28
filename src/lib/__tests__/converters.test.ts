// Round-trip tests for the local conversion engine, run with vitest + jsdom.
// build*Zip producers are paired with the import* parsers so every format is
// verified both directions: SOS → file → SOS.

import { describe, expect, it } from "vitest";
import {
  buildDocxZip, importDocx,
  buildOdtZip, importOdt,
  buildXlsxZip, importXlsx,
  buildOdsZip, importOds,
  importRtf, importMarkdown, importHtmlFile,
  colLetter, colIndex,
  type SheetGrid,
} from "../converters";

const DOC_HTML = "<h1>Report</h1><p>Plain <b>bold</b> and <i>italic</i> text.</p><p>Second paragraph</p>";

describe("DOCX round-trip", () => {
  it("imports text produced by buildDocxZip", async () => {
    const zip = buildDocxZip("Report", DOC_HTML);
    expect(zip[0]).toBe(0x50); // "PK"
    expect(zip[1]).toBe(0x4b);
    const html = await importDocx(zip);
    expect(html).toContain("Report");
    expect(html).toContain("bold");
    expect(html).toContain("Second paragraph");
  });
});

describe("ODT round-trip", () => {
  it("imports text produced by buildOdtZip", async () => {
    const zip = buildOdtZip("Report", DOC_HTML);
    const html = await importOdt(zip);
    expect(html).toContain("Report");
    expect(html).toContain("Second paragraph");
  });
});

const GRID: SheetGrid[] = [
  {
    name: "Data",
    rows: [
      ["Item", "Qty", "Price"],
      ["Widget", "12", "3.5"],
      ["Gadget", "7", "19.99"]
    ]
  },
  {
    name: "Empty",
    rows: [["", ""], ["", ""]]
  }
];

describe("XLSX round-trip", () => {
  it("re-imports sheets and values produced by buildXlsxZip", async () => {
    const zip = buildXlsxZip("book", GRID);
    const grids = await importXlsx(zip);
    expect(grids.length).toBe(2);
    expect(grids[0].name).toBe("Data");
    expect(grids[0].rows[0]).toEqual(["Item", "Qty", "Price"]);
    expect(grids[0].rows[1][1]).toBe("12");
    expect(grids[0].rows[2][2]).toBe("19.99");
  });
});

describe("ODS round-trip", () => {
  it("re-imports sheets and values produced by buildOdsZip", async () => {
    const zip = buildOdsZip("book", GRID);
    const grids = await importOds(zip);
    expect(grids.length).toBe(2);
    expect(grids[0].name).toBe("Data");
    expect(grids[0].rows[0]).toEqual(["Item", "Qty", "Price"]);
    expect(grids[0].rows[1][0]).toBe("Widget");
  });
});

describe("Text formats", () => {
  it("parses RTF with formatting groups", () => {
    const html = importRtf("{\\rtf1\\ansi Hello \\b World\\b0 !}");
    expect(html).toContain("<b>World</b>");
  });

  it("parses Markdown headings and emphasis", () => {
    const html = importMarkdown("# Title\n\nSome **bold** text");
    expect(html).toContain("Title");
    expect(html).toContain("bold");
  });

  it("extracts body from HTML files", () => {
    const html = importHtmlFile("<html><body><p>Hi there</p></body></html>");
    expect(html).toContain("Hi there");
  });
});

describe("Column helpers", () => {
  it("maps indices and letters consistently", () => {
    expect(colLetter(0)).toBe("A");
    expect(colLetter(25)).toBe("Z");
    expect(colLetter(26)).toBe("AA");
    for (let i = 0; i < 60; i++) expect(colIndex(colLetter(i))).toBe(i);
  });
});
