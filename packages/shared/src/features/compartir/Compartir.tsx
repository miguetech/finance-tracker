import React, { useState } from 'react'
import { useUsuarios, useConfig } from '../../store/queries'
import { Table, Button, Input, Select, ConfirmDialog, Dialog, cx } from '../../ui/components'
import { useToast } from '../../ui/components'
import { IconPlus, IconTrash } from '../../ui/icons'
import { MODULE_KEYS, type ModuleKey, type Usuario, type UserRole } from '../../roles/roles'

const EDIT_MODULES: readonly ModuleKey[] = ['clientes', 'gastos', 'facturas']

const ROLES: { value: UserRole; label: string }[] = [
  { value: 'solo_lectura', label: 'Solo lectura (todo)' },
  { value: 'ver_facturas', label: 'Ver facturas' },
  { value: 'ver_reportes', label: 'Ver reportes' },
  { value: 'ver_gastos', label: 'Ver gastos' },
  { value: 'ver_empleados', label: 'Ver empleados' },
  { value: 'ver_cuentas', label: 'Ver cuentas por pagar' },
  { value: 'asistente', label: 'Asistente (edita módulos)' },
  { value: 'personalizado', label: 'Personalizado' }
]

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

function AddUserForm({ onClose }: { onClose: () => void }) {
  const { saveUsuario } = useUsuarios()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [rol, setRol] = useState<UserRole>('solo_lectura')
  const [ver, setVer] = useState('')
  const [editar, setEditar] = useState('')
  const submit = async () => {
    try {
      await saveUsuario.mutateAsync({ email, rol, modulos_ver: ver, modulos_editar: editar } as Usuario)
      toast('Usuario guardado')
      onClose()
    } catch (e) { toast((e as Error).message, 'error') }
  }
  const showModules = rol === 'personalizado' || rol === 'asistente'
  return (
    <Dialog open onClose={onClose} title="Agregar usuario"
      footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Guardar</Button></>}>
      <div className="space-y-3">
        <Input value={email} onChange={e => setEmail(e.target.value)} placeholder="email@ejemplo.com" />
        <Select value={rol} onChange={setRol as (v: string) => void} options={ROLES} />
        {showModules && (
          <div className="space-y-2">
            <div><div className="text-xs font-semibold mb-1">Ver</div><ModulePicker value={ver} onChange={setVer} /></div>
            {rol === 'asistente' && (
              <div><div className="text-xs font-semibold mb-1">Editar</div><ModulePicker value={editar} onChange={setEditar} allowed={EDIT_MODULES} /></div>
            )}
          </div>
        )}
      </div>
    </Dialog>
  )
}

function rolLabel(rol: UserRole): string {
  return ROLES.find(r => r.value === rol)?.label ?? rol
}

export function Compartir() {
  const { usuarios, deleteUsuario } = useUsuarios()
  const { config, saveConfig } = useConfig()
  const toast = useToast()
  const [backendUrl, setBackendUrl] = useState(config?.share_backend_url ?? '')
  const [addOpen, setAddOpen] = useState(false)
  const [deleteEmail, setDeleteEmail] = useState<string | null>(null)

  const saveBackendUrl = async () => {
    try {
      await saveConfig.mutateAsync({ ...config!, share_backend_url: backendUrl.trim() })
      toast('URL guardada')
    } catch (e) { toast((e as Error).message, 'error') }
  }

  const copyLink = () => {
    const url = backendUrl.trim()
    if (!url) { toast('Primero guarda la URL del backend', 'error'); return }
    const link = `${window.location.origin}${window.location.pathname}?vista=1&api=${encodeURIComponent(url)}`
    copyToClipboard(link)
    toast('Link copiado')
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold">Compartir</h1>
        <p className="text-sm text-gray-500">Configura el backend y decide quién ve qué. La hoja queda privada.</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-card p-4 space-y-3">
        <div className="text-sm font-semibold">URL del backend</div>
        <div className="flex gap-2">
          <Input value={backendUrl} onChange={e => setBackendUrl(e.target.value)} placeholder="https://script.google.com/macros/s/.../exec" />
          <Button onClick={saveBackendUrl}>Guardar</Button>
          <Button variant="outline" onClick={copyLink}>Copiar link</Button>
        </div>
        <p className="text-xs text-gray-500">El link que compartas será: tu-app.com/?vista=1&api=...</p>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl shadow-card overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="text-sm font-semibold">Usuarios con acceso</div>
          <Button icon={<IconPlus className="w-4 h-4" />} onClick={() => setAddOpen(true)}>Agregar</Button>
        </div>
        <Table columns={[
          { key: 'email', header: 'Email', render: r => String(r.email) },
          { key: 'rol', header: 'Rol', render: r => rolLabel(String(r.rol) as UserRole) },
          { key: 'modulos', header: 'Módulos', render: r => { const v = String(r.modulos_ver || ''); const e = String(r.modulos_editar || ''); return <span className="text-xs text-gray-600">{[v, e && `edita: ${e}`].filter(Boolean).join(' · ') || '—'}</span> } },
          { key: 'acciones', header: '', render: r => (
            <Button variant="danger" icon={<IconTrash className="w-4 h-4" />} onClick={() => setDeleteEmail(String(r.email))}>Eliminar</Button>
          ) }
        ]} rows={usuarios as unknown as Record<string, unknown>[]} />
      </div>
      {addOpen && <AddUserForm onClose={() => setAddOpen(false)} />}
      <ConfirmDialog open={deleteEmail !== null} title="Eliminar acceso" message="Este usuario perderá el acceso de inmediato. ¿Continuar?"
        onConfirm={async () => { if (deleteEmail) { try { await deleteUsuario.mutateAsync(deleteEmail); toast('Acceso eliminado') } catch (e) { toast((e as Error).message, 'error') } } setDeleteEmail(null) }}
        onClose={() => setDeleteEmail(null)} />
    </div>
  )
}
