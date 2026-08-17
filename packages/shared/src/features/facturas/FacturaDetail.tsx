import React, { useState } from 'react'
import { Dialog, Button, Table } from '../../ui/components'
import { InvoicePrint } from '../../ui/print/InvoicePrint'
import { useFactura, usePagos, useConfig, useClientes } from '../../store/queries'
import { usePerms } from '../../store/perms'
import { formatMoney, formatMoneyConverted } from '../../currency'
import { estadoDesdeSaldo } from '../../calc/invoice'
import { useI18n } from '../../i18n'
import { PagoModal } from './PagoModal'
import { FacturaEditModal } from './FacturaEditModal'

export function printInvoice(title: string) {
  const w = window.open('', '_blank', 'width=900,height=700')
  if (!w) return
  const node = document.getElementById('invoice-print')
  if (!node) return
  w.document.write('<html><head><title>' + title + '</title><style>body{font-family:system-ui,sans-serif;padding:2rem;color:#111}table{width:100%;border-collapse:collapse}th,td{padding:.5rem;text-align:left;border-bottom:1px solid #ddd}@media print{body{padding:0}}</style></head><body>')
  w.document.write(node.innerHTML)
  w.document.write('</body></html>')
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 200)
}

export function FacturaDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useI18n()
  const { data: det, isLoading } = useFactura(id)
  const { data: pagos = [] } = usePagos(id)
  const { config } = useConfig()
  const { clientes } = useClientes()
  const { isAdmin } = usePerms()
  const [pagoOpen, setPagoOpen] = useState(false)
  const [editando, setEditando] = useState(false)
  const monedaBase = config?.moneda ?? 'USD'
  if (isLoading || !det) return null
  const { factura, items } = det
  const cliente = clientes.find(c => c.id_cliente === factura.id_cliente)
  const moneda = factura.moneda || monedaBase
  const tienePagos = pagos.length > 0
  const estado = estadoDesdeSaldo(factura.saldo, factura.total, tienePagos)
  const estadoLabel = estado === 'pagada' ? t('states.pagada') : estado === 'parcial' ? t('states.parcial') : t('states.pendiente')

  return (
    <Dialog open onClose={onClose} title={`${t('facturas.factura')} ${factura.folio}`}
      footer={<>
        <Button variant="outline" onClick={() => printInvoice(t('facturas.factura') + ' ' + factura.folio)}>{t('facturas.descargar')}</Button>
        {isAdmin && <Button variant="outline" onClick={() => setEditando(true)}>{t('common.editar')}</Button>}
        {factura.saldo > 0 && isAdmin && <Button onClick={() => setPagoOpen(true)}>{t('facturas.registrarCobro')}</Button>}
        <Button variant="outline" onClick={onClose}>{t('common.cerrar')}</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>{t('facturas.cliente')}: <b>{factura.nombre_cliente}</b></div>
          <div>{t('facturas.emision')}: {factura.fecha_emision}</div>
          <div>{t('facturas.vence')}: {factura.fecha_vencimiento || '—'}</div>
          <div>{t('common.estado')}: <b>{estadoLabel}</b> {factura.moneda && <span className="text-xs text-gray-500">· {factura.moneda}</span>}</div>
        </div>
        {String(factura.editada) === 'true' && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {t('facturas.fueEditada')} <b>{t('common.editada')}</b> {t('facturas.fueEditadaEl')} {factura.fecha_edicion || '—'}.
          </p>
        )}
        <Table columns={[
          { key: 'd', header: t('facturas.descripcion'), render: r => String(r.descripcion) },
          { key: 'c', header: t('facturas.cant'), render: r => String(r.cantidad) },
          { key: 'p', header: t('facturas.precio'), render: r => formatMoney(Number(r.precio_unitario), moneda) },
          { key: 'i', header: t('facturas.importe'), render: r => formatMoney(Number(r.importe), moneda) }
        ]} rows={items as unknown as Record<string, unknown>[]} />
        <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm">
          <div>{t('facturas.subtotal')}: <b>{formatMoney(factura.subtotal, moneda)}</b></div>
          <div>{t('facturas.iva')}: <b>{formatMoney(factura.iva, moneda)}</b></div>
          <div>{t('facturas.total')}: <b>{formatMoney(factura.total, moneda)}</b></div>
          <div>{t('facturas.saldo')}: <b>{formatMoney(factura.saldo, moneda)}</b></div>
          {moneda !== monedaBase && config && <div className="w-full text-xs text-gray-500">{t('facturas.equivalente', { moneda: monedaBase })}: {formatMoneyConverted(factura.total, moneda, monedaBase, config)}</div>}
        </div>
        {pagos.length > 0 && (
          <div>
            <div className="text-xs text-gray-500 mb-1">{t('facturas.pagosRegistrados')}</div>
            {pagos.map(p => (
              <div key={p.id_pago} className="flex justify-between text-sm border-b border-gray-50 py-1">
                <span>{p.fecha} · {p.metodo_pago}</span><span>{formatMoney(p.monto, p.moneda || moneda)}</span>
              </div>
            ))}
          </div>
        )}
        {config && <InvoicePrint factura={factura} items={items} config={config} cliente={cliente} />}
      </div>
      {pagoOpen && <PagoModal origen={{ id: factura.id_factura, tipo: 'cobro', saldo: factura.saldo, moneda }} onClose={() => { setPagoOpen(false); onClose() }} />}
      {editando && <FacturaEditModal factura={factura} onClose={() => setEditando(false)} />}
    </Dialog>
  )
}
