/**
 * Minimal CSV encoder for the export routes.
 *
 * Cells that begin with a spreadsheet formula character are prefixed with an
 * apostrophe: titles and URLs come from third-party product pages, and a
 * downloaded sheet must never execute them.
 */
type Cell = string | number | boolean | null | undefined;

export function csvCell(value: Cell): string {
  let text = value === null || value === undefined ? "" : String(value);
  // leading whitespace is ignored by spreadsheet parsers, so check past it
  if (typeof value === "string" && /^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function toCsv(
  headers: readonly string[],
  rows: readonly (readonly Cell[])[],
): string {
  return (
    [headers, ...rows]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n") + "\r\n"
  );
}
