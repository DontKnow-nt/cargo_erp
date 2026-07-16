export type ImportedInvoiceFacts = {
  company: string;
  billNo: string;
  date: string;
  netAmount: number;
};

function str(value: unknown): string {
  return String(value ?? '').trim();
}

function num(value: unknown): number {
  return parseFloat(String(value ?? 0).replace(/,/g, '')) || 0;
}

/** Extract the four invoice fields used by the historical-import flow. */
export function extractInvoiceFacts(rows: unknown[][]): ImportedInvoiceFacts | null {
  let company = '';
  let billNo = '';
  let date = '';
  let netAmount = 0;

  for (let rowIndex = 0; rowIndex < rows.length; rowIndex++) {
    const row = rows[rowIndex];
    for (let columnIndex = 0; columnIndex < row.length; columnIndex++) {
      const cell = str(row[columnIndex]);
      if (!cell) continue;

      if (!company) {
        const match = cell.match(/M\/s\.?\s*[:\-]?\s*(.+)/i);
        if (match) company = match[1].trim();
      }

      if (!billNo) {
        const match = cell.match(/bill\s*no\.?\s*[:\-]*\s*(\S.*)?$/i)
          || cell.match(/invoice\s*no\.?\s*[:\-]*\s*(\S.*)?$/i);
        if (match) {
          const inline = match[1]?.trim();
          if (inline) {
            billNo = inline;
          } else {
            for (let nextColumn = columnIndex + 1; nextColumn < row.length; nextColumn++) {
              const value = str(row[nextColumn]);
              if (value) { billNo = value; break; }
            }
            if (!billNo && rows[rowIndex + 1]) {
              for (const value of rows[rowIndex + 1]) {
                const text = str(value);
                if (text) { billNo = text; break; }
              }
            }
          }

          if (!date) {
            for (let nextColumn = columnIndex + 1; nextColumn < row.length; nextColumn++) {
              const value = str(row[nextColumn]);
              if (/^\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}$/.test(value)) { date = value; break; }
            }
            if (!date && rows[rowIndex + 1]) {
              for (const value of rows[rowIndex + 1]) {
                const text = str(value);
                if (/^\d{1,2}[.\/-]\d{1,2}[.\/-]\d{2,4}$/.test(text)) { date = text; break; }
              }
            }
          }
        }
      }

      if (/net\s*amount/i.test(cell)) {
        for (let nextColumn = columnIndex + 1; nextColumn < row.length; nextColumn++) {
          const value = num(row[nextColumn]);
          if (value > 0) { netAmount = value; break; }
        }
      }
    }
  }

  if (netAmount <= 0) {
    const totalRow = rows.find(row => row.some(value => /^total$/i.test(str(value))));
    if (totalRow) {
      const values = totalRow.map(num).filter(value => value > 0);
      if (values.length) netAmount = values[values.length - 1];
    }
  }

  if (!company && !billNo && netAmount <= 0) return null;
  return { company, billNo, date, netAmount };
}
