import React, { useState } from 'react'
import { useUsuarios, useConfig } from '../../store/queries'
import { Table, Button, Input, Select, ConfirmDialog, Dialog, cx } from '../../ui/components'
import { useToast } from '../../ui/components'
import { IconPlus, IconTrash } from '../../ui/icons'
import { useI18n } from '../../i18n'
import { MODULE_KEYS, type ModuleKey, type Usuario, type UserRole } from '../../roles/roles'
import type { MessageKey } from '../../i18n/locales/types'

const EDIT_MODULES: readonly ModuleKey[] = ['clientes', 'gastos', 'facturas', 'inventario']

const ROLE_KEYS: Record<UserRole, string> = {
  solo_lectura: 'compartir.soloLectura',
  ver_facturas: 'compartir.verFacturas',
  ver_reportes: 'compartir.verReportes',
  ver_gastos: 'compartir.verGastos',
  ver_empleados: 'compartir.verEmpleados',
  ver_cuentas: 'compartir.verCuentas',
  asistente: 'compartir.asistente',
  personalizado: 'compartir.personalizado',
  admin: 'compartir.admin'
}

function copyToClipboard(text: string) { navigator.clipboard?.writeText(text) }

function ModulePicker({ value, onChange, allowed = MODULE_KEYS }: { value: string; onChange: (csv: string) => void; allowed?: readonly ModuleKey[] }) {
  const set = new Set(value.split(',').map(s => s.trim()).filter(Boolean))
  const toggle = (m: ModuleKey) => {
    const next = new Set(set)
    if (next.has(m)) next.delete(m); else next.add(m)
    onChange([...next].join(','))
  }
  return (
    <div className="flex flex-wrap gap-2">
      {allowed.map(m => (
        <button key={m} type="button" onClick={() => toggle(m)}
          className={cx('px-2 py-1 rounded-md text-xs border', set.has(m) ? 'bg-primary text-white border-primary' : 'border-gray-300 text-gray-600')}>
          {m}
        </button>
      ))}
    </div>
  )
}

function rolLabel(t: (k: MessageKey) => string, rol: UserRole): string {
  return t(ROLE_KEYS[rol] as MessageKey)
}

function AddUserForm({ onClose }: { onClose: () => void }) {
  const { saveUsuario } = useUsuarios()
  const toast = useToast()
  const { t } = useI18n()
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState<UserRole>('solo_lectura')
  const [ver, setVer] = useState('')
  const [editar, setEditar] = useState('')
  const submit = async () => {
    try {
      await saveUsuario.mutateAsync({ email, rol, modulos_ver: ver, modulos_editar: editar } as Usuario)
      toast(t('compartir.usuarioGuardado'))
      onClose()
    } catch (e) { toast((e as Error).message, 'error') }
  }
  const showModules = rol === 'personalizado' || rol === 'asistente'
  return (
    <Dialog open onClose={onClose} title={t('compartir.agregarUsuario')}
      footer={<><Button variant="outline" onClick={onClose}>{t('common.cancelar')}</Button><Button onClick={submit}>{t('common.guardar')}</Button></>}>
      <div className="space-y-3">
        <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@ejemplo.com" />
        <Select value={rol} onChange={setRol as (v: string) => void} options={(Object.keys(ROLE_KEYS) as UserRole[]).filter(r => r !== 'admin').map(r => ({ value: r, label: rolLabel(t, r) }))} />
        {showModules && (
          <div className="space-y-2">
            <div><div className="text-xs font-semibold mb-1">{t('compartir.ver')}</div><ModulePicker value={ver} onChange={setVer} /></div>
            {rol === 'asistente' && (
              <div><div className="text-xs font-semibold mb-1">{t('compartir.editar')}</div><ModulePicker value={editar} onChange={setEditar} allowed={EDIT_MODULES} /></div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}

export function Compartir() {
  const { t } = useI18n()
  const { usuarios, deleteUsuario } = useUsuarios()
  const { config, saveConfig } = useConfig()
  const toast = useToast()
  const [backendUrl, setBackendUrl] = useState('')
  const [addOpen, setAddOpen] = useState(false)
  const [deleteEmail, setDeleteEmail] = useState<string | null>(null)

  React.useEffect(() => {
    if (config) setBackendUrl(config.share_backend_url ?? '')
  }, [config])

  const saveBackendUrl = async () => {
    try {
      await saveConfig.mutateAsync({ ...config!, share_backend_url: backendUrl.trim() })
      toast(t('compartir.urlGuardada'))
    } catch (e) { toast((e as Error).message, 'error') }
  }

  const copyLink = () => {
    const url = backendUrl.trim()
    if (!url) { toast(t('compartir.primeroGuarda'), 'error'); return }
    const link = `${window.location.origin}${window.location.pathname}?vista=1&api=${encodeURIComponent(url)}`
    copyToClipboard(link)
    toast(t('compartir.linkCopiado'))
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">{t('compartir.title')}</h1>
        <p className="text-sm text-gray-500">{t('compartir.subtitulo')}</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-card p-4 space-y-3">
        <div className="text-sm font-semibold">{t('compartir.backendUrl')}</div>
        <div className="flex gap-2">
          <Input value={backendUrl} onChange={e => setBackendUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" />
          <Button onClick={saveBackendUrl}>{t('common.guardar')}</Button>
          <Button variant="outline" onClick={copyLink}>{t('compartir.copiarLink')}</Button>
        </div>
        <p className="text-xs text-gray-500">{t('compartir.linkInfo')}</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="text-sm font-semibold">{t('compartir.usuarios')}</div>
          <Button icon={<IconPlus className="w-4 h-4" />} onClick={() => setAddOpen(true)}>{t('common.agregar')}</Button>
        </div>
        <Table columns={[
          { key: 'email', header: t('common.email'), render: r => String(r.email) },
          { key: 'rol', header: t('compartir.roles'), render: r => rolLabel(t, String(r.rol) as UserRole) },
          { key: 'modulos', header: t('compartir.modulos'), render: r => { const v = String(r.modulos_ver || ''); const e = String(r.modulos_editar || ''); return <span className="text-xs text-gray-600">{[v, e && t('compartir.edita', { modulos: e })].filter(Boolean).join(' · ') || '—'}</span> } },
          { key: 'acciones', header: '', render: r => (
            <Button variant="danger" icon={<IconTrash className="w-4 h-4" />} onClick={() => setDeleteEmail(String(r.email))}>{t('common.eliminar')}</Button>
          ) }
        ]} rows={usuarios as unknown as Record<string, unknown>[]} />
      </div>
      {addOpen && <AddUserForm onClose={() => setAddOpen(false)} />}
      <ConfirmDialog open={deleteEmail !== null} title={t('compartir.eliminarTitulo')} message={t('compartir.eliminarMensaje')}
        onConfirm={async () => { if (deleteEmail) { try { await deleteUsuario.mutateAsync(deleteEmail); toast(t('compartir.accesoEliminado')) } catch (e) { toast((e as Error).message, 'error') } } setDeleteEmail(null) }}
        onClose={() => setDeleteEmail(null)} />
    </div>
  )
}
