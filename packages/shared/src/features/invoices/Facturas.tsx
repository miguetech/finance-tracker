import React, { useState } from 'react'
import { useFacturas, useConfig } from '../../store/queries'
import { Table, Button, Select, ConfirmDialog, Badge, Input } from '../../ui/components'
import { useToast } from '../../ui/components'
import { usePerms } from '../../store/perms'
import { formatMoneyConverted } from '../../currency'
import { useI18n } from '../../i18n'
import { estadoDe } from '../../ui/estados'
import { IconPlus, IconTrash, IconEdit, IconCoins } from '../../ui/icons'
import { FacturaFormModal } from './FacturaFormModal'
import { FacturaDetail } from './FacturaDetail'
import { FacturaEditModal } from './FacturaEditModal'
import { VentaRapidaModal } from './VentaRapidaModal'
import type { Factura } from '../../types/entities'

export function Facturas() {
  const { t } = useI18n()
  const { facturas, deleteInvoice } = useFacturas({})
  const { config } = useConfig()
  const { canEdit, isAdmin } = usePerms()
  const toast = useToast()
  const [status, setEstado] = useState('')
  const [mes, setMes] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [ventaRapidaOpen, setVentaRapidaOpen] = useState(false)
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [editando, setEditando] = useState<Factura | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const currency = config?.currency ?? 'USD'
  const etiquetaEstado = (f: Factura) => {
    if (f.balance <= 0) return t('states.pagada')
    if (f.balance < f.total) return t('states.parcial')
    return t('states.pendiente')
  }

  const filtradas = facturas.filter(f => (!status || etiquetaEstado(f) === status) && (!mes || f.issue_date.slice(0, 7) === mes))

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <h1 className="text-xl font-bold">{t('facturas.title')}</h1>
        <div className="flex gap-2">
          <Select value={status} onChange={setEstado} options={[{ value: t('states.pendiente'), label: t('states.pendiente') }, { value: t('states.parcial'), label: t('states.parcial') }, { value: t('states.pagada'), label: t('states.pagada') }]} placeholder={t('common.estado')} />
          <Input type="month" value={mes} onChange={e => setMes(e.target.value)} />
          {canEdit('invoices') && (<>
            <Button variant="success" icon={<IconCoins className="w-4 h-4" />} onClick={() => setVentaRapidaOpen(true)}>{t('facturas.ventaRapida')}</Button>
            <Button icon={<IconPlus className="w-4 h-4" />} onClick={() => setFormOpen(true)}>{t('facturas.nueva')}</Button>
          </>)}
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
        <Table columns={[
          { key: 'folio', header: t('facturas.folio'), render: r => (
            <span className="inline-flex items-center gap-1.5">{String(r.serial)} {String(r.edited) === 'true' && <Badge tone="gray">{t('common.editada')}</Badge>}</span>
          ) },
          { key: 'cliente', header: t('facturas.cliente'), render: r => String(r.customer_name) },
          { key: 'emision', header: t('facturas.emision'), render: r => String(r.issue_date) },
          { key: 'total', header: t('facturas.total'), render: r => formatMoneyConverted(Number(r.total), String(r.currency), currency, config) },
          { key: 'saldo', header: t('facturas.saldo'), render: r => formatMoneyConverted(Number(r.balance), String(r.currency), currency, config) },
          { key: 'estado', header: t('common.estado'), render: r => { const e = estadoDe(r as { balance: number; total: number }); return <Badge tone={e.tone}>{t(e.key)}</Badge> } },
          { key: 'acciones', header: '', render: r => (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDetalleId(String(r.invoice_id))}>{t('facturas.ver')}</Button>
              {isAdmin && (<Button variant="ghost" icon={<IconEdit className="w-4 h-4" />} onClick={() => setEditando(r as unknown as Factura)}>{t('common.editar')}</Button>)}
              {isAdmin && (<Button variant="danger" icon={<IconTrash className="w-4 h-4" />} onClick={() => setDeleteId(String(r.invoice_id))}>{t('common.eliminar')}</Button>)}
            </div>
          ) }
        ]} rows={filtradas as unknown as Record<string, unknown>[]} />
        {filtradas.length === 0 && <p className="p-4 text-sm text-gray-500">{t('facturas.sinFacturas')}</p>}
      </div>
      <FacturaFormModal open={formOpen} onClose={() => setFormOpen(false)} onSaved={() => toast(t('facturas.creada'))} />
      <VentaRapidaModal open={ventaRapidaOpen} onClose={() => setVentaRapidaOpen(false)} onSaved={() => toast(t('facturas.ventaRegistrada'))} />
      {detalleId && <FacturaDetail id={detalleId} onClose={() => setDetalleId(null)} />}
      {editando && <FacturaEditModal factura={editando} onClose={() => setEditando(null)} />}
      <ConfirmDialog open={deleteId !== null} title={t('facturas.eliminarTitulo')} message={t('facturas.eliminarMensaje')}
        onConfirm={async () => { if (deleteId) { try { await deleteInvoice.mutateAsync(deleteId); toast(t('facturas.eliminada')) } catch (e) { toast((e as Error).message, 'error') } } setDeleteId(null) }}
        onClose={() => setDeleteId(null)} />
    </div>
  )
}
