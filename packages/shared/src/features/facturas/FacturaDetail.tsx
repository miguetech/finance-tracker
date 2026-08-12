import React, { useEffect, useState } from 'react'
import { Dialog, Button, Table } from '../../ui/components'
import { InvoicePrint } from '../../ui/print/InvoicePrint'
import { useFactura, usePagos, useConfig } from '../../store/queries'
import { formatMoney } from '../../currency'
import { PagoModal } from './PagoModal'

export function printInvoice(det: { factura: { folio: string } }) {
  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) return
  const node = document.getElementById('invoice-print')
  if (!node) return
  w.document.write('<html><head><title>Factura ' + det.factura.folio + '</title><style>body{font-family:system-ui,sans-serif;padding:2rem;color:#111}table{width:100%;border-collapse:collapse}th,td{padding:.5rem;text-align:left;border-bottom:1px solid #ddd}@media print{body{padding:0}}</style></head><body>')
  w.document.write(node.innerHTML)
  w.document.write('</body></html>')
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 200)
}

export function FacturaDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: det, isLoading } = useFactura(id)
  const { data: pagos = [] } = usePagos(id)
  const { config } = useConfig()
  const [pagoOpen, setPagoOpen] = useState(false)
  const moneda = config?.moneda ?? 'USD'
  if (isLoading || !det) return null
  const { factura, items } = det

  return (
    <Dialog open onClose={onClose} title={`Factura ${factura.folio}`}
      footer={<>
        <Button variant="outline" onClick={() => printInvoice(det)}>Descargar PDF</Button>
        {factura.saldo > 0 && <Button onClick={() => setPagoOpen(true)}>Registrar cobro</Button>}
        <Button variant="outline" onClick={onClose}>Cerrar</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>Cliente: <b>{factura.nombre_cliente}</b></div>
          <div>Emisión: {factura.fecha_emision}</div>
          <div>Vence: {factura.fecha_vencimiento || '—'}</div>
          <div>Estado: <b>{factura.saldo <= 0 ? 'Pagada' : factura.fecha_pago ? 'Parcial' : 'Pendiente'}</b></div>
        </div>
        <Table columns={[
          { key: 'd', header: 'Descripción', render: r => String(r.descripcion) },
          { key: 'c', header: 'Cant', render: r => String(r.cantidad) },
          { key: 'p', header: 'Precio', render: r => formatMoney(Number(r.precio_unitario), moneda) },
          { key: 'i', header: 'Importe', render: r => formatMoney(Number(r.importe), moneda) }
        ]} rows={items as unknown as Record<string, unknown>[]} />
        <div className="flex justify-end gap-6 text-sm">
          <div>Subtotal: <b>{formatMoney(factura.subtotal, moneda)}</b></div>
          <div>IVA: <b>{formatMoney(factura.iva, moneda)}</b></div>
          <div>Total: <b>{formatMoney(factura.total, moneda)}</b></div>
          <div>Saldo: <b>{formatMoney(factura.saldo, moneda)}</b></div>
        </div>
        {pagos.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-1">Pagos registrados</div>
            {pagos.map(p => (
              <div key={p.id_pago} className="flex justify-between text-sm border-b border-gray-50 py-1">
                <span>{p.fecha} · {p.metodo_pago}</span><span>{formatMoney(p.monto, moneda)}</span>
              </div>
            ))}
          </div>
        )}
        {config && <InvoicePrint factura={factura} items={items} config={config} />}
      </div>
      {pagoOpen && <PagoModal origen={{ id: factura.id_factura, tipo: 'cobro', saldo: factura.saldo }} onClose={() => { setPagoOpen(false); onClose() }} />}
    </Dialog>
  )
}
