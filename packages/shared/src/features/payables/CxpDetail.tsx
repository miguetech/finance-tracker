import React, { useState } from 'react'
import { Dialog, Button } from '../../ui/components'
import { useCxpById, usePagos, useConfig } from '../../store/queries'
import { usePerms } from '../../store/perms'
import { formatMoney } from '../../currency'
import { useI18n } from '../../i18n'
import { PagoModal } from '../invoices/PagoModal'
import { HistorialAbonos } from '../invoices/HistorialAbonos'

export function CxpDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const { t } = useI18n()
  const { data: det } = useCxpById(id)
  const { data: pagos = [] } = usePagos(id)
  const { config } = useConfig()
  const { isAdmin } = usePerms()
  const [abonoOpen, setAbonoOpen] = useState(false)
  const currency = config?.currency ?? 'USD'
  if (!det) return null
  const ap = det
  const monedaCxp = ap.currency || currency
  return (
    <Dialog open onClose={onClose} title={`${t('cuentas.cxpAbrev')} ${ap.document_serial || ap.ap_id}`}
      footer={<>
        {ap.balance > 0 && isAdmin && <Button onClick={() => setAbonoOpen(true)}>{t('cuentas.registrarAbono')}</Button>}
        <Button variant="outline" onClick={onClose}>{t('common.cerrar')}</Button>
      </>}>
      <div className="space-y-3 text-sm">
        <div>{t('cuentas.proveedor')}: <b>{ap.supplier_name}</b></div>
        <div>{t('cuentas.descripcion')}: {ap.description}</div>
        <div className="flex justify-between"><span>{t('facturas.total')}</span><b>{formatMoney(ap.total_amount, monedaCxp)}</b></div>
        <div className="flex justify-between"><span>{t('facturas.saldo')}</span><b>{formatMoney(ap.balance, monedaCxp)}</b></div>
        <HistorialAbonos pagos={pagos} totalDoc={ap.total_amount} monedaDoc={monedaCxp} />
      </div>
      {abonoOpen && <PagoModal origen={{ id: ap.ap_id, type: 'partial', balance: ap.balance, currency: monedaCxp }} onClose={() => { setAbonoOpen(false); onClose() }} />}
    </Dialog>
  )
}
