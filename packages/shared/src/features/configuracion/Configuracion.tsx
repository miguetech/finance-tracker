import React, { useEffect, useState } from 'react'
import { todayLocal } from '../../lib/date'
import { useConfig, useRepo } from '../../store/queries'
import { useQueryClient } from '@tanstack/react-query'
import { Card, Button, Input, Select, Dialog, Tooltip, useToast } from '../../ui/components'
import { IconPlus, IconX, IconAlert, IconSwap, IconCoins } from '../../ui/icons'
import { CURRENCIES, parseRates, tasasFrescas, fetchExchangeRates, parseCustomCurrencies, registerCurrency } from '../../currency'
import { TIPO_DOC_OPTIONS, getDocLabel } from '../../taxid'
import { FOLIO_TOKENS, expandFolioTemplate, invalidFolioTokens } from '../../calc/folio'
import { InvoicePrint } from '../../ui/print/InvoicePrint'
import { printInvoice } from '../facturas/FacturaDetail'
import { useI18n, SUPPORTED_LOCALES, LOCALE_LABELS } from '../../i18n'
import type { Config, Factura, FacturaItem } from '../../types/entities'

export function Configuracion() {
  const { t, locale, setLocale } = useI18n()
  const { config, saveConfig } = useConfig()
  const repo = useRepo()
  const qc = useQueryClient()
  const toast = useToast()
  const [form, setForm] = useState<Config | null>(null)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [ayudaFolio, setAyudaFolio] = useState(false)
  useEffect(() => { if (config && !form) setForm(config) }, [config, form])
  if (!config || !form) return <div className="p-8 text-muted-foreground">{t('common.cargando')}</div>
  const docLabel = getDocLabel(form.tipo_doc, form.tipo_doc_etiqueta)
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => f && ({ ...f, [k]: e.target.value }))
  const hoy = todayLocal()
  const folioPreview = expandFolioTemplate(String(form.prefijo_folio), hoy) + String(Math.max(1, Number(form.contador_folio) || 1)).padStart(3, '0')
  const tokensInvalidos = invalidFolioTokens(String(form.prefijo_folio))
  const numIva = Number(form.iva_porcentaje)
  const numContador = Number(form.contador_folio)
  const errors: Record<string, string> = {}
  if (!form.empresa_nombre.trim()) errors.nombre = t('errors.nombreObligatorio')
  if (!String(form.prefijo_folio).trim()) errors.prefijo = t('errors.prefijoObligatorio')
  if (String(form.iva_porcentaje).trim() === '' || isNaN(numIva) || numIva < 0 || numIva > 100) errors.iva = t('errors.ivaRango')
  if (String(form.contador_folio).trim() === '' || !Number.isInteger(numContador) || numContador < 0) errors.contador = t('errors.contadorEntero')

  const sampleFactura = (): { factura: Factura; items: FacturaItem[] } => {
    const items = [{ descripcion: 'Concepto de ejemplo', cantidad: 1, precio_unitario: 100, importe: 100 }]
    const subtotal = 100
    const iva = Math.round(subtotal * (numIva || 0)) / 100
    return {
      factura: {
        id_factura: 'preview', folio: folioPreview, id_cliente: '', nombre_cliente: 'Cliente de ejemplo',
        fecha_emision: hoy, fecha_vencimiento: '', subtotal, iva, total: subtotal + iva,
        saldo: subtotal + iva, fecha_pago: '', notas: 'Factura de ejemplo', moneda: form.moneda, tipo_cambio: 1, editada: '', fecha_edicion: ''
      },
      items
    }
  }

  const submit = async () => {
    if (Object.keys(errors).length > 0) { toast(t('configuracion.revisaCampos'), 'error'); return }
    try {
      const fresh = await qc.fetchQuery({ queryKey: ['config'], queryFn: () => repo.getConfig() })
      await saveConfig.mutateAsync({
        ...form,
        contador_folio: Math.max(fresh.contador_folio, numContador),
        iva_porcentaje: numIva
      })
      toast(t('configuracion.guardada'))
    } catch (e) { toast((e as Error).message, 'error') }
  }
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{t('configuracion.title')}</h1>
      <Card title={t('configuracion.idioma')}>
        <Select value={locale} onChange={setLocale as (v: string) => void}
          options={SUPPORTED_LOCALES.map(l => ({ value: l, label: LOCALE_LABELS[l] }))} />
      </Card>
      <Card title={t('configuracion.datosEmpresa')}>
        <div className="space-y-3">
          <div><label className="text-xs text-muted-foreground">{t('configuracion.empresaNombre')} *</label><Input value={form.empresa_nombre} onChange={set('empresa_nombre')} error={errors.nombre} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">{t('configuracion.tipoDoc')}</label>
              <Select value={form.tipo_doc} onChange={v => setForm(f => f && ({ ...f, tipo_doc: v as Config['tipo_doc'] }))} options={TIPO_DOC_OPTIONS} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{docLabel}</label>
              <Input value={form.empresa_rfc} onChange={set('empresa_rfc')} />
            </div>
            {form.tipo_doc === 'Otro' && (
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">{t('configuracion.etiquetaDoc')}</label>
                <Input value={form.tipo_doc_etiqueta} onChange={set('tipo_doc_etiqueta')} placeholder={t('configuracion.ejTipoDoc')} />
              </div>
            )}
            <div><label className="text-xs text-muted-foreground">{t('common.telefono')}</label><Input value={form.empresa_telefono} onChange={set('empresa_telefono')} /></div>
          </div>
          <div><label className="text-xs text-muted-foreground">{t('common.email')}</label><Input value={form.empresa_email} onChange={set('empresa_email')} /></div>
          <div><label className="text-xs text-muted-foreground">{t('common.direccion')}</label><Input value={form.empresa_direccion} onChange={set('empresa_direccion')} /></div>
          <div><label className="text-xs text-muted-foreground">{t('configuracion.logo')}</label><Input value={form.empresa_logo} onChange={set('empresa_logo')} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className="text-xs text-muted-foreground">{t('configuracion.codigoPostal')}</label><Input value={form.empresa_cp} onChange={set('empresa_cp')} /></div>
            <div><label className="text-xs text-muted-foreground">{t('configuracion.ciudad')}</label><Input value={form.empresa_ciudad} onChange={set('empresa_ciudad')} /></div>
            <div><label className="text-xs text-muted-foreground">{t('configuracion.pais')}</label><Input value={form.empresa_pais} onChange={set('empresa_pais')} /></div>
          </div>
          {form.empresa_logo && (
            <img src={form.empresa_logo} alt="Logo" className="h-12 mt-1 rounded-lg border border-gray-200 object-contain bg-white"
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
          )}
        </div>
      </Card>
      <Card title={t('configuracion.facturacion')}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-xs text-muted-foreground">{t('configuracion.prefijoFolio')} *</label>
                <Tooltip text={`${t('configuracion.tokens')}: ${FOLIO_TOKENS.map(tk => tk.token).join(' ')}. ${t('configuracion.ejemplo')}: FAC-{YYYY}-{MM}- → FAC-2026-08-001.`}>
                  <IconAlert className="w-3.5 h-3.5 text-muted-foreground" />
                </Tooltip>
                <button type="button" onClick={() => setAyudaFolio(a => !a)} className="text-xs text-primary underline decoration-dotted underline-offset-2 hover:text-primary-hover">{t('configuracion.comoConfigurar')}</button>
              </div>
              <Input value={form.prefijo_folio} onChange={set('prefijo_folio')} error={errors.prefijo} />
              {ayudaFolio && (
                <div className="mt-2 rounded-lg border border-gray-100 bg-muted/50 p-3 text-xs text-muted-foreground space-y-1.5">
                  {FOLIO_TOKENS.map(tk => (
                    <div key={tk.token} className="flex justify-between gap-3"><span className="font-mono text-gray-700">{tk.token}</span><span>{tk.descripcion} — ej. {tk.ejemplo}</span></div>
                  ))}
                  <div className="pt-1.5 border-t border-gray-100 text-muted-foreground">
                    {t('configuracion.ejemplos')} <code className="font-mono">FAC-</code> → FAC-001 · <code className="font-mono">FAC-{'{YYYY}'}-</code> → FAC-2026-001 · <code className="font-mono">FAC-{'{YYYY}'}-{'{MM}'}-</code> → FAC-2026-08-001
                  </div>
                </div>
              )}
              {tokensInvalidos.length > 0 && <p className="mt-1 text-xs text-amber-600">{t('configuracion.tokenInvalido', { tokens: tokensInvalidos.join(', ') })}</p>}
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-xs text-muted-foreground">{t('configuracion.contadorActual')}</label>
                <Tooltip text={t('configuracion.contadorTooltip')}>
                  <IconAlert className="w-3.5 h-3.5 text-muted-foreground" />
                </Tooltip>
              </div>
              <Input type="number" min={0} value={form.contador_folio} onChange={set('contador_folio')} error={errors.contador} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-xs text-muted-foreground">{t('configuracion.iva')}</label>
                <Tooltip text={t('configuracion.ivaTooltip')}>
                  <IconAlert className="w-3.5 h-3.5 text-muted-foreground" />
                </Tooltip>
              </div>
              <Input type="number" min={0} max={100} step="any" value={form.iva_porcentaje} onChange={set('iva_porcentaje')} error={errors.iva} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-xs text-muted-foreground">{t('configuracion.moneda')}</label>
                <Tooltip text={t('configuracion.monedaTooltip')}>
                  <IconAlert className="w-3.5 h-3.5 text-muted-foreground" />
                </Tooltip>
              </div>
              <Select value={form.moneda} onChange={v => setForm(f => f && ({ ...f, moneda: v }))} options={CURRENCIES.map(c => ({ value: c.code, label: `${c.code} · ${c.name}` }))} />
            </div>
          </div>
          <div className="text-sm text-muted-foreground">{t('configuracion.proximaFactura', { folio: folioPreview })}</div>
          <Button variant="outline" icon={<IconAlert className="w-4 h-4" />} onClick={() => setPreviewOpen(true)}>{t('configuracion.vistaPrevia')}</Button>
        </div>
      </Card>
      <Card title={t('configuracion.monedasTipo')}>
        <MonedasCard config={form} setForm={fn => setForm(f => f && fn(f))} />
      </Card>
      <Card title={t('configuracion.categorias')}>
        <div className="space-y-5">
          <CategoriasEditor title={t('gastos.title')} value={form.categorias_gastos} onChange={v => setForm(f => f && ({ ...f, categorias_gastos: v }))} />
          <CategoriasEditor title={t('cuentas.title')} value={form.categorias_cxp} onChange={v => setForm(f => f && ({ ...f, categorias_cxp: v }))} />
          <CategoriasEditor title={t('inventario.title')} value={form.categorias_inventario} onChange={v => setForm(f => f && ({ ...f, categorias_inventario: v }))} />
          <CategoriasEditor title={t('configuracion.metodosPago')} value={form.metodos_pago} onChange={v => setForm(f => f && ({ ...f, metodos_pago: v }))} />
        </div>
      </Card>
      <Button onClick={submit}>{t('configuracion.guardarConfig')}</Button>
      {previewOpen && (
        <Dialog open onClose={() => setPreviewOpen(false)} title={t('configuracion.vistaPrevia')}
          footer={<>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>{t('common.cerrar')}</Button>
            <Button onClick={() => printInvoice(`${t('facturas.factura')} ${folioPreview}`)}>{t('configuracion.imprimirDescargar')}</Button>
          </>}>
          <InvoicePrint factura={sampleFactura().factura} items={sampleFactura().items} config={form} />
        </Dialog>
      )}
    </div>
  )
}

