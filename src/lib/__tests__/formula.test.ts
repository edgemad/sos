// Unit tests for the formula engine: parsing, operators, functions, and the
// regressions found in real use ($ anchors, & concat, TRUE/FALSE, ranges as
// scalars, postfix %, whitespace-tolerant ranges).

import { describe, expect, it } from "vitest";
import { evaluateCell, colToName, nameToCol, cellKey, referencedCells } from "../formula";
import type { SheetTab } from "../../types";

function tabWith(cells: Record<string, string>): SheetTab {
  return { name: "T", rows: 50, cols: 20, cells };
}

function evalOf(formula: string, cells: Record<string, string> = {}): unknown {
  const t = tabWith({ ...cells, ZZ9: formula });
  return evaluateCell(t, "ZZ9");
}

describe("refs and literals", () => {
  it("evaluates plain cell refs", () => {
    expect(evalOf("=B2", { B2: "42" })).toBe(42);
    expect(evalOf("=B2", { B2: "hello" })).toBe("hello");
  });

  it("supports $-anchored refs", () => {
    expect(evalOf("=$B$2", { B2: "7" })).toBe(7);
    expect(evalOf("=$B2+B$2", { B2: "3" })).toBe(6);
  });

  it("treats TRUE/FALSE as literals, not empty refs", () => {
    expect(evalOf("=IF(TRUE, 1, 2)")).toBe(1);
    expect(evalOf("=IF(FALSE, 1, 2)")).toBe(2);
    expect(evalOf("=TRUE")).toBe(true);
    expect(evalOf("=NOT(FALSE)")).toBe(true);
  });

  it("unknown names give #NAME?", () => {
    expect(evalOf("=FOO")).toBe("#NAME?");
  });
});

describe("operators", () => {
  it("does arithmetic with precedence", () => {
    expect(evalOf("=2+3*4")).toBe(14);
    expect(evalOf("=(2+3)*4")).toBe(20);
    expect(evalOf("=2^10")).toBe(1024);
    expect(evalOf("=-5+2")).toBe(-3);
  });

  it("supports postfix percent", () => {
    expect(evalOf("=50%")).toBe(0.5);
    expect(evalOf("=B2%", { B2: "0.2" })).toBeCloseTo(0.002);
  });

  it("concatenates with &", () => {
    expect(evalOf('="a" & "b" & 3')).toBe("ab3");
    expect(evalOf("=A1 & \" \" & A2", { A1: "Hi", A2: "there" })).toBe("Hi there");
  });

  it("compares and divides", () => {
    expect(evalOf("=1 < 2")).toBe(true);
    expect(evalOf("=1/0")).toBe("#DIV/0!");
  });
});

describe("ranges", () => {
  it("tolerates whitespace and $ in ranges", () => {
    expect(evalOf("=SUM( A1 : A3 )", { A1: "1", A2: "2", A3: "3" })).toBe(6);
    expect(evalOf("=SUM($A$1:$A$3)", { A1: "1", A2: "2", A3: "3" })).toBe(6);
  });

  it("aggregates over ranges", () => {
    const cells = { A1: "10", A2: "20", A3: "30" };
    expect(evalOf("=SUM(A1:A3)", cells)).toBe(60);
    expect(evalOf("=AVERAGE(A1:A3)", cells)).toBe(20);
    expect(evalOf("=MIN(A1:A3)", cells)).toBe(10);
    expect(evalOf("=MAX(A1:A3)", cells)).toBe(30);
    expect(evalOf("=COUNT(A1:A3)", cells)).toBe(3);
    expect(evalOf("=MEDIAN(A1:A3)", cells)).toBe(20);
  });

  it("handles criteria functions", () => {
    const cells = { A1: "5", A2: "15", A3: "25", B1: "x", B2: "y", B3: "z" };
    expect(evalOf('=COUNTIF(A1:A3, ">10")', cells)).toBe(2);
    expect(evalOf('=SUMIF(A1:A3, ">10")', cells)).toBe(40);
    expect(evalOf('=SUMIF(A1:A3, ">10", B1:B3)', cells)).toBe(0);
  });

  it("AND/OR work over ranges", () => {
    const cells = { A1: "1", A2: "1" };
    expect(evalOf("=AND(A1:A2)", cells)).toBe(true);
    expect(evalOf("=OR(A1:A2)", cells)).toBe(true);
    expect(evalOf("=AND(A1:A2, FALSE)", cells)).toBe(false);
  });
});

describe("text functions", () => {
  it("works on scalars", () => {
    expect(evalOf('=LEN("abcd")')).toBe(4);
    expect(evalOf('=UPPER("abc")')).toBe("ABC");
    expect(evalOf('=LEFT("hello", 2)')).toBe("he");
    expect(evalOf('=RIGHT("hello", 2)')).toBe("lo");
    expect(evalOf('=MID("hello", 2, 3)')).toBe("ell");
    expect(evalOf('=TRIM("  x  ")')).toBe("x");
  });

  it("collapses ranges to first value instead of [object Object]", () => {
    expect(evalOf('=UPPER(A1:A2)', { A1: "ab", A2: "cd" })).toBe("AB");
    expect(evalOf('=LEN(A1:A2)', { A1: "abcd" })).toBe(4);
  });

  it("concatenates ranges", () => {
    expect(evalOf('=CONCAT(A1:A2)', { A1: "x", A2: "y" })).toBe("xy");
    expect(evalOf('=CONCATENATE("a", 1, TRUE)')).toBe("a1TRUE");
  });
});

describe("errors", () => {
  it("propagates and recovers", () => {
    expect(evalOf("=SQRT(-1)")).toBe("#ERROR!");
    expect(evalOf('=IFERROR(SQRT(-1), "safe")')).toBe("safe");
    expect(evalOf("=1/0")).toBe("#DIV/0!");
    expect(evalOf('=IFERROR(1/0, -1)')).toBe(-1);
  });

  it("detects circular references", () => {
    const t = tabWith({ A1: "=A1" });
    expect(evaluateCell(t, "A1")).toBe("#ERROR!");
  });
});

describe("helpers", () => {
  it("maps columns bidirectionally", () => {
    expect(colToName(0)).toBe("A");
    expect(colToName(702)).toBe("AAA");
    expect(nameToCol("AAA")).toBe(702);
    expect(cellKey(0, 0)).toBe("A1");
  });

  it("expands referenced cells", () => {
    expect(referencedCells("=SUM(A1:B2)")).toEqual(["A1", "B1", "A2", "B2"]);
    expect(referencedCells("=A1+Z9")).toContain("A1");
  });
});
