import { test } from "node:test";
import assert from "node:assert/strict";
import { csvCell, toCsv } from "./csv.js";

test("csvCell: plain values pass through", () => {
  assert.equal(csvCell("Sony WH-1000XM5"), "Sony WH-1000XM5");
  assert.equal(csvCell(249.99), "249.99");
  assert.equal(csvCell(false), "false");
});

test("csvCell: commas, quotes, and newlines are quoted", () => {
  assert.equal(csvCell("a,b"), '"a,b"');
  assert.equal(csvCell('say "hi"'), '"say ""hi"""');
  assert.equal(csvCell("line\nbreak"), '"line\nbreak"');
});

test("csvCell: missing values become empty cells", () => {
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(undefined), "");
});

test("csvCell: formula-looking strings are defused", () => {
  assert.equal(csvCell("=HYPERLINK(\"http://evil\")"), `"'=HYPERLINK(""http://evil"")"`);
  assert.equal(csvCell("+1+1"), "'+1+1");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  // spreadsheet parsers ignore leading whitespace before the formula
  assert.equal(csvCell("  =1+1"), "'  =1+1");
  assert.equal(csvCell("\t=cmd"), "'\t=cmd");
  // a newline also forces quoting, after the apostrophe is added
  assert.equal(csvCell("\n@SUM(A1)"), `"'\n@SUM(A1)"`);
});

test("toCsv: header plus CRLF rows and a trailing newline", () => {
  assert.equal(
    toCsv(["item", "price"], [["A", 1], ["B", 2]]),
    "item,price\r\nA,1\r\nB,2\r\n",
  );
});
