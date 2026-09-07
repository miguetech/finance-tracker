import type { EspejoStore, Row } from './espejo'

export async function migrarFacturaItemsLinea(store: EspejoStore): Promise<void> {
  const rows = await store.getAllRowsWithRowid('Factura_Items')
  if (rows.length === 0) return
  
  const hasLinea = rows.some(r => typeof r.linea === 'number' && r.linea > 0)
  if (hasLinea) return
  
  const byFactura = new Map<string, (Row & { rowid: number })[]>()
  for (const r of rows) {
    const id = String(r.id_factura)
    if (!byFactura.has(id)) byFactura.set(id, [])
    byFactura.get(id)!.push(r)
  }
  
  const migrated: Row[] = []
  for (const [, items] of byFactura) {
    items.sort((a, b) => a.rowid - b.rowid)
    items.forEach((item, i) => {
      const { rowid, ...rest } = item
      migrated.push({ ...rest, linea: i + 1 })
    })
  }
  
  await store.clearTable('Factura_Items')
  await store.replaceTable('Factura_Items', migrated)
}