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
import { HistorialAbonos } from './HistorialAbonos'

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
  const { customers } = useClientes()
  const { isAdmin } = usePerms()
  const [pagoOpen, setPagoOpen] = useState(false)
  const [editando, setEditando] = useState(false)
  const monedaBase = config?.currency ?? 'USD'
  if (isLoading || !det) return null
  const { factura, items } = det
  const cliente = customers.find(c => c.customer_id === factura.customer_id)
  const currency = factura.currency || monedaBase
  const tienePagos = pagos.length > 0
  const status = estadoDesdeSaldo(factura.balance, factura.total, tienePagos)
  const estadoLabel = status === 'paid' ? t('states.pagada') : status === 'partial' ? t('states.parcial') : t('states.pendiente')

  return (
    <Dialog open onClose={onClose} title={`${t('facturas.factura')} ${factura.serial}`}
      footer={<>
        <Button variant="outline" onClick={() => printInvoice(t('facturas.factura') + ' ' + factura.serial)}>{t('facturas.descargar')}</Button>
        {isAdmin && <Button variant="outline" onClick={() => setEditando(true)}>{t('common.editar')}</Button>}
        {factura.balance > 0 && isAdmin && <Button onClick={() => setPagoOpen(true)}>{t('facturas.registrarCobro')}</Button>}
        <Button variant="outline" onClick={onClose}>{t('common.cerrar')}</Button>
      </>}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>{t('facturas.cliente')}: <b>{factura.customer_name}</b></div>
          <div>{t('facturas.emision')}: {factura.issue_date}</div>
          <div>{t('facturas.vence')}: {factura.due_date || '—'}</div>
          <div>{t('common.estado')}: <b>{estadoLabel}</b> {factura.currency && <span className="text-xs text-gray-500">· {factura.currency}</span>}</div>
        </div>
        {String(factura.edited) === 'true' && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            {t('facturas.fueEditada')} <b>{t('common.editada')}</b> {t('facturas.fueEditadaEl')} {factura.edited_at || '—'}.
          </p>
        )}
        <Table columns={[
          { key: 'd', header: t('facturas.descripcion'), render: r => String(r.description) },
          { key: 'c', header: t('facturas.cant'), render: r => String(r.quantity) },
          { key: 'p', header: t('facturas.precio'), render: r => formatMoney(Number(r.unit_price), currency) },
          { key: 'i', header: t('facturas.importe'), render: r => formatMoney(Number(r.importe), currency) }
        ]} rows={items as unknown as Record<string, unknown>[]} />
        <div className="flex flex-wrap justify-end gap-x-6 gap-y-1 text-sm">
          <div>{t('facturas.subtotal')}: <b>{formatMoney(factura.subtotal, currency)}</b></div>
          <div>{t('facturas.iva')}: <b>{formatMoney(factura.vat, currency)}</b></div>
          <div>{t('facturas.total')}: <b>{formatMoney(factura.total, currency)}</b></div>
          <div>{t('facturas.saldo')}: <b>{formatMoney(factura.balance, currency)}</b></div>
          {currency !== monedaBase && config && <div className="w-full text-xs text-gray-500">{t('facturas.equivalente', { currency: monedaBase })}: {formatMoneyConverted(factura.total, currency, monedaBase, config)}</div>}
        </div>
        {pagos.length > 0 && (
          <HistorialAbonos pagos={pagos} totalDoc={factura.total} monedaDoc={currency} />
        )}
        {config && <InvoicePrint factura={factura} items={items} config={config} cliente={cliente} />}
      </div>
      {pagoOpen && <PagoModal origen={{ id: factura.invoice_id, type: 'payment', balance: factura.balance, currency }} onClose={() => { setPagoOpen(false); onClose() }} />}
      {editando && <FacturaEditModal factura={factura} onClose={() => setEditando(false)} />}
    </Dialog>
  )
}