function CategoriasEditor({ title, value, onChange }: { title: string; value: string; onChange: (s: string) => void }) {
  const [open, setOpen] = useState(false)
  const [nueva, setNueva] = useState('')
  const [error, setError] = useState('')
  const items = value.split(',').map(s => s.trim()).filter(Boolean)

  const add = () => {
    const v = nueva.trim()
    if (!v) { setError('Escribe una categoría'); return }
    if (items.some(i => i.toLowerCase() === v.toLowerCase())) { setError('Ya existe esa categoría'); return }
    onChange([...items, v].join(','))
    setNueva(''); setError(''); setOpen(false)
  }

  return (
    <div>
      <div className="text-xs text-muted-foreground mb-2">{title}</div>
      <div className="flex flex-wrap gap-2">
        {items.map(c => (
          <span key={c} className="inline-flex items-center gap-1.5 bg-primary-soft text-primary rounded-full pl-3 pr-1.5 py-1 text-sm font-medium">
            {c}
            <button type="button" onClick={() => onChange(items.filter(x => x !== c).join(','))}
              className="p-0.5 rounded-full hover:bg-primary/15 text-primary" aria-label={`Quitar ${c}`}>
              <IconX className="w-3.5 h-3.5" />
            </button>
          </span>
        ))}
        <Button variant="outline" size="sm" icon={<IconPlus className="w-4 h-4" />} onClick={() => setOpen(true)}>Agregar</Button>
      </div>
      <Dialog open={open} onClose={() => { setOpen(false); setError(''); setNueva('') }} title={`Agregar categoría (${title})`}
        footer={<>
          <Button variant="outline" onClick={() => { setOpen(false); setError(''); setNueva('') }}>Cancelar</Button>
          <Button onClick={add}>Agregar</Button>
        </>}>
        <Input value={nueva} onChange={e => { setNueva(e.target.value); setError('') }} placeholder="Nueva categoría…" error={error || undefined} autoFocus />
      </Dialog>
    </div>
  )
}

