/** Exportación de reportes: CSV (compatible Excel) y PDF vía impresión del navegador. */

export interface ExportColumn<T> {
  key: string
  header: string
  value?: (row: T) => string | number
}

function csvCell(v: string | number): string {
  const s = String(v ?? '')
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

/** Serializa filas a CSV con BOM para que Excel respete acentos y separadores regionales. */
export function toCSV<T>(rows: T[], columns: ExportColumn<T>[]): string {
  const header = columns.map(c => csvCell(c.header)).join(';')
  const lines = rows.map(r => columns.map(c => csvCell(c.value ? c.value(r) : (r as Record<string, unknown>)[c.key] as string | number ?? '')).join(';'))
  return `\uFEFF${[header, ...lines].join('\r\n')}`
}

export function downloadFile(nombre: string, contenido: string, mimeType = 'text/csv;charset=utf-8'): void {
  const blob = new Blob([contenido], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function exportCSV<T>(nombre: string, rows: T[], columns: ExportColumn<T>[]): void {
  downloadFile(`${nombre}.csv`, toCSV(rows, columns))
}

const PRINT_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif; color: #111; padding: 28px 32px; }
  h1 { font-size: 20px; margin-bottom: 2px; }
  .sub { font-size: 12px; color: #555; margin-bottom: 18px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
  th { background: #f0f0f0; text-align: left; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; padding: 8px; border-bottom: 2px solid #333; }
  td { font-size: 12px; padding: 7px 8px; border-bottom: 1px solid #e5e5e5; }
  tr:last-child td { border-bottom: none; }
  .num { text-align: right; font-variant-numeric: tabular-nums; }
  .pos { color: #047857; } .neg { color: #b91c1c; }
  .cards { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 20px; }
  .card { border: 1px solid #ddd; border-radius: 8px; padding: 10px 14px; min-width: 150px; }
  .card .lbl { font-size: 10px; text-transform: uppercase; color: #666; letter-spacing: .05em; }
  .card .val { font-size: 17px; font-weight: 700; margin-top: 2px; }
  footer { margin-top: 24px; font-size: 10px; color: #888; display: flex; justify-content: space-between; }
  @page { margin: 14mm; }
`

/**
 * Abre ventana de impresión con el reporte maquetado (PDF listo para impresión
 * mediante "Guardar como PDF" del navegador).
 */
export function exportPDF(titulo: string, opts: {
  empresa?: string
  subtitulo?: string
  cards?: { label: string; value: string; tone?: 'pos' | 'neg' }[]
  tablas?: { titulo?: string; columnas: string[]; numericas?: number[]; filas: (string | number)[][] }[]
}): void {
  const esc = (s: string | number) => String(s ?? '').replace(/[<>&]/g, ch => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch] as string))
  const cardsHtml = opts.cards?.length
    ? `<div class="cards">${opts.cards.map(c => `<div class="card"><div class="lbl">${esc(c.label)}</div><div class="val ${c.tone ?? ''}">${esc(c.value)}</div></div>`).join('')}</div>`
    : ''
  const tablasHtml = (opts.tablas ?? []).map(t => `
    ${t.titulo ? `<h2 style="font-size:14px;margin:16px 0 8px;">${esc(t.titulo)}</h2>` : ''}
    <table><thead><tr>${t.columnas.map((c, i) => `<th class="${t.numericas?.includes(i) ? 'num' : ''}">${esc(c)}</th>`).join('')}</tr></thead>
    <tbody>${t.filas.map(f => `<tr>${f.map((v, i) => `<td class="${t.numericas?.includes(i) ? `num ${/^-/.test(String(v)) ? 'neg' : ''}` : ''}">${typeof v === 'number' ? v.toLocaleString() : esc(v)}</td>`).join('')}</tr>`).join('')}</tbody></table>`).join('')
  const hoy = new Date().toLocaleDateString()

  const win = window.open('', '_blank', 'width=900,height=700')
  if (!win) throw new Error('No se pudo abrir la ventana de impresión (revisa el bloqueador de pop-ups)')
  win.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>${esc(titulo)}</title><style>${PRINT_STYLES}</style></head>
    <body>
      <h1>${esc(titulo)}</h1>
      <div class="sub">${esc(opts.empresa ?? '')}${opts.empresa && opts.subtitulo ? ' — ' : ''}${esc(opts.subtitulo ?? '')} · Generado: ${hoy}</div>
      ${cardsHtml}${tablasHtml}
      <footer><span>FinanceTracker</span><span>Documento generado automáticamente</span></footer>
    </body></html>`)
  win.document.close()
  win.focus()
  setTimeout(() => { win.print() }, 350)
}
