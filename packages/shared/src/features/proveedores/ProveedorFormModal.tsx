import React, { useEffect, useState } from 'react'
import { Dialog, Button, Input } from '../../ui/components'
import { useConfig } from '../../store/queries'
import { getDocLabel } from '../../taxid'
import { useI18n } from '../../i18n'
import { useSaveGuard } from '../../ui/hooks'
import type { Proveedor } from '../../types/entities'

export function ProveedorFormModal({ open, onClose, initial, onSave }: { open: boolean; onClose: () => void; initial: Proveedor | null; onSave: (p: Proveedor) => Promise<void> | void }) {
  const { t } = useI18n()
  const [form, setForm] = useState({ nombre: '', rfc: '', email: '', telefono: '', direccion: '' })
  const { guardando, guardar } = useSaveGuard()
  useEffect(() => {
    if (open) setForm(initial ? { nombre: initial.nombre, rfc: initial.rfc, email: initial.email, telefono: initial.telefono, direccion: initial.direccion } : { nombre: '', rfc: '', email: '', telefono: '', direccion: '' })
  }, [open, initial])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const { config } = useConfig()
  const docLabel = getDocLabel(config?.tipo_doc ?? 'RFC', config?.tipo_doc_etiqueta ?? '')
  const submit = () => guardar(async () => {
    if (!form.nombre.trim()) return
    try {
      await onSave({ ...initial, ...form } as Proveedor)
      onClose()
    } catch (e) {
      throw e instanceof Error ? e : new Error('Error al guardar')
    }
  })
  return (
    <Dialog open={open} onClose={onClose} title={initial ? t('proveedores.editar') : t('proveedores.nuevo')}
      footer={<><Button variant="outline" onClick={onClose} disabled={guardando}>{t('common.cancelar')}</Button><Button onClick={submit} disabled={guardando}>{guardando ? t('imagenes.subiendo') : t('common.guardar')}</Button></>}>
      <div className="space-y-3">
        <div><label className="text-xs text-gray-500">{t('common.nombre')} *</label><Input value={form.nombre} onChange={set('nombre')} /></div>
        <div><label className="text-xs text-gray-500">{docLabel}</label><Input value={form.rfc} onChange={set('rfc')} /></div>
        <div><label className="text-xs text-gray-500">{t('common.email')}</label><Input value={form.email} onChange={set('email')} /></div>
        <div><label className="text-xs text-gray-500">{t('common.telefono')}</label><Input value={form.telefono} onChange={set('telefono')} /></div>
        <div><label className="text-xs text-gray-500">{t('common.direccion')}</label><Input value={form.direccion} onChange={set('direccion')} /></div>
      </div>
    </Dialog>
  )
}
