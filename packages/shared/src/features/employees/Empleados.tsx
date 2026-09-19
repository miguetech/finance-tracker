import React, { useMemo, useState } from 'react'
import { useEmpleados, useNominaDetalles, useGastos, useConfig, useAsistencias } from '../../store/queries'
import { Table, Button, Badge, ConfirmDialog, Input, useToast } from '../../ui/components'
import { usePerms } from '../../store/perms'
import { formatMoney } from '../../currency'
import { getDocLabel } from '../../taxid'
import { todayLocal } from '../../lib/date'
import { IconPlus, IconEdit, IconTrash, IconHistory } from '../../ui/icons'
import { useI18n } from '../../i18n'
import { exportCSV } from '../../export/export'
import { desgloseEmpleado, type DesgloseEmpleado as TDesglose } from '../../reports/payroll'
import { EmpleadoFormModal } from './EmpleadoFormModal'
import { NominaModal } from './NominaModal'
import type { Empleado } from '../../types/entities'

type Tab = 'plantilla' | 'asistencia' | 'desglose'

export function Empleados() {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>('plantilla')
  const tabs: { id: Tab; label: string }[] = [
    { id: 'plantilla', label: t('empleados.tabPlantilla') },
    { id: 'asistencia', label: t('empleados.tabAsistencia') },
    { id: 'desglose', label: t('empleados.tabDesglose') }
  ]
  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t('empleados.title')}</h1>
          <p className="text-sm text-muted-foreground">{t('empleados.subtitulo')}</p>
        </div>
        <div className="flex gap-1 border-b border-gray-200">
          {tabs.map(x => (
            <button key={x.id} onClick={() => setTab(x.id)}
              className={`px-3 py-2 text-sm border-b-2 ${tab === x.id ? 'border-primary text-primary font-medium' : 'border-transparent text-muted-foreground'}`}>
              {x.label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'plantilla' && <TabPlantilla />}
      {tab === 'asistencia' && <TabAsistencia />}
      {tab === 'desglose' && <TabDesglose />}
    </div>
  )
}

/** Pestaña de plantilla: lista de employees con nómina. */
function TabPlantilla() {
  const { t } = useI18n()
  const { employees, saveEmployee, deleteEmployee } = useEmpleados()
  const { registerAdvancedPayroll } = useNominaDetalles()
  const { expenses } = useGastos({})
  const { config } = useConfig()
  const { isAdmin } = usePerms()
  const toast = useToast()
  const [formOpen, setFormOpen] = useState(false)
  const [editando, setEditando] = useState<Empleado | null>(null)
  const [nominaDe, setNominaDe] = useState<Empleado | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const docLabel = getDocLabel(config?.tipo_doc ?? 'RFC', config?.doc_type_label ?? '')
  const currency = config?.currency ?? 'USD'

  const totalPagado = (name: string) =>
    expenses.filter(g => g.category === 'Nómina' && g.supplier === name).reduce((s, g) => s + Number(g.amount), 0)

  return (
    <>
      <div className="flex justify-end">
        {isAdmin && <Button icon={<IconPlus className="w-4 h-4" />} onClick={() => { setEditando(null); setFormOpen(true) }}>{t('empleados.nuevo')}</Button>}
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
        <Table columns={[
          { key: 'name', header: t('common.nombre'), render: r => String(r.name) },
          { key: 'rfc', header: docLabel, render: r => String(r.rfc) },
          { key: 'position', header: t('empleados.puesto'), render: r => String(r.position) },
          { key: 'salary', header: t('empleados.salario'), render: r => formatMoney(Number(r.salary), String(r.salary_currency) || currency) },
          { key: 'dias', header: t('empleados.diasLaborales'), render: r => String((r as unknown as Empleado).work_days || '').split(',').filter(Boolean).length ? `${String((r as unknown as Empleado).work_days).split(',').filter(Boolean).length} ${t('empleados.diasSemana')}` : '—' },
          { key: 'ingreso', header: t('empleados.ingreso'), render: r => String(r.hire_date) },
          { key: 'active', header: t('common.estado'), render: r => <Badge tone={String(r.active) === 'true' ? 'green' : 'gray'}>{String(r.active) === 'true' ? t('empleados.activo') : t('empleados.inactivo')}</Badge> },
          { key: 'total', header: t('empleados.totalPagado'), render: r => formatMoney(totalPagado(String(r.name)), currency) },
          { key: 'acciones', header: '', render: r => (
            <div className="flex gap-2">
              {isAdmin && <Button variant="ghost" icon={<IconEdit className="w-4 h-4" />} onClick={() => { setEditando(r as unknown as Empleado); setFormOpen(true) }}>{t('common.editar')}</Button>}
              {isAdmin && <Button variant="outline" onClick={() => setNominaDe(r as unknown as Empleado)}>{t('empleados.nomina')}</Button>}
              {isAdmin && <Button variant="danger" icon={<IconTrash className="w-4 h-4" />} onClick={() => setDeleteId(String(r.employee_id))}>{t('common.eliminar')}</Button>}
            </div>
          ) }
        ]} rows={employees as unknown as Record<string, unknown>[]} />
        {employees.length === 0 && <p className="p-4 text-sm text-muted-foreground">{t('empleados.sinEmpleados')}</p>}
      </div>
      <EmpleadoFormModal open={formOpen} onClose={() => setFormOpen(false)} initial={editando}
        onSave={async e => { try { await saveEmployee.mutateAsync(e); toast(t('empleados.guardado')) } catch (err) { toast((err as Error).message, 'error'); throw err } }} />
      {nominaDe && (
        <NominaModal empleado={nominaDe} onClose={() => setNominaDe(null)}
          onSave={async i => {
            try {
              await registerAdvancedPayroll.mutateAsync({ employee_id: nominaDe.employee_id, ...i })
              toast(t('empleados.nominaRegistrada'))
            } catch (err) { toast((err as Error).message, 'error') }
          }} />
      )}
      <ConfirmDialog open={deleteId !== null} title={t('empleados.eliminarTitulo')} message={t('empleados.eliminarMensaje')}
        onConfirm={async () => { if (deleteId) { try { await deleteEmployee.mutateAsync(deleteId); toast(t('empleados.eliminado')) } catch (err) { toast((err as Error).message, 'error') } } setDeleteId(null) }}
        onClose={() => setDeleteId(null)} />
    </>
  )
}

const DIAS_SEMANA = ['lun', 'mar', 'mie', 'jue', 'vie', 'sab', 'dom'] as const

/** Pestaña de asistencia: registro diario de in/out según el esquema configurado. */
function TabAsistencia() {
  const { t } = useI18n()
  const { employees } = useEmpleados()
  const hoy = todayLocal()
  const mesActual = hoy.slice(0, 7)
  const { asistencias, saveAttendance, deleteAttendance } = useAsistencias({ desde: `${mesActual}-01`, hasta: `${mesActual}-31` })
  const { isAdmin } = usePerms()
  const toast = useToast()

  const activos = employees.filter(e => String(e.active) !== 'false')
  const [idEmp, setIdEmp] = useState('')
  const [date, setDate] = useState(hoy)
  const [clockIn, setEntrada] = useState('')
  const [clockOut, setSalida] = useState('')
  const [guardando, setGuardando] = useState(false)

  const guardarJornada = async () => {
    if (!idEmp) return
    setGuardando(true)
    try {
      await saveAttendance.mutateAsync({ employee_id: idEmp, date, clock_in: clockIn, clock_out: clockOut, notes: '' })
      toast(t('empleados.jornadaGuardada'))
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div className="space-y-4">
      {isAdmin && activos.length > 0 && (
        <div className="rounded-xl border border-gray-200 bg-white p-4 space-y-3 shadow-card">
          <div className="text-sm font-medium flex items-center gap-1.5"><IconPlus className="w-4 h-4 text-primary" />{t('empleados.registrarJornada')}</div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
            <div>
              <label className="text-xs text-gray-500">{t('empleados.empleado')}</label>
              <select value={idEmp} onChange={e => setIdEmp(e.target.value)} className="w-full h-10 px-3 text-sm rounded-xl border border-gray-200 bg-surface">
                <option value="">—</option>
                {activos.map(e => <option key={e.employee_id} value={e.employee_id}>{e.name}</option>)}
              </select>
            </div>
            <div><label className="text-xs text-gray-500">{t('common.fecha')}</label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
            <div><label className="text-xs text-gray-500">{t('nominaAv.horaEntrada')}</label><Input type="time" value={clockIn} onChange={e => setEntrada(e.target.value)} /></div>
            <div><label className="text-xs text-gray-500">{t('nominaAv.horaSalida')}</label><Input type="time" value={clockOut} onChange={e => setSalida(e.target.value)} /></div>
            <Button onClick={guardarJornada} disabled={guardando || !idEmp}>{guardando ? t('imagenes.subiendo') : t('common.guardar')}</Button>
          </div>
          {idEmp && (() => {
            const emp = activos.find(e => e.employee_id === idEmp)
            const dias = (emp?.work_days || '').split(',').filter(Boolean).map(n => Number(n))
            return dias.length > 0 ? (
              <p className="text-xs text-muted-foreground">{t('empleados.esquemaDias')}: {dias.map(d => t(`empleados.${DIAS_SEMANA[d - 1]}`)).join(' · ')}</p>
            ) : null
          })()}
        </div>
      )}
      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
        <Table columns={[
          { key: 'date', header: t('common.fecha'), render: r => String(r.date) },
          { key: 'emp', header: t('empleados.empleado'), render: r => String(r.employee_name) },
          { key: 'ent', header: t('nominaAv.horaEntrada'), render: r => String(r.clock_in) || '—' },
          { key: 'sal', header: t('nominaAv.horaSalida'), render: r => String(r.clock_out) || '—' },
          ...(isAdmin ? [{
            key: 'acc', header: '', render: (r: Record<string, unknown>) => (
              <Button variant="danger" size="sm" icon={<IconTrash className="w-3.5 h-3.5" />} onClick={() => deleteAttendance.mutate(String(r.attendance_id))}>{t('common.eliminar')}</Button>
            )
          }] : [])
        ]} rows={asistencias as unknown as Record<string, unknown>[]} />
        {asistencias.length === 0 && <p className="p-4 text-sm text-muted-foreground">{t('empleados.sinAsistencia')}</p>}
      </div>
    </div>
  )
}

/** Pestaña "Expeditillo": desglose consolidado por empleado con exportación. */
function TabDesglose() {
  const { t } = useI18n()
  const { employees } = useEmpleados()
  const { detalles } = useNominaDetalles()
  const { expenses } = useGastos({})
  const { config } = useConfig()
  const currency = config?.currency ?? 'USD'
  const mesActual = todayLocal().slice(0, 7)
  const [mes, setMes] = useState(mesActual)
  const desde = `${mes}-01`
  const hasta = `${mes}-31`
  const { asistencias } = useAsistencias({ desde, hasta })

  const desgloses = useMemo<TDesglose[]>(() =>
    employees.map(e => desgloseEmpleado(e, { asistencias, detalles, expenses }, mes)),
    [employees, asistencias, detalles, expenses, mes]
  )

  const exportar = () => exportCSV(`desglose_empleados_${mes}`, desgloses.map(d => ({
    empleado: d.empleado.name,
    position: d.empleado.position,
    dias_trabajados: d.diasTrabajados,
    horas_trabajadas: d.horasTrabajadas,
    horas_extra: d.horasExtraMes,
    overtime_amount: d.montoHorasExtraMes,
    depositado: d.sueldosDepositados
  })), [
    { key: 'empleado', header: 'Empleado' }, { key: 'puesto', header: 'Puesto' },
    { key: 'dias_trabajados', header: 'Días trabajados' }, { key: 'horas_trabajadas', header: 'Horas trabajadas' },
    { key: 'horas_extra', header: 'Horas extra' }, { key: 'overtime_amount', header: 'Monto horas extra' },
    { key: 'depositado', header: `Depositado (${currency})` }
  ])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Input type="month" value={mes} onChange={e => setMes(e.target.value)} className="sm:w-44" />
        <Button variant="outline" icon={<IconHistory className="w-4 h-4" />} onClick={exportar}>{t('empleados.exportarDesglose')}</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {desgloses.map(d => (
          <div key={d.empleado.employee_id} className="rounded-xl border border-gray-200 bg-white p-4 space-y-2 shadow-card">
            <div className="font-semibold">{d.empleado.name}</div>
            <div className="text-xs text-muted-foreground">{d.empleado.position || '—'} · {(d.empleado.work_days || '').split(',').filter(Boolean).map(n => t(`empleados.${DIAS_SEMANA[Number(n) - 1]}`)).join(' · ')}</div>
            <dl className="text-sm space-y-1 pt-1">
              <div className="flex justify-between"><dt className="text-muted-foreground">{t('empleados.diasTrabajados')}</dt><dd className="tabular-nums font-medium">{d.diasTrabajados}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">{t('empleados.horasTrabajadas')}</dt><dd className="tabular-nums font-medium">{d.horasTrabajadas}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">{t('empleados.horasExtraMes')}</dt><dd className="tabular-nums font-medium">{d.horasExtraMes}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">{t('empleados.montoHorasExtra')}</dt><dd className="tabular-nums font-medium">{formatMoney(d.montoHorasExtraMes, currency)}</dd></div>
              <div className="flex justify-between border-t pt-1"><dt className="text-muted-foreground">{t('empleados.depositado')}</dt><dd className="tabular-nums font-semibold">{formatMoney(d.sueldosDepositados, currency)}</dd></div>
            </dl>
          </div>
        ))}
      </div>
      {employees.length === 0 && <p className="p-4 text-sm text-muted-foreground">{t('empleados.sinEmpleados')}</p>}
    </div>
  )
}
