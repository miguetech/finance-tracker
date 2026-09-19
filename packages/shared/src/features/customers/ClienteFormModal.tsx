import React, { useEffect, useState } from 'react'
import { Dialog, Button, Input } from '../../ui/components'
import { useConfig } from '../../store/queries'
import { getDocLabel } from '../../taxid'
import { useI18n } from '../../i18n'
import { useSaveGuard } from '../../ui/hooks'
import type { Cliente } from '../../types/entities'

export function ClienteFormModal({ open, onClose, initial, onSave }: { open: boolean; onClose: () => void; initial: Cliente | null; onSave: (c: Cliente) => Promise<void> | void }) {
  const { t } = useI18n()
  const [form, setForm] = useState({ name: '', alias: '', rfc: '', email: '', phone: '', address: '', address_country: '', address_state: '', address_zip: '' })
  const { guardando, guardar } = useSaveGuard()
  useEffect(() => {
    if (open) setForm(initial
      ? { name: initial.name, alias: initial.alias || '', rfc: initial.rfc, email: initial.email, phone: initial.phone, address: initial.address, address_country: initial.address_country || '', address_state: initial.address_state || '', address_zip: initial.address_zip || '' }
      : { name: '', alias: '', rfc: '', email: '', phone: '', address: '', address_country: '', address_state: '', address_zip: '' })
  }, [open, initial])
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [k]: e.target.value }))
  const { config } = useConfig()
  const docLabel = getDocLabel(config?.tipo_doc ?? 'RFC', config?.doc_type_label ?? '')
  const submit = () => guardar(async () => {
    if (!form.name.trim()) return
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
        <div><label className="text-xs text-gray-500">{t('common.nombre')} *</label><Input value={form.name} onChange={set('name')} /></div>
        <div>
          <label className="text-xs text-gray-500">{t('clientes.alias')}</label>
          <Input value={form.alias} onChange={set('alias')} placeholder={t('clientes.aliasEj')} />
          <p className="mt-1 text-xs text-muted-foreground">{t('clientes.aliasAyuda')}</p>
        </div>
        <div><label className="text-xs text-gray-500">{docLabel}</label><Input value={form.rfc} onChange={set('rfc')} /></div>
        <div><label className="text-xs text-gray-500">{t('common.email')}</label><Input value={form.email} onChange={set('email')} /></div>
        <div><label className="text-xs text-gray-500">{t('common.telefono')}</label><Input value={form.phone} onChange={set('phone')} /></div>
        <div>
          <label className="text-xs text-gray-500">{t('common.direccion')}</label>
          <Input value={form.address} onChange={set('direccion')} placeholder={t('clientes.direccionExacta')} />
          <div className="grid grid-cols-3 gap-2 mt-2">
            <div>
              <label className="text-xs text-gray-500">{t('clientes.pais')}</label>
              <Input value={form.address_country} onChange={set('address_country')} />
            </div>
            <div>
              <label className="text-xs text-gray-500">{t('clientes.estado')}</label>
              <Input value={form.address_state} onChange={set('address_state')} />
            </div>
            <div>
              <label className="text-xs text-gray-500">{t('clientes.cp')}</label>
              <Input value={form.address_zip} onChange={set('address_zip')} />
            </div>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">{t('clientes.direccionImpresion')}</p>
        </div>
      </div>
    </Dialog>
  )
}
