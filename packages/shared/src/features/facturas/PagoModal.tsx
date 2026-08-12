import React, { useState } from 'react'
import { Dialog, Button, Input, Select } from '../../ui/components'
import { useRegisterPago, useConfig } from '../../store/queries'
import { formatMoney } from '../../currency'

export function PagoModal({ origen, onClose }: { origen: { id: string; tipo: 'cobro' | 'abono'; saldo: number }; onClose: () => void }) {
  const registerPago = useRegisterPago()
  const { config } = useConfig()
  const [monto, setMonto] = useState('')
  const [metodo, setMetodo] = useState('Efectivo')
  const [error, setError] = useState('')
  const moneda = config?.moneda ?? 'USD'

  const submit = async () => {
    const n = Number(monto)
    if (!n || n <= 0) return setError('Monto inválido')
    if (n > origen.saldo) return setError(`Supera saldo disponible (${formatMoney(origen.saldo, moneda)})`)
    try {
      await registerPago.mutateAsync({ tipo: origen.tipo, id_origen: origen.id, fecha: new Date().toISOString().slice(0, 10), monto: n, metodo_pago: metodo as never, notas: '' })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    }
  }

  return (
    <Dialog open onClose={onClose} title={origen.tipo === 'cobro' ? 'Registrar cobro' : 'Registrar abono'}
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Guardar pago</Button></>}>
      <div className="space-y-3">
        <p className="text-sm">Saldo disponible: <b>{formatMoney(origen.saldo, moneda)}</b></p>
        <div><label className="text-xs text-gray-500">Monto</label><Input type="number" value={monto} onChange={e => setMonto(e.target.value)} /></div>
        <div><label className="text-xs text-gray-500">Método</label>
          <Select value={metodo} onChange={setMetodo} options={['Efectivo', 'Transferencia', 'Tarjeta'].map(v => ({ value: v, label: v }))} />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Dialog>
  )
}
