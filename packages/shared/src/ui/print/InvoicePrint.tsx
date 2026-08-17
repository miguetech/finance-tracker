import React from 'react'
import type { Factura, FacturaItem, Config } from '../../types/entities'
import { formatMoney } from '../../currency'

export function InvoicePrint({ factura, items, config, cliente }: { factura: Factura; items: FacturaItem[]; config: Config; cliente?: { rfc?: string; email?: string; telefono?: string; direccion?: string } }) {
  const moneda = factura.moneda || config.moneda
  return (
    <div id="invoice-print">
      <div className="print-header flex justify-between items-start mb-6">
        <div>
          <h1 className="text-xl font-bold">{config.empresa_nombre}</h1>
          <p>{config.empresa_rfc}</p>
          <p>{[config.empresa_direccion, config.empresa_cp].filter(Boolean).join(', ')}</p>
          <p>{[config.empresa_ciudad, config.empresa_pais].filter(Boolean).join(', ')}</p>
          <p>{config.empresa_telefono} {config.empresa_email}</p>
        </div>
        {config.empresa_logo && <img src={config.empresa_logo} alt="logo" className="h-16" />}
        <div className="text-right">
          <div className="text-lg font-bold">Factura {factura.folio}</div>
          <p>Fecha emisión: {factura.fecha_emision}</p>
          {factura.fecha_vencimiento && <p>Vence: {factura.fecha_vencimiento}</p>}
        </div>
      </div>
      <div className="mb-6">
        <div className="font-semibold">Cliente</div>
        <p>{factura.nombre_cliente}</p>
        {cliente?.rfc && <p>{cliente.rfc}</p>}
        {cliente?.direccion && <p>{cliente.direccion}</p>}
        {(cliente?.telefono || cliente?.email) && <p>{[cliente?.telefono, cliente?.email].filter(Boolean).join(' · ')}</p>}
      </div>
      <table className="w-full text-sm mb-6">
        <thead className="border-b border-gray-300"><tr><th className="text-left py-2">Descripción</th><th>Cant</th><th>Precio</th><th className="text-right">Importe</th></tr></thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={i} className="border-b border-gray-100">
              <td className="py-2">{it.descripcion}</td>
              <td>{it.cantidad}</td>
              <td>{formatMoney(it.precio_unitario, moneda)}</td>
              <td className="text-right">{formatMoney(it.importe, moneda)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex justify-end gap-8">
        <div>
          <div>Subtotal: {formatMoney(factura.subtotal, moneda)}</div>
          <div>IVA ({config.iva_porcentaje}%): {formatMoney(factura.iva, moneda)}</div>
          <div className="font-bold text-lg">Total: {formatMoney(factura.total, moneda)}</div>
        </div>
      </div>
      {factura.notas && <div className="mt-6 text-sm text-gray-600">Notas: {factura.notas}</div>}
      {String(factura.editada) === 'true' && <div className="mt-4 text-xs text-gray-500 italic">Documento editado el {factura.fecha_edicion || '—'}</div>}
    </div>
  )
}
