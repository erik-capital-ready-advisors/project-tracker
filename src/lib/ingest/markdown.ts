/** Data rows of the first markdown table under `heading`, as cell arrays. */
export function tableRows(text: string, heading: string): string[][] {
  const rows: string[][] = [];
  let inSection = false;

  for (const line of text.split("\n")) {
    if (line.startsWith(heading)) {
      inSection = true;
      continue;
    }
    if (!inSection) continue;
    if (line.startsWith("## ") || line.startsWith("# ")) break;

    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;

    const cells = trimmed
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => cell.trim());

    if (cells.every((cell) => /^[-: ]*$/.test(cell))) continue;  // separator
    if (cells[0]?.toLowerCase() === "id") continue;              // header
    rows.push(cells);
  }
  return rows;
}
