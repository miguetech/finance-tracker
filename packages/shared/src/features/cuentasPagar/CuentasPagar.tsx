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
  const { cxps, deleteCxp } = useCxp()
  const { config } = useConfig()
  const { canEdit, isAdmin } = usePerms()
  const toast = useToast()
  const [estado, setEstado] = useState('')
  const [verPagadas, setVerPagadas] = useState(false)
  const [formOpen, setFormOpen] = useState(false)
  const [detalleId, setDetalleId] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const moneda = config?.moneda ?? 'USD'
  const hoy = todayLocal()
  // Las facturas con saldo cero se archivan automáticamente de la vista principal.
  const ocultarPagadas = !verPagadas && estado !== 'pagada'
  const filtrados = cxps
    .filter(c => !estado || c.estado === estado)
    .filter(c => !ocultarPagadas || Number(c.saldo) > 0)
  const pagadasCount = cxps.filter(c => Number(c.saldo) <= 0).length
  const tone = (c: { saldo: number; estado: string; fecha_vencimiento: string }) =>
    c.saldo <= 0 ? 'green' as const
    : c.fecha_vencimiento && c.fecha_vencimiento < hoy ? 'red' as const
    : c.estado === 'parcial' ? 'yellow' as const
    : 'blue' as const
  const estadoLabel = (c: { saldo: number; estado: string; fecha_vencimiento: string }) =>
    c.saldo <= 0 ? t('states.pagada') : c.fecha_vencimiento && c.fecha_vencimiento < hoy ? t('states.vencida') : c.estado === 'parcial' ? t('states.parcial') : t('states.pendiente')

  const totalPorPagar = cxps.filter(c => c.saldo > 0).reduce((s, c) => s + (Number(c.monto_total) || 0) / (Number(c.tipo_cambio) || 1), 0)
  const totalVencidas = cxps.filter(c => c.saldo > 0 && c.fecha_vencimiento < hoy).reduce((s, c) => s + (Number(c.saldo) || 0) / (Number(c.tipo_cambio) || 1), 0)

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
          <Select value={estado} onChange={setEstado} options={[{ value: 'pendiente', label: t('states.pendiente') }, { value: 'parcial', label: t('states.parcial') }, { value: 'pagada', label: t('states.pagada') }]} placeholder={t('common.estado')} />
          {canEdit('cuentas') && (<Button icon={<IconPlus className="w-4 h-4" />} onClick={() => setFormOpen(true)}>{t('cuentas.nuevaCxp')}</Button>)}
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label={t('cuentas.totalPorPagar')} value={formatMoneyConverted(totalPorPagar, moneda, moneda, config)} />
        <StatCard label={t('states.vencidas')} value={formatMoneyConverted(totalVencidas, moneda, moneda, config)} tone="negative" />
        <StatCard label={t('cuentas.activas')} value={String(cxps.filter(c => c.saldo > 0).length)} />
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
        <Table columns={[
          { key: 'prov', header: t('cuentas.proveedor'), render: r => String(r.nombre_proveedor) },
          { key: 'desc', header: t('cuentas.descripcion'), render: r => String(r.descripcion) },
          { key: 'venc', header: t('cuentas.vence'), render: r => <span className={String(r.fecha_vencimiento) < hoy && Number(r.saldo) > 0 ? 'text-red-600 font-medium' : ''}>{String(r.fecha_vencimiento)}</span> },
          { key: 'total', header: t('facturas.total'), render: r => formatMoneyConverted(Number(r.monto_total), String(r.moneda), moneda, config) },
          { key: 'saldo', header: t('facturas.saldo'), render: r => formatMoneyConverted(Number(r.saldo), String(r.moneda), moneda, config) },
          { key: 'estado', header: t('common.estado'), render: r => { const c = r as { saldo: number; estado: string; fecha_vencimiento: string }; return <Badge tone={tone(c)}>{estadoLabel(c)}</Badge> } },
          { key: 'acciones', header: '', render: r => (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setDetalleId(String(r.id_cxp))}>{t('facturas.ver')}</Button>
              {isAdmin && (<Button variant="danger" icon={<IconTrash className="w-4 h-4" />} onClick={() => setDeleteId(String(r.id_cxp))}>{t('common.eliminar')}</Button>)}
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
            try { await deleteCxp.mutateAsync(deleteId); toast(t('cuentas.eliminada')) }
            catch (e) { toast((e as Error).message, 'error') }
          }
          setDeleteId(null)
        }} onClose={() => setDeleteId(null)} />
    </div>
  )
}
