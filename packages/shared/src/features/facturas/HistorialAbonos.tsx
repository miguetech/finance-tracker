import React from 'react'
import type { Pago } from '../../types/entities'
import { formatMoney, convert } from '../../currency'
import { useConfig } from '../../store/queries'
import { useI18n } from '../../i18n'

/** Historial cronológico de abonos/cobros de un documento, con equivalencia
 *  a la moneda del documento y saldo restante acumulado. */
export function HistorialAbonos({ pagos, totalDoc, monedaDoc }: {
  pagos: Pago[]
  totalDoc: number
  monedaDoc: string
}) {
  const { t } = useI18n()
  const { config } = useConfig()
  if (pagos.length === 0) return null

  const ordenados = [...pagos].sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)))
  let restante = Number(totalDoc) || 0

  return (
    <div>
      <div className="text-xs text-gray-500 mb-1">{t('historial.abonos')}</div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase text-muted-foreground text-left">
            <th className="py-1 font-medium">{t('common.fecha')}</th>
            <th className="py-1 font-medium">{t('facturas.metodoPago')}</th>
            <th className="py-1 font-medium text-right">{t('common.monto')}</th>
            {ordenados.some(p => (p.moneda || monedaDoc) !== monedaDoc) && (
              <th className="py-1 font-medium text-right">{monedaDoc}</th>
            )}
            <th className="py-1 font-medium text-right">{t('historial.saldoRestante')}</th>
          </tr>
        </thead>
        <tbody>
          {ordenados.map(p => {
            const monedaPago = p.moneda || monedaDoc
            const convertido = convert(Number(p.monto) || 0, monedaPago, monedaDoc, config)
            restante = Math.round((restante - convertido) * 100) / 100
            return (
              <tr key={p.payment_id} className="border-b border-gray-50">
                <td className="py-1 whitespace-nowrap">{String(p.fecha)}</td>
                <td className="py-1">{p.payment_method}</td>
                <td className="py-1 text-right tabular-nums">
                  {formatMoney(Number(p.monto), monedaPago)}
                  {monedaPago !== monedaDoc && <span className="text-xs text-gray-400"> ({monedaPago})</span>}
                </td>
                {ordenados.some(x => (x.moneda || monedaDoc) !== monedaDoc) && (
                  <td className="py-1 text-right tabular-nums text-gray-500">
                    {monedaPago !== monedaDoc ? `≈ ${formatMoney(convertido, monedaDoc)}` : '—'}
                  </td>
                )}
                <td className="py-1 text-right tabular-nums">{formatMoney(restante, monedaDoc)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
