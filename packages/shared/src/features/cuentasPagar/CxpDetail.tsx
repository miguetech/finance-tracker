import React, { useState } from 'react'
import { Dialog, Button } from '../../ui/components'
import { useCxpById, usePagos, useConfig } from '../../store/queries'
import { formatMoney } from '../../currency'
import { PagoModal } from '../facturas/PagoModal'

export function CxpDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { data: det } = useCxpById(id)
  const { data: pagos = [] } = usePagos(id)
  const { config } = useConfig()
  const [abonoOpen, setAbonoOpen] = useState(false)
  const moneda = config?.moneda ?? 'USD'
  if (!det) return null
  const cxp = det.factura
  return (
    <Dialog open onClose={onClose} title={`CXP ${cxp.folio_documento || cxp.id_cxp}`}
      footer={<>
        {cxp.saldo > 0 && <Button onClick={() => setAbonoOpen(true)}>Registrar abono</Button>}
        <Button variant="outline" onClick={onClose}>Cerrar</Button>
      </>}>
      <div className="space-y-3 text-sm">
        <div>Proveedor: <b>{cxp.nombre_proveedor}</b></div>
        <div>Descripción: {cxp.descripcion}</div>
        <div className="flex justify-between"><span>Total</span><b>{formatMoney(cxp.monto_total, moneda)}</b></div>
        <div className="flex justify-between"><span>Saldo</span><b>{formatMoney(cxp.saldo, moneda)}</b></div>
        {pagos.map(p => (
          <div key={p.id_pago} className="flex justify-between border-b border-gray-50 py-1"><span>{p.fecha} · {p.metodo_pago}</span><span>{formatMoney(p.monto, moneda)}</span></div>
        ))}
      </div>
      {abonoOpen && <PagoModal origen={{ id: cxp.id_cxp, tipo: 'abono', saldo: cxp.saldo }} onClose={() => { setAbonoOpen(false); onClose() }} />}
    </Dialog>
  )
}
