import React, { useEffect, useMemo, useState } from 'react'
import { useGastos, useConfig, useCategorias, useGastosFijos } from '../../store/queries'
import { todayLocal } from '../../lib/date'
import { Table, Button, Select, Input, ConfirmDialog, Badge } from '../../ui/components'
import { useToast } from '../../ui/components'
import { usePerms } from '../../store/perms'
import { formatMoneyConverted } from '../../currency'
import { useI18n } from '../../i18n'
import { IconPlus, IconEdit, IconTrash } from '../../ui/icons'
import { GastoFormModal } from './GastoFormModal'
import { GastoFijoFormModal, marcarPagado } from './GastoFijoFormModal'
import { useNotificaciones } from '../../ui/hooks'
import { proyeccionGastosFijos } from '../../reports/gastosFijos'
import type { Gasto, GastoFijo } from '../../types/entities'

export function Gastos() {
  const { t } = useI18n()
  const [tab, setTab] = useState<'registrados' | 'fijos'>('registrados')
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-bold">{t('gastos.title')}</h1>
        <div className="flex gap-1 border-b border-gray-200">
          {[{ id: 'registrados', label: t('gastos.title') }, { id: 'fijos', label: t('gastosFijos.title') }].map(x => (
            <button key={x.id} onClick={() => setTab(x.id as 'registrados' | 'fijos')}
              className={`px-3 py-2 text-sm border-b-2 ${tab === x.id ? 'border-primary text-primary font-medium' : 'border-transparent text-muted-foreground'}`}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'registrados' ? <TabRegistrados /> : <TabFijos />}
    </div>
  )
}

function TabRegistrados() {
  const { t } = useI18n()
  const { gastos, deleteGasto } = useGastos({})
  const { config } = useConfig()
  const { data: categorias = [] } = useCategorias('gastos')
  const { canEdit, isAdmin } = usePerms()
  const toast = useToast()
  const [mes, setMes] = useState('')
  const [categoria, setCategoria] = useState('')
  const [formOpen, setFormOpen] = useState(false)
  const [editando, setEditando] = useState<Gasto | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const moneda = config?.moneda ?? 'USD'

  const filtrados = gastos.filter(g => (!mes || g.fecha.slice(0, 7) === mes) && (!categoria || g.categoria === categoria))

  return (
    <>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3">
        <div className="flex gap-2">
          <Input type="month" value={mes} onChange={e => setMes(e.target.value)} />
          <Select value={categoria} onChange={setCategoria} options={categorias.map(c => ({ value: c, label: c }))} placeholder={t('common.categoria')} />
          {canEdit('gastos') && (<Button icon={<IconPlus className="w-4 h-4" />} onClick={() => { setEditando(null); setFormOpen(true) }}>{t('gastos.nuevo')}</Button>)}
        </div>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
        <Table columns={[
          { key: 'fecha', header: t('common.fecha'), render: r => String(r.fecha) },
          { key: 'categoria', header: t('common.categoria'), render: r => String(r.categoria) },
          { key: 'descripcion', header: t('gastos.descripcion'), render: r => String(r.descripcion) },
          { key: 'monto', header: t('common.monto'), render: r => formatMoneyConverted(Number(r.monto), String(r.moneda), moneda, config) },
          { key: 'metodo_pago', header: t('common.metodo'), render: r => String(r.metodo_pago) },
          { key: 'acciones', header: '', render: r => (
            <div className="flex gap-2">
              {canEdit('gastos') && (<Button variant="ghost" icon={<IconEdit className="w-4 h-4" />} onClick={() => { setEditando(r as unknown as Gasto); setFormOpen(true) }}>{t('common.editar')}</Button>)}
              {isAdmin && (<Button variant="danger" icon={<IconTrash className="w-4 h-4" />} onClick={() => setDeleteId(String(r.id_gasto))}>{t('common.eliminar')}</Button>)}
            </div>
          ) }
        ]} rows={filtrados as unknown as Record<string, unknown>[]} />
        {filtrados.length === 0 && <p className="p-4 text-sm text-gray-500">{t('gastos.sinGastos')}</p>}
      </div>
      <GastoFormModal open={formOpen} onClose={() => setFormOpen(false)} initial={editando} />
      <ConfirmDialog open={deleteId !== null} title={t('gastos.eliminarTitulo')} message={t('gastos.eliminarMensaje')}
        onConfirm={async () => { if (deleteId) { await deleteGasto.mutateAsync(deleteId); toast(t('gastos.eliminado')) } setDeleteId(null) }} onClose={() => setDeleteId(null)} />
    </>
  )
}

/** Pestaña de gastos recurrentes: calendario del mes, recordatorios y pago directo. */
function TabFijos() {
  const { t } = useI18n()
  const { config, saveConfig } = useConfig()
  const { gastosFijos, deleteGastoFijo } = useGastosFijos()
  const { gastos, saveGasto } = useGastos({})
  const { canEdit, isAdmin } = usePerms()
  const toast = useToast()
  const notif = useNotificaciones()

  const mesActual = todayLocal().slice(0, 7)
  const [formOpen, setFormOpen] = useState(false)
  const [editando, setEditando] = useState<GastoFijo | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  // Proyección solo del mes en curso.
  const proyeccion = useMemo(() => proyeccionGastosFijos(
    gastosFijos,
    gastos.map(g => ({ categoria: g.categoria, descripcion: g.descripcion, fecha: g.fecha, monto: Number(g.monto) })),
    [mesActual]
  ), [gastosFijos, gastos, mesActual])

  const porVencer = proyeccion.filter(v => v.estado === 'por_vencer' && v.dias_restantes <= 3)
  const vencidos = proyeccion.filter(v => v.estado === 'vencido')

  // Notificación del navegador al cargar si hay vencimientos próximos (fácil de desactivar).
  useEffect(() => {
    if (config?.notif_gastos_activa !== 'true' || !notif.soportadas || Notification.permission !== 'granted') return
    const pendientes = [...vencidos, ...porVencer]
    if (pendientes.length > 0) {
      notif.notificar(t('gastosFijos.recordatorio'), `${pendientes[0].gasto_fijo.descripcion} — ${formatMoneyConverted(Number(pendientes[0].gasto_fijo.monto), pendientes[0].gasto_fijo.moneda, config?.moneda ?? 'USD', config)} (${pendientes[0].fecha_vencimiento})`)
    }
  }, [config?.notif_gastos_activa, vencidos.length, porVencer.length])

  const toggleNotif = async () => {
    if (config?.notif_gastos_activa === 'true') {
      await saveConfig.mutateAsync({ ...config!, notif_gastos_activa: 'false' })
      toast(t('common.guardado'))
      return
    }
    await notif.activar()
    if (notif.permiso === 'granted' || Notification.permission === 'granted') {
      await saveConfig.mutateAsync({ ...config!, notif_gastos_activa: 'true' })
      toast(t('gastosFijos.notifActivada'))
    } else {
      toast(t('gastosFijos.notifPermisoDenegado'), 'error')
    }
  }

  const moneda = config?.moneda ?? 'USD'

  return (
    <>
      <RecordatoriosCard activa={config?.notif_gastos_activa === 'true'} soportadas={notif.soportadas} permiso={notif.permiso} onToggle={toggleNotif} />

      {canEdit('gastos') && (
        <div className="flex justify-end">
          <Button icon={<IconPlus className="w-4 h-4" />} onClick={() => { setEditando(null); setFormOpen(true) }}>{t('gastosFijos.nuevo')}</Button>
        </div>
      )}

      {(porVencer.length > 0 || vencidos.length > 0) && (
        <div className={`rounded-xl border p-3 text-sm ${vencidos.length > 0 ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
          <b>{t('gastosFijos.recordatorio')}:</b>{' '}
          {[...vencidos, ...porVencer].map(v => `${v.gasto_fijo.descripcion} (${v.fecha_vencimiento})`).join(' · ')}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
        <Table columns={[
          { key: 'descripcion', header: t('gastosFijos.descripcion'), render: r => String(r.descripcion) },
          { key: 'monto', header: t('common.monto'), render: r => formatMoneyConverted(Number(r.monto), String((r as Record<string, unknown>).moneda), moneda, config) },
          { key: 'dia', header: t('reportesFin.vencimiento'), render: r => String((r as Record<string, unknown>).dia_vencimiento) },
          { key: 'estado', header: t('reportesFin.estadoPago'), render: r => {
            const v = proyeccion.find(p => p.gasto_fijo.id_gasto_fijo === (r as Record<string, unknown>).id_gasto_fijo)
            const est = v?.estado ?? 'por_vencer'
            return <Badge tone={est === 'pagado' ? 'green' : est === 'vencido' ? 'red' : 'yellow'}>
              {est === 'pagado' ? t('reportesFin.pagadoEstado') : est === 'vencido' ? t('reportesFin.vencidoEstado') : t('reportesFin.porVencerEstado')}
            </Badge>
          } },
          { key: 'acciones', header: '', render: r => {
            const gf = r as unknown as GastoFijo
            return (
              <div className="flex flex-wrap gap-2">
                {gf.enlace_pago && <a href={gf.enlace_pago} target="_blank" rel="noreferrer"><Button size="sm" variant="outline">{t('reportesFin.enlacePago')}</Button></a>}
                {canEdit('gastos') && gf.activo !== 'false' && (
                  <Button size="sm" variant="success" disabled={proyeccion.find(p => p.gasto_fijo.id_gasto_fijo === gf.id_gasto_fijo)?.estado === 'pagado'}
                    onClick={async () => {
                      try {
                        await marcarPagado(gf, (g: unknown) => saveGasto.mutateAsync(g as Gasto), moneda)
                        toast(t('gastosFijos.pagadoEsteMes'))
                      } catch (e) { toast((e as Error).message, 'error') }
                    }}>
                    {t('gastosFijos.marcarPagado')}
                  </Button>
                )}
                {canEdit('gastos') && (<Button size="sm" variant="ghost" icon={<IconEdit className="w-4 h-4" />} onClick={() => { setEditando(gf); setFormOpen(true) }}>{t('common.editar')}</Button>)}
                {isAdmin && (<Button size="sm" variant="danger" icon={<IconTrash className="w-4 h-4" />} onClick={() => setDeleteId(gf.id_gasto_fijo)}>{t('common.eliminar')}</Button>)}
              </div>
            )
          } }
        ]} rows={gastosFijos as unknown as Record<string, unknown>[]} />
        {gastosFijos.length === 0 && <p className="p-4 text-sm text-gray-500">{t('gastosFijos.sinGastosFijos')}</p>}
      </div>

      <GastoFijoFormModal open={formOpen} onClose={() => setFormOpen(false)} initial={editando} />
      <ConfirmDialog open={deleteId !== null} title={t('gastosFijos.eliminarTitulo')} message={t('gastosFijos.eliminarMensaje')}
        onConfirm={async () => { if (deleteId) { await deleteGastoFijo.mutateAsync(deleteId); toast(t('gastosFijos.eliminado')) } setDeleteId(null) }} onClose={() => setDeleteId(null)} />
    </>
  )
}

function RecordatoriosCard({ activa, soportadas, permiso, onToggle }: { activa: boolean; soportadas: boolean; permiso: string; onToggle: () => void }) {
  const { t } = useI18n()
  return (
    <div className="rounded-xl border border-gray-100 bg-muted/40 p-3 flex items-center justify-between gap-3">
      <div>
        <div className="text-sm font-medium">{t('gastosFijos.notifTitulo')}</div>
        <p className="text-xs text-muted-foreground mt-0.5">{t('gastosFijos.notifInfo')}</p>
        {!soportadas && <p className="text-xs text-danger mt-0.5">{t('gastosFijos.notifPermisoDenegado')}</p>}
        {!activa && soportadas && permiso !== 'granted' && <p className="text-xs text-amber-600 mt-0.5">permiso: {String(permiso)}</p>}
      </div>
      {soportadas && (
        <label className="inline-flex items-center cursor-pointer shrink-0">
          <input type="checkbox" className="sr-only peer" checked={activa} onChange={onToggle} />
          <span className="relative w-9 h-5 bg-gray-300 rounded-full peer-checked:bg-success transition-colors after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:w-4 after:h-4 after:bg-white after:rounded-full after:transition-transform peer-checked:after:translate-x-4" />
        </label>
      )}
    </div>
  )
}
