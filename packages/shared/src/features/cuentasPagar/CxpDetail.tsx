import React, { useState } from 'react'
import { Dialog, Button } from '../../ui/components'
import { useCxpById, usePagos, useConfig } from '../../store/queries'
import { usePerms } from '../../store/perms'
import { formatMoney } from '../../currency'
import { useI18n } from '../../i18n'
import { PagoModal } from '../facturas/PagoModal'
import { HistorialAbonos } from '../facturas/HistorialAbonos'

export function CxpDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useI18n()
  const { data: det } = useCxpById(id)
  const { data: pagos = [] } = usePagos(id)
  const { config } = useConfig()
  const { isAdmin } = usePerms()
  const [abonoOpen, setAbonoOpen] = useState(false)
  const moneda = config?.moneda ?? 'USD'
  if (!det) return null
  const cxp = det
  const monedaCxp = cxp.moneda || moneda
  return (
    <Dialog open onClose={onClose} title={`${t('cuentas.cxpAbrev')} ${cxp.folio_documento || cxp.id_cxp}`}
      footer={<>
        {cxp.saldo > 0 && isAdmin && <Button onClick={() => setAbonoOpen(true)}>{t('cuentas.registrarAbono')}</Button>}
        <Button variant="outline" onClick={onClose}>{t('common.cerrar')}</Button>
      </>}>
      <div className="space-y-3 text-sm">
        <div>{t('cuentas.proveedor')}: <b>{cxp.nombre_proveedor}</b></div>
        <div>{t('cuentas.descripcion')}: {cxp.descripcion}</div>
        <div className="flex justify-between"><span>{t('facturas.total')}</span><b>{formatMoney(cxp.monto_total, monedaCxp)}</b></div>
        <div className="flex justify-between"><span>{t('facturas.saldo')}</span><b>{formatMoney(cxp.saldo, monedaCxp)}</b></div>
        <HistorialAbonos pagos={pagos} totalDoc={cxp.monto_total} monedaDoc={monedaCxp} />
      </div>
      {abonoOpen && <PagoModal origen={{ id: cxp.id_cxp, tipo: 'abono', saldo: cxp.saldo, moneda: monedaCxp }} onClose={() => { setAbonoOpen(false); onClose() }} />}
    </Dialog>
  )
}
