# Apps Script Changes for Factura_Items linea Column

## Required Change in `fetchTablas` function

When downloading `Factura_Items` tab, number rows sequentially per `id_factura`:

```javascript
function fetchFacturaItems() {
  const hoja = SpreadsheetApp.getActive().getSheetByName('Factura_Items')
  const datos = hoja.getDataRange().getValues()
  const headers = datos[0]
  
  // Find column indices
  const idxIdFactura = headers.indexOf('id_factura')
  const idxLinea = headers.indexOf('linea')
  
  const filas = datos.slice(1)
  
  // Group by id_factura and assign linea
  const porFactura = {}
  for (const f of filas) {
    const id = f[idxIdFactura]
    if (!porFactura[id]) porFactura[id] = []
    porFactura[id].push(f)
  }
  
  const resultado = []
  for (const [idFact, items] of Object.entries(porFactura)) {
    items.forEach((item, i) => {
      item[idxLinea] = i + 1  // write linea back to array
      resultado.push(objectFromRow(headers, item))
    })
  }
  return resultado
}
```

## Deployment

1. Add `linea` column in all existing Spreadsheets (column B in Factura_Items tab)
2. Update Apps Script code
3. Deploy new version
4. Run one-time migration in Apps Script to backfill `linea` for existing rows