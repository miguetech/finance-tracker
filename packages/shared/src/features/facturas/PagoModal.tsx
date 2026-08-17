import React, { useState } from 'react'
import { todayLocal } from '../../lib/date'
import { Dialog, Button, Input, Select } from '../../ui/components'
import { useRegisterPago, useConfig, useMetodosPago } from '../../store/queries'
import { formatMoney } from '../../currency'
import { useI18n } from '../../i18n'

export function PagoModal({ origen, onClose }: { origen: { id: string; tipo: 'cobro' | 'abono'; saldo: number; moneda?: string }; onClose: () => void }) {
  const { t } = useI18n()
  const registerPago = useRegisterPago()
  const { config } = useConfig()
  const metodos = useMetodosPago()
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState(metodos[0] ?? 'Efectivo')
  const [error, setError] = useState('')
  const moneda = origen.moneda || config?.moneda || 'USD'

  const submit = async () => {
    const n = Number(monto)
    if (!n || n <= 0) return setError(t('pago.montoInvalido'))
    if (n > origen.saldo) return setError(`${t('pago.superaSaldo')} (${formatMoney(origen.saldo, moneda)})`)
    try {
      await registerPago.mutateAsync({ tipo: origen.tipo, id_origen: origen.id, fecha: todayLocal(), monto: n, metodo_pago: metodo, notas: '' })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Dialog open onClose={onClose} title={origen.tipo === 'cobro' ? t('facturas.registrarCobro') : t('cuentas.registrarAbono')}
      footer={<><Button variant="outline" onClick={onClose}>{t('common.cancelar')}</Button><Button onClick={submit}>{t('common.guardarPago')}</Button></>}>
      <div className="space-y-3">
        <p className="text-sm">{t('pago.saldoDisponible')} <b>{formatMoney(origen.saldo, moneda)}</b> {origen.moneda && <span className="text-xs text-gray-500">({origen.moneda})</span>}</p>
        <div><label className="text-xs text-gray-500">{t('common.monto')}</label><Input type="number" value={monto} onChange={e => setMonto(e.target.value)} /></div>
        <div><label className="text-xs text-gray-500">{t('common.metodo')}</label>
          <Select value={metodo} onChange={setMetodo} options={metodos.map(v => ({ value: v, label: v }))} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Dialog>
  )
}
