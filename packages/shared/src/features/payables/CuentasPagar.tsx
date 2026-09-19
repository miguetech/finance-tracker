import React, { useState } from 'react'
import { todayLocal } from '../../lib/date'
import { useCxp, useConfig } from '../../store/queries'
import { Table, Button, Select, ConfirmDialog, Badge, StatCard } from '../../ui/components'
import { useToast } from '../../ui/components'
import { usePerms } from '../../store/perms'
import { formatMoneyConverted } from '../../currency'
import { IconPlus, IconTrash } from '../../ui/icons'
import { useI18n } from '../../i18n'
import { CxpFormModal } from './CxpFormModal'
import { CxpDetail } from './CxpDetail'

export function CuentasPagar() {
  const { t } = useI18n()
  const { payables, deletePayable } = useCxp()
  const { config } = useConfig()
  const { canEdit, isAdmin } = usePerms()
  const toast = useToast()
  const [status, setEstado] = useState('')
  const [verPagadas, setVerPagadas] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const currency = config?.currency ?? 'USD'
  const hoy = todayLocal()
  // Las facturas con balance cero se archivan automáticamente de la vista principal.
  const ocultarPagadas = !verPagadas && status !== 'paid'
  const filtrados = payables
    .filter(c => !status || c.status === status)
    .filter(c => !ocultarPagadas || Number(c.balance) > 0)
  const pagadasCount = payables.filter(c => Number(c.balance) <= 0).length
  const tone = (c: { balance: number; status: string; due_date: string }) =>
    c.balance <= 0 ? 'green' as const
    : c.due_date && c.due_date < hoy ? 'red' as const
    : c.status === 'partial' ? 'yellow' as const
    : 'blue' as const
  const estadoLabel = (c: { balance: number; status: string; due_date: string }) =>
    c.balance <= 0 ? t('states.pagada') : c.due_date && c.due_date < hoy ? t('states.vencida') : c.status === 'partial' ? t('states.parcial') : t('states.pendiente')

  const totalPorPagar = payables.filter(c => c.balance > 0).reduce((s, c) => s + (Number(c.total_amount) || 0) / (Number(c.exchange_rate) || 1), 0)
  const totalVencidas = payables.filter(c => c.balance > 0 && c.due_date < hoy).reduce((s, c) => s + (Number(c.balance) || 0) / (Number(c.exchange_rate) || 1), 0)

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t('cuentas.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('cuentas.subtitulo')}</p>
        </div>
        <div className="flex gap-2 items-center">
          {pagadasCount > 0 && (
            <label className="flex items-center gap-1.5 text-sm text-muted-foreground cursor-pointer">
              <input type="checkbox" className="h-4 w-4" checked={verPagadas} onChange={e => setVerPagadas(e.target.checked)} />
              {t('cuentas.mostrarPagadas')} ({pagadasCount})
            </label>
          )}
          <Select value={status} onChange={setEstado} options={[{ value: 'pending', label: t('states.pendiente') }, { value: 'partial', label: t('states.parcial') }, { value: 'paid', label: t('states.pagada') }]} placeholder={t('common.estado')} />
          {canEdit('payables') && (<Button icon={<IconPlus className="w-4 h-4" />} onClick={() => setFormOpen(true)}>{t('cuentas.nuevaCxp')}</Button>)}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label={t('cuentas.totalPorPagar')} value={formatMoneyConverted(totalPorPagar, currency, currency, config)} />
        <StatCard label={t('states.vencidas')} value={formatMoneyConverted(totalVencidas, currency, currency, config)} tone="negative" />
        <StatCard label={t('cuentas.activas')} value={String(payables.filter(c => c.balance > 0).length)} />
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
        <Table columns={[
          { key: 'prov', header: t('cuentas.proveedor'), render: r => String(r.supplier_name) },
          { key: 'desc', header: t('cuentas.descripcion'), render: r => String(r.description) },
          { key: 'venc', header: t('cuentas.vence'), render: r => <span className={String(r.due_date) < hoy && Number(r.balance) > 0 ? 'text-red-600 font-medium' : ''}>{String(r.due_date)}</span> },
          { key: 'total', header: t('facturas.total'), render: r => formatMoneyConverted(Number(r.total_amount), String(r.currency), currency, config) },
          { key: 'saldo', header: t('facturas.saldo'), render: r => formatMoneyConverted(Number(r.balance), String(r.currency), currency, config) },
          { key: 'estado', header: t('common.estado'), render: r => { const c = r as { balance: number; status: string; due_date: string }; return <Badge tone={tone(c)}>{estadoLabel(c)}</Badge> } },
          { key: 'acciones', header: '', render: r => (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDetalleId(String(r.ap_id))}>{t('facturas.ver')}</Button>
              {isAdmin && (<Button variant="danger" icon={<IconTrash className="w-4 h-4" />} onClick={() => setDeleteId(String(r.ap_id))}>{t('common.eliminar')}</Button>)}
            </div>
          ) }
        ]} rows={filtrados as unknown as Record<string, unknown>[]} />
        {filtrados.length === 0 && <p className="p-4 text-sm text-gray-500">{t('cuentas.sinCxp')}</p>}
      </div>
      <CxpFormModal open={formOpen} onClose={() => setFormOpen(false)} />
      {detalleId && <CxpDetail id={detalleId} onClose={() => setDetalleId(null)} />}
      <ConfirmDialog open={deleteId !== null} title={t('cuentas.eliminarTitulo')} message={t('cuentas.eliminarMensaje')}
        onConfirm={async () => {
          if (deleteId) {
            try { await deletePayable.mutateAsync(deleteId); toast(t('cuentas.eliminada')) }
            catch (e) { toast((e as Error).message, 'error') }
          }
          setDeleteId(null)
        }} onClose={() => setDeleteId(null)} />
    </div>
  )
}
