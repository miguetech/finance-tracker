import React, { useEffect, useState } from 'react'
import { Dialog, Button, Input } from '../../ui/components'
import { useConfig } from '../../store/queries'
import { getDocLabel } from '../../taxid'
import { useI18n } from '../../i18n'
import { useSaveGuard } from '../../ui/hooks'
import type { Cliente } from '../../types/entities'

export function ClienteFormModal({ open, onClose, initial, onSave }: { open: boolean; onClose: () => void; initial: Cliente | null; onSave: (c: Cliente) => Promise<void> | void }) {
  const { t } = useI18n()
  const [form, setForm] = useState({ nombre: '', alias: '', rfc: '', email: '', telefono: '', direccion: '', direccion_pais: '', direccion_estado: '', direccion_cp: '' })
  const { guardando, guardar } = useSaveGuard()
  useEffect(() => {
    if (open) setForm(initial
      ? { nombre: initial.nombre, alias: initial.alias || '', rfc: initial.rfc, email: initial.email, telefono: initial.telefono, direccion: initial.direccion, direccion_pais: initial.direccion_pais || '', direccion_estado: initial.direccion_estado || '', direccion_cp: initial.direccion_cp || '' }
      : { nombre: '', alias: '', rfc: '', email: '', telefono: '', direccion: '', direccion_pais: '', direccion_estado: '', direccion_cp: '' })
  }, [open, initial])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const { config } = useConfig()
  const docLabel = getDocLabel(config?.tipo_doc ?? 'RFC', config?.tipo_doc_etiqueta ?? '')
  const submit = () => guardar(async () => {
    if (!form.nombre.trim()) return
    try {
      await onSave({ ...initial, ...form } as Cliente)
      onClose()
    } catch (e) {
      throw e instanceof Error ? e : new Error('Error al guardar')
    }
  })
  return (
    <Dialog open={open} onClose={onClose} title={initial ? t('clientes.editar') : t('clientes.nuevo')}
      footer={<><Button variant="outline" onClick={onClose} disabled={guardando}>{t('common.cancelar')}</Button><Button onClick={submit} disabled={guardando}>{guardando ? t('imagenes.subiendo') : t('common.guardar')}</Button></>}>
      <div className="space-y-3">
        <div><label className="text-xs text-gray-500">{t('common.nombre')} *</label><Input value={form.nombre} onChange={set('nombre')} /></div>
        <div>
          <label className="text-xs text-gray-500">{t('clientes.alias')}</label>
          <Input value={form.alias} onChange={set('alias')} placeholder={t('clientes.aliasEj')} />
          <p className="mt-1 text-xs text-muted-foreground">{t('clientes.aliasAyuda')}</p>
        </div>
        <div><label className="text-xs text-gray-500">{docLabel}</label><Input value={form.rfc} onChange={set('rfc')} /></div>
        <div><label className="text-xs text-gray-500">{t('common.email')}</label><Input value={form.email} onChange={set('email')} /></div>
        <div><label className="text-xs text-gray-500">{t('common.telefono')}</label><Input value={form.telefono} onChange={set('telefono')} /></div>
        <div>
          <label className="text-xs text-gray-500">{t('common.direccion')}</label>
          <Input value={form.direccion} onChange={set('direccion')} placeholder={t('clientes.direccionExacta')} />
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div>
              <label className="text-xs text-gray-500">{t('clientes.pais')}</label>
              <Input value={form.direccion_pais} onChange={set('direccion_pais')} />
            </div>
            <div>
              <label className="text-xs text-gray-500">{t('clientes.estado')}</label>
              <Input value={form.direccion_estado} onChange={set('direccion_estado')} />
            </div>
            <div>
              <label className="text-xs text-gray-500">{t('clientes.cp')}</label>
              <Input value={form.direccion_cp} onChange={set('direccion_cp')} />
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t('clientes.direccionImpresion')}</p>
        </div>
      </div>
    </Dialog>
  )
}
