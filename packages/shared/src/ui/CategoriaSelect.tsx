import React, { useState } from 'react'
import { useConfig } from '../store/queries'
import { useI18n } from '../i18n'
import { IconPlus } from './icons'
import { Button, Input, useToast } from './components'
import type { Config } from '../types/entities'

type ConfigKey = 'categorias_gastos' | 'categorias_cxp' | 'categorias_inventario'

/** Selector de categorías estandarizado con creación rápida (+ Nueva categoría).
 *  `configKey` indica la lista de configuración donde se guarda la nueva categoría. */
export function CategoriaQuickSelect({ configKey, value, onChange, label, placeholder }: {
  configKey: ConfigKey
  value: string
  onChange: (v: string) => void
  label?: string
  placeholder?: string
}) {
  const { t } = useI18n()
  const toast = useToast()
  const { config, saveConfig } = useConfig()
  const categorias = (config?.[configKey] ?? '').split(',').map(s => s.trim()).filter(Boolean)
  const [nueva, setNueva] = useState(false)
  const [nombre, setNombre] = useState('')
  const [guardando, setGuardando] = useState(false)

  const crear = async () => {
    const nombreLimpio = nombre.trim()
    if (!nombreLimpio) return
    if (categorias.some(c => c.toLowerCase() === nombreLimpio.toLowerCase())) {
      onChange(nombreLimpio)
      setNueva(false)
      setNombre('')
      return
    }
    setGuardando(true)
    try {
      const siguiente = [...categorias, nombreLimpio].join(',')
      await saveConfig.mutateAsync({ ...(config as Config), [configKey]: siguiente })
      onChange(nombreLimpio)
      toast(t('configuracion.categoriasUI.creada', { nombre: nombreLimpio }))
      setNueva(false)
      setNombre('')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setGuardando(false)
    }
  }

  return (
    <div>
      {label && <label className="text-xs text-gray-500">{label}</label>}
      {!nueva ? (
        <div className="flex gap-1.5 items-center">
          <select value={value} onChange={e => onChange(e.target.value)}
            className="flex-1 h-10 px-3.5 text-sm rounded-xl border border-gray-200 bg-surface focus:outline-none focus:ring-2 focus:border-primary focus:ring-primary/25">
            <option value="">{placeholder ?? t('common.seleccionar')}</option>
            {[...new Set([...categorias, value].filter(Boolean))].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <button type="button" onClick={() => setNueva(true)} title={t('configuracion.categoriasUI.nueva')}
            className="inline-flex shrink-0 items-center gap-0.5 h-10 px-2.5 rounded-xl text-xs text-primary border border-primary/25 bg-primary-soft hover:bg-primary-soft/70">
            <IconPlus className="w-3.5 h-3.5" /> {t('configuracion.categoriasUI.nueva')}
          </button>
        </div>
      ) : (
        <div className="flex gap-1.5 items-center">
          <Input autoFocus value={nombre} onChange={e => setNombre(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); void crear() } }}
            placeholder={t('configuracion.categoriasUI.nombreNueva')} className="flex-1" />
          <Button size="sm" onClick={crear} disabled={guardando}>{guardando ? t('imagenes.subiendo') : t('common.guardar')}</Button>
          <Button size="sm" variant="ghost" onClick={() => { setNueva(false); setNombre('') }} disabled={guardando}>{t('common.cancelar')}</Button>
        </div>
      )}
    </div>
  )
}
