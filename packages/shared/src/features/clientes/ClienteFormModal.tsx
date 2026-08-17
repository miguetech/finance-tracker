import React, { useEffect, useState } from 'react'
import { Dialog, Button, Input } from '../../ui/components'
import { useConfig } from '../../store/queries'
import { getDocLabel } from '../../taxid'
import { useI18n } from '../../i18n'
import type { Cliente } from '../../types/entities'

export function ClienteFormModal({ open, onClose, initial, onSave }: { open: boolean; onClose: () => void; initial: Cliente | null; onSave: (c: Cliente) => Promise<void> | void }) {
  const { t } = useI18n()
  const [form, setForm] = useState({ nombre: '', rfc: '', email: '', telefono: '', direccion: '' })
  useEffect(() => {
    if (open) setForm(initial ? { nombre: initial.nombre, rfc: initial.rfc, email: initial.email, telefono: initial.telefono, direccion: initial.direccion } : { nombre: '', rfc: '', email: '', telefono: '', direccion: '' })
  }, [open, initial])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const { config } = useConfig()
  const docLabel = getDocLabel(config?.tipo_doc ?? 'RFC', config?.tipo_doc_etiqueta ?? '')
  const submit = async () => {
    if (!form.nombre.trim()) return
    try {
      await onSave({ ...initial, ...form } as Cliente)
      onClose()
    } catch {
      /* el padre muestra el error; se mantiene abierto */
    }
  }
  return (
    <Dialog open={open} onClose={onClose} title={initial ? t('clientes.editar') : t('clientes.nuevo')}
      footer={<><Button variant="outline" onClick={onClose}>{t('common.cancelar')}</Button><Button onClick={submit}>{t('common.guardar')}</Button></>}>
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
