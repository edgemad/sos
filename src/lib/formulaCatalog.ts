// Formula function catalog powering autocomplete in the Sheets formula bar.

export interface FormulaFnInfo {
  name: string;
  signature: string;
  description: string;
  category: "Math" | "Statistical" | "Logical" | "Text" | "Date";
}

export const FORMULA_FNS: FormulaFnInfo[] = [
  { name: "SUM", signature: "SUM(value1, [value2, …])", description: "Adds numbers or ranges together.", category: "Math" },
  { name: "AVERAGE", signature: "AVERAGE(value1, [value2, …])", description: "Arithmetic mean of the values.", category: "Statistical" },
  { name: "COUNT", signature: "COUNT(range)", description: "Counts numeric values in a range.", category: "Statistical" },
  { name: "COUNTA", signature: "COUNTA(range)", description: "Counts all non-empty values.", category: "Statistical" },
  { name: "COUNTIF", signature: "COUNTIF(range, criterion)", description: "Counts values matching a criterion, e.g. \">5\".", category: "Statistical" },
  { name: "SUMIF", signature: "SUMIF(range, criterion, [sum_range])", description: "Sums values matching a criterion.", category: "Math" },
  { name: "MIN", signature: "MIN(range)", description: "Smallest numeric value.", category: "Statistical" },
  { name: "MAX", signature: "MAX(range)", description: "Largest numeric value.", category: "Statistical" },
  { name: "MEDIAN", signature: "MEDIAN(range)", description: "Middle value of the range.", category: "Statistical" },
  { name: "STDEV", signature: "STDEV(range)", description: "Sample standard deviation.", category: "Statistical" },
  { name: "PRODUCT", signature: "PRODUCT(range)", description: "Multiplies all values together.", category: "Math" },
  { name: "ROUND", signature: "ROUND(value, [digits])", description: "Rounds to a number of digits.", category: "Math" },
  { name: "ABS", signature: "ABS(value)", description: "Absolute value.", category: "Math" },
  { name: "SQRT", signature: "SQRT(value)", description: "Square root.", category: "Math" },
  { name: "IF", signature: "IF(condition, then, else)", description: "Returns one value if true, another if false.", category: "Logical" },
  { name: "IFERROR", signature: "IFERROR(value, fallback)", description: "Replaces errors with a fallback value.", category: "Logical" },
  { name: "AND", signature: "AND(logical1, [logical2, …])", description: "TRUE if all arguments are true.", category: "Logical" },
  { name: "OR", signature: "OR(logical1, [logical2, …])", description: "TRUE if any argument is true.", category: "Logical" },
  { name: "NOT", signature: "NOT(logical)", description: "Inverts a logical value.", category: "Logical" },
  { name: "CONCAT", signature: "CONCAT(text1, [text2, …])", description: "Joins text values together.", category: "Text" },
  { name: "LEN", signature: "LEN(text)", description: "Length of a text string.", category: "Text" },
  { name: "UPPER", signature: "UPPER(text)", description: "Converts text to uppercase.", category: "Text" },
  { name: "LOWER", signature: "LOWER(text)", description: "Converts text to lowercase.", category: "Text" },
  { name: "TRIM", signature: "TRIM(text)", description: "Removes leading/trailing spaces.", category: "Text" },
  { name: "LEFT", signature: "LEFT(text, [count])", description: "First characters of text.", category: "Text" },
  { name: "RIGHT", signature: "RIGHT(text, [count])", description: "Last characters of text.", category: "Text" },
  { name: "MID", signature: "MID(text, start, length)", description: "Characters from the middle of text.", category: "Text" },
  { name: "NOW", signature: "NOW()", description: "Current date and time.", category: "Date" },
  { name: "CONCATENATE", signature: "CONCATENATE(text1, [text2, …])", description: "Joins text values together.", category: "Text" }
];

/** Fuzzy-ish suggestion list for the current partial function name. */
export function suggestFunctions(partial: string): FormulaFnInfo[] {
  const p = partial.toUpperCase();
  if (!p) return FORMULA_FNS.slice(0, 8);
  const starts = FORMULA_FNS.filter((f) => f.name.startsWith(p));
  const contains = FORMULA_FNS.filter((f) => !f.name.startsWith(p) && f.name.includes(p));
  return [...starts, ...contains].slice(0, 8);
}