function MonedasCard({ config, setForm }: { config: Config; setForm: (fn: (f: Config) => Config) => void }) {
  const toast = useToast()
  const [rateDrafts, setRateDrafts] = useState<Record<string, string>>({})
  const [custom, setCustom] = useState({ code: '', symbol: '', decimals: '2' })
  const [actualizando, setActualizando] = useState(false)

  const all = [...CURRENCIES, ...parseCustomCurrencies(config.monedas_custom)]
  const activeCodes = (config.monedas_activas || '').split(',').map(s => s.trim()).filter(Boolean)
  const active = activeCodes.length ? all.filter(c => activeCodes.includes(c.code)) : all
  const rates = parseRates(config.tasas_cambio)
  const frescas = tasasFrescas(rates)
  const base = config.moneda

  const toggleActiva = (code: string, on: boolean) => {
    const cur = new Set(activeCodes)
    if (on) cur.add(code); else cur.delete(code)
    setForm(f => ({ ...f, monedas_activas: [...cur].join(',') }))
  }

  const saveRate = (code: string) => {
    const v = Number(rateDrafts[code])
    if (!rateDrafts[code] || !Number.isFinite(v) || v <= 0) { toast('Tasa inválida', 'error'); return }
    const r = parseRates(config.tasas_cambio) ?? { base, fecha: '', rates: {} }
    setForm(f => ({ ...f, tasas_cambio: JSON.stringify({ ...r, base, fecha: r.fecha, rates: { ...r.rates, [code]: v } }) }))
    setRateDrafts(d => { const n = { ...d }; delete n[code]; return n })
    toast(`Tasa de ${code} guardada`)
  }

  const actualizar = async () => {
    setActualizando(true)
    try {
      const { rates: fetched, fecha } = await fetchExchangeRates(base)
      const r = parseRates(config.tasas_cambio) ?? { base, fecha: '', rates: {} }
      const merged: Record<string, number> = { ...r.rates }
      for (const c of all) if (fetched[c.code]) merged[c.code] = fetched[c.code]
      setForm(f => ({ ...f, tasas_cambio: JSON.stringify({ base, fecha, rates: merged }) }))
      toast(`Tasas actualizadas (${fecha})`)
    } catch (e) {
      toast((e as Error).message, 'error')
    }
    setActualizando(false)
  }

  const addCustom = () => {
    const code = custom.code.trim().toUpperCase()
    if (!code || code.length < 2) { toast('Escribe el código ISO (ej. XYZ)', 'error'); return }
    const dec = Math.max(0, Math.min(4, Number(custom.decimals) || 0))
    const existing = parseCustomCurrencies(config.monedas_custom)
    if (existing.some(c => c.code === code) || CURRENCIES.some(c => c.code === code)) { toast('Esa moneda ya existe', 'error'); return }
    const cur = { code, symbol: custom.symbol.trim() || code, decimals: dec, locale: 'es-VE', name: code }
    setForm(f => ({ ...f, monedas_custom: JSON.stringify([...existing, cur]) }))
    registerCurrency(cur)
    setCustom({ code: '', symbol: '', decimals: '2' })
    toast(`Moneda ${code} agregada`)
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs text-muted-foreground mb-2">Moneda base (la de tus reportes)</div>
        <Select value={base} onChange={v => setForm(f => ({ ...f, moneda: v }))} options={all.map(c => ({ value: c.code, label: `${c.code} · ${c.symbol} · ${c.name}` }))} />
        <p className="mt-1 text-xs text-muted-foreground">Los reportes y el dashboard se muestran en esta moneda. Facturas, gastos y nómina pueden registrarse en otra moneda y se convierten aquí.</p>
      </div>

      <div>
        <div className="text-xs text-muted-foreground mb-2">Monedas disponibles (activas)</div>
        <div className="flex flex-wrap gap-2">
          {all.map(c => {
            const on = active.some(a => a.code === c.code)
            return (
              <button key={c.code} type="button" onClick={() => toggleActiva(c.code, !on)}
                className={on ? 'inline-flex items-center gap-1 bg-primary-soft text-primary rounded-full pl-3 pr-3 py-1 text-sm font-medium border border-primary/30' : 'inline-flex items-center gap-1 bg-muted text-gray-500 rounded-full pl-3 pr-3 py-1 text-sm border border-gray-200'}>
                {c.code} · {c.symbol}
              </button>
            )
          })}
        </div>
      </div>

      <div className="rounded-xl border border-gray-100 bg-muted/40 p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="font-medium text-sm flex items-center gap-1.5"><IconSwap className="w-4 h-4" /> Tipo de cambio</div>
          <Button size="sm" variant="outline" icon={<IconCoins className="w-4 h-4" />} onClick={actualizar} disabled={actualizando}>
            {actualizando ? 'Consultando…' : 'Actualizar automático'}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">1 {base} = cuánto de cada moneda. Se actualiza con la API pública open.er-api.com y siempre puedes corregirlo a mano (sin internet).</p>
        {rates && rates.fecha && (
          <p className={frescas ? 'text-xs text-emerald-700' : 'text-xs text-amber-600'}>
            {frescas ? `Actualizado: ${rates.fecha}` : `Tasa del ${rates.fecha} — revisa el tipo de cambio`}
          </p>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {active.filter(c => c.code !== base).map(c => {
            const tasa = rates?.rates?.[c.code]
            return (
              <div key={c.code} className="flex items-center gap-2 rounded-lg bg-white border border-gray-100 px-3 py-2">
                <div className="text-sm font-medium w-24 shrink-0">{c.code} · {c.symbol}</div>
                <Input className="flex-1" type="number" step="any" min={0} placeholder={tasa ? String(tasa) : 'Tasa'}
                  value={rateDrafts[c.code] ?? ''} onChange={e => setRateDrafts(d => ({ ...d, [c.code]: e.target.value }))} />
                <Button size="sm" variant="outline" onClick={() => saveRate(c.code)}>Guardar</Button>
              </div>
            )
          })}
          {active.filter(c => c.code !== base).length === 0 && <p className="text-xs text-muted-foreground">Agrega otra moneda activa para configurar su tasa.</p>}
        </div>
      </div>

      <div>
        <div className="text-xs text-muted-foreground mb-2">Agregar moneda personalizada</div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
          <Input placeholder="Código (ej. VED)" value={custom.code} onChange={e => setCustom(c => ({ ...c, code: e.target.value }))} />
          <Input placeholder="Símbolo (ej. Bs.)" value={custom.symbol} onChange={e => setCustom(c => ({ ...c, symbol: e.target.value }))} />
          <Input type="number" placeholder="Decimales (2)" value={custom.decimals} onChange={e => setCustom(c => ({ ...c, decimals: e.target.value }))} />
          <Button variant="outline" icon={<IconPlus className="w-4 h-4" />} onClick={addCustom}>Agregar</Button>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">Útil si tu país no está en la lista. La tasa se configura arriba.</p>
      </div>
    </div>
  )
}
