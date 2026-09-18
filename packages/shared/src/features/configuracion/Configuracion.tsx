import React, { useEffect, useState } from 'react'
import { todayLocal } from '../../lib/date'
import { useConfig, useRepo } from '../../store/queries'
import { useQueryClient } from '@tanstack/react-query'
import type { Repository } from '../../data/repository'
import { cargarRegistroSesion, configurarPin, verificarPin, activarCifradoEspejo, desactivarCifradoEspejo } from '../../auth/sesionOffline'
import { localStorageAdapter } from '../../data/storage'
import type { RegistroSesion } from '../../auth/sesionOffline'
import { AlmacenamientoCard } from './AlmacenamientoCard'
import { Card, Button, Input, Select, Dialog, Tooltip, useToast } from '../../ui/components'
import { IconPlus, IconX, IconAlert, IconSwap, IconCoins } from '../../ui/icons'
import { CURRENCIES, parseRates, tasasFrescas, fetchExchangeRates, parseCustomCurrencies, registerCurrency } from '../../currency'
import { TIPO_DOC_OPTIONS, getDocLabel } from '../../taxid'
import { FOLIO_TOKENS, expandFolioTemplate, invalidFolioTokens } from '../../calc/folio'
import { InvoicePrint } from '../../ui/print/InvoicePrint'
import { printInvoice } from '../facturas/FacturaDetail'
import { ImageUploader } from '../../ui/ImageUploader'
import { optimizeImage } from '../../lib/image'
import { useI18n, SUPPORTED_LOCALES, LOCALE_LABELS } from '../../i18n'
import { useTasasHistorial } from '../../store/queries'
import { parseComisiones } from '../../reports/comisiones'
import { parseMetas } from '../../reports/metas'
import type { Config, Factura, FacturaItem } from '../../types/entities'

export function Configuracion() {
  const { t, locale, setLocale } = useI18n()
  const { config, saveConfig, isLoading: configLoading } = useConfig()
  const repo = useRepo()
  const qc = useQueryClient()
  const [regPin, setRegPin] = useState<RegistroSesion | null>(null)
  const [pinActual, setPinActual] = useState('')
  const [pinNuevo, setPinNuevo] = useState('')
  useEffect(() => { void cargarRegistroSesion(localStorageAdapter).then(setRegPin) }, [])
  const guardarPinConfig = async () => {
    try {
      if (regPin?.pin && !(await verificarPin(localStorageAdapter, pinActual))) {
        toast(t('seguridad.pinActualIncorrecto'), 'error'); return
      }
      await configurarPin(localStorageAdapter, pinNuevo)
      if (!regPin?.pin) await activarCifradoEspejo(localStorageAdapter, pinNuevo)
      setRegPin(await cargarRegistroSesion(localStorageAdapter))
      setPinActual(''); setPinNuevo('')
      toast(t('seguridad.pinGuardado'))
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }
  const toggleCifrado = async () => {
    try {
      if (regPin?.cifrado) await desactivarCifradoEspejo(localStorageAdapter)
      else await activarCifradoEspejo(localStorageAdapter, pinActual || pinNuevo)
      setRegPin(await cargarRegistroSesion(localStorageAdapter))
      toast(t('seguridad.actualizado'))
    } catch (e) {
      toast((e as Error).message, 'error')
    }
  }
  const toast = useToast()
  const [form, setForm] = useState<Config | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [migrandoImgs, setMigrandoImgs] = useState(false)
  const [dangerOpen, setDangerOpen] = useState(false)
  const [dangerAction, setDangerAction] = useState<'completo' | 'nuclear' | null>(null)
  const migrarImgs = async () => {
    setMigrandoImgs(true)
    try {
      const r = await (repo as Repository).migrarImagenesADrive()
      toast(t('configuracion.imgsMigradas').replace('{n}', String(r.migradas)).replace('{e}', String(r.fallidas)), r.fallidas ? 'error' : 'success')
    } catch (e) {
      toast((e as Error).message, 'error')
    } finally {
      setMigrandoImgs(false)
    }
  }
  const [subiendo, setSubiendo] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  const [ayudaFolio, setAyudaFolio] = useState(false)
  useEffect(() => { if (config) setForm(config) }, [config])
  const tarjetaSeguridad = (
    <section className="mb-6 rounded-xl border border-gray-200 bg-surface p-5">
      <h2 className="font-semibold mb-1">{t('seguridad.titulo')}</h2>
      <p className="text-xs text-muted-foreground mb-3">{t('seguridad.descripcion')}</p>
      {!regPin ? (
        <p className="text-sm text-muted-foreground">{t('seguridad.sinSesion')}</p>
      ) : (
        <div className="space-y-2 max-w-md">
          {regPin.pin && (
            <Input type="password" value={pinActual} onChange={e => setPinActual(e.target.value)} placeholder={t('seguridad.pinActual')} inputMode="numeric" />
          )}
          <Input type="password" value={pinNuevo} onChange={e => setPinNuevo(e.target.value)} placeholder={t('seguridad.pinNuevo')} inputMode="numeric" />
          <div className="flex gap-2">
            <Button onClick={() => void guardarPinConfig()} disabled={pinNuevo.length < 4}>{regPin.pin ? t('seguridad.cambiarPin') : t('seguridad.configurarPin')}</Button>
            {regPin.pin && (
              <Button variant="outline" onClick={() => void toggleCifrado()} disabled={!pinActual && !pinNuevo}>
                {regPin.cifrado ? t('seguridad.desactivarCifrado') : t('seguridad.activarCifrado')}
              </Button>
            )}
          </div>
          <p className="text-[11px] text-muted-foreground">
            {regPin.cifrado ? t('seguridad.cifradoActivo') : t('seguridad.cifradoInactivo')}
            {' · '}
            {t('seguridad.sinEmail')}
          </p>
        </div>
      )}
    </section>
  )
  const tarjetaHoja = (
    <section className="mb-6 rounded-xl border border-gray-200 bg-surface p-5">
      <h2 className="font-semibold mb-1">{t('almacen.titulo')}</h2>
      <p className="text-xs text-muted-foreground mb-3">{t('hoja.descripcion')}</p>
      <AlmacenamientoCard />
    </section>
  )
  if (!config || !form) {
    // La config no cargó (p. ej. hoja vinculada incorrecta): nunca bloquear el acceso
    // al panel de almacenamiento para que el usuario pueda corregir el vínculo.
    return (
      <div className="space-y-6">
        <h1 className="text-xl font-bold">{t('configuracion.title')}</h1>
        {configLoading ? (
          <div className="p-4 text-muted-foreground">{t('common.cargando')}</div>
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">{t('configuracion.sinConfigAlerta')}</div>
        )}
        {tarjetaHoja}
        {tarjetaSeguridad}
      </div>
    )
  }
  const docLabel = getDocLabel(form.tipo_doc, form.doc_type_label)
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => f && ({ ...f, [k]: e.target.value }))
  const hoy = todayLocal()
  const folioPreview = expandFolioTemplate(String(form.serial_prefix), hoy) + String(Math.max(1, Number(form.serial_counter) || 1)).padStart(3, '0')
  const tokensInvalidos = invalidFolioTokens(String(form.serial_prefix))
  const numIva = Number(form.vat_percent)
  const numContador = Number(form.serial_counter)
  const errors: Record<string, string> = {}
  if (!form.company_name.trim()) errors.nombre = t('errors.nombreObligatorio')
  if (!String(form.serial_prefix).trim()) errors.prefijo = t('errors.prefijoObligatorio')
  if (String(form.vat_percent).trim() === '' || isNaN(numIva) || numIva < 0 || numIva > 100) errors.iva = t('errors.ivaRango')
  if (String(form.serial_counter).trim() === '' || !Number.isInteger(numContador) || numContador < 0) errors.contador = t('errors.contadorEntero')

  const sampleFactura = (): { factura: Factura; items: FacturaItem[] } => {
    const items = [{ descripcion: 'Concepto de ejemplo', cantidad: 1, unit_price: 100, importe: 100 }]
    const subtotal = 100
    const iva = Math.round(subtotal * (numIva || 0)) / 100
    return {
      factura: {
        invoice_id: 'preview', folio: folioPreview, customer_id: '', customer_name: 'Cliente de ejemplo',
        issue_date: hoy, due_date: '', subtotal, iva, total: subtotal + iva,
        saldo: subtotal + iva, paid_at: '', notas: 'Factura de ejemplo', moneda: form.moneda, exchange_rate: 1, editada: '', edited_at: ''
      },
      items
    }
  }

  const submit = async () => {
    if (Object.keys(errors).length > 0) { toast(t('configuracion.revisaCampos'), 'error'); return }
    setSubiendo(true)
    try {
      let logo = form.company_logo
      if (logoFile) {
        const { base64, mimeType } = await optimizeImage(logoFile)
        logo = await repo.uploadImagen({ nombre: `logo_${Date.now()}.${mimeType.split('/')[1] || 'png'}`, mimeType, base64, modulo: 'configuracion' })
      }
      const fresh = await qc.fetchQuery({ queryKey: ['config'], queryFn: () => repo.getConfig() })
      await saveConfig.mutateAsync({
        ...form,
        company_logo: logo,
        serial_counter: Math.max(fresh.serial_counter, numContador),
        vat_percent: numIva
      })
      toast(t('configuracion.guardada'))
    } catch (e) { toast((e as Error).message, 'error') }
    finally { setSubiendo(false) }
  }
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">{t('configuracion.title')}</h1>
      {tarjetaHoja}
      {tarjetaSeguridad}
      <Card title={t('configuracion.idioma')}>
        <Select value={locale} onChange={setLocale as (v: string) => void}
          options={SUPPORTED_LOCALES.map(l => ({ value: l, label: LOCALE_LABELS[l] }))} />
      </Card>
      <Card title={t('configuracion.datosEmpresa')}>
        <div className="space-y-3">
          <div><label className="text-xs text-muted-foreground">{t('configuracion.empresaNombre')} *</label><Input value={form.company_name} onChange={set('empresa_nombre')} error={errors.nombre} /></div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-muted-foreground">{t('configuracion.tipoDoc')}</label>
              <Select value={form.tipo_doc} onChange={v => setForm(f => f && ({ ...f, tipo_doc: v as Config['tipo_doc'] }))} options={TIPO_DOC_OPTIONS} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">{docLabel}</label>
              <Input value={form.company_tax_id} onChange={set('empresa_rfc')} />
            </div>
            {form.tipo_doc === 'Otro' && (
              <div className="sm:col-span-2">
                <label className="text-xs text-muted-foreground">{t('configuracion.etiquetaDoc')}</label>
                <Input value={form.doc_type_label} onChange={set('tipo_doc_etiqueta')} placeholder={t('configuracion.ejTipoDoc')} />
              </div>
            )}
            <div><label className="text-xs text-muted-foreground">{t('common.telefono')}</label><Input value={form.company_phone} onChange={set('empresa_telefono')} /></div>
          </div>
          <div><label className="text-xs text-muted-foreground">{t('common.email')}</label><Input value={form.company_email} onChange={set('empresa_email')} /></div>
          <div><label className="text-xs text-muted-foreground">{t('common.direccion')}</label><Input value={form.company_address} onChange={set('empresa_direccion')} /></div>
          <div>
            <label className="text-xs text-muted-foreground">{t('configuracion.logo')}</label>
            <div className="mt-1"><ImageUploader value={form.company_logo} onChange={f => setLogoFile(f)} /></div>
            <p className="mt-1 text-xs text-muted-foreground">{t('configuracion.logoUrlOpcional')}</p>
            <Input value={form.company_logo} onChange={set('empresa_logo')} placeholder="https://…" className="mt-1" />
            {/* F1: migra imágenes base64 embebidas (productos/logo) a Drive */}
            <button type="button" className="mt-2 text-xs text-blue-600 hover:underline disabled:opacity-50"
              disabled={migrandoImgs} onClick={() => void migrarImgs()}>
              {migrandoImgs ? t('configuracion.migrandoImgs') : t('configuracion.migrarImgs')}
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div><label className="text-xs text-muted-foreground">{t('configuracion.codigoPostal')}</label><Input value={form.company_zip} onChange={set('empresa_cp')} /></div>
            <div><label className="text-xs text-muted-foreground">{t('configuracion.ciudad')}</label><Input value={form.company_city} onChange={set('empresa_ciudad')} /></div>
            <div><label className="text-xs text-muted-foreground">{t('configuracion.pais')}</label><Input value={form.company_country} onChange={set('empresa_pais')} /></div>
          </div>
          <div className="mt-3 pt-3 border-t border-gray-100">
            <label className="text-xs text-muted-foreground">{t('configuracion.nombreBaseHoja')}</label>
            <div className="mt-1 flex items-center gap-2">
              <Input value={form.baseSheetName} onChange={set('nombreBaseHoja')} placeholder="FinanceTracker" className="max-w-md" />
              <span className="text-xs text-gray-400">→ FinanceTracker 2026, FinanceTracker 2027…</span>
            </div>
            <p className="mt-1 text-xs text-gray-500">{t('configuracion.nombreBaseHojaAyuda')}</p>
          </div>
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
              <Input value={form.serial_prefix} onChange={set('prefijo_folio')} error={errors.prefijo} />
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
              <Input type="number" min={0} value={form.serial_counter} onChange={set('contador_folio')} error={errors.contador} />
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1">
                <label className="text-xs text-muted-foreground">{t('configuracion.iva')}</label>
                <Tooltip text={t('configuracion.ivaTooltip')}>
                  <IconAlert className="w-3.5 h-3.5 text-muted-foreground" />
                </Tooltip>
              </div>
              <Input type="number" min={0} max={100} step="any" value={form.vat_percent} onChange={set('iva_porcentaje')} error={errors.iva} />
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
      <Card title={t('configuracion.tasaDia')}>
        <TasaDiaCard config={form} setForm={fn => setForm(f => f && fn(f))} onSaved={submit} />
      </Card>
      <Card title={t('configuracion.comisiones')}>
        <ComisionesCard config={form} setForm={fn => setForm(f => f && fn(f))} />
      </Card>
      <Card title={t('configuracion.metas')}>
        <MetasCard config={form} setForm={fn => setForm(f => f && fn(f))} moneda={form.moneda} />
      </Card>
      <Card title={t('configuracion.permisosGoogle')}>
        <PermisosGoogleCard config={form} setForm={fn => setForm(f => f && fn(f))} />
      </Card>
      <Card title={t('configuracion.categorias')}>
        <div className="space-y-5">
          <CategoriasEditor title={t('gastos.title')} value={form.expense_categories} onChange={v => setForm(f => f && ({ ...f, expense_categories: v }))} />
          <CategoriasEditor title={t('cuentas.title')} value={form.ap_categories} onChange={v => setForm(f => f && ({ ...f, ap_categories: v }))} />
          <CategoriasEditor title={t('inventario.title')} value={form.inventory_categories} onChange={v => setForm(f => f && ({ ...f, inventory_categories: v }))} />
          <CategoriasEditor title={t('configuracion.metodosPago')} value={form.payment_methods} onChange={v => setForm(f => f && ({ ...f, payment_methods: v }))} />
        </div>
      </Card>
      <Card title={t('configuracion.zonaPeligrosa')} className="border-red-200 bg-red-50">
        <div className="space-y-3">
          <p className="text-xs text-red-700">{t('configuracion.zonaPeligrosaInfo')}</p>
          <div className="flex flex-wrap gap-2">
            <Button variant="danger" icon={<IconAlert className="w-4 h-4" />} onClick={() => { setDangerAction('completo'); setDangerOpen(true) }}>
              {t('configuracion.resetCompleto')}
            </Button>
            <Button variant="danger" icon={<IconAlert className="w-4 h-4" />} className="bg-red-700 hover:bg-red-800" onClick={() => { setDangerAction('nuclear'); setDangerOpen(true) }}>
              {t('configuracion.resetNuclear')}
            </Button>
          </div>
        </div>
      </Card>
      <Button onClick={submit} disabled={subiendo}>{subiendo ? t('imagenes.subiendo') : t('configuracion.guardarConfig')}</Button>
      {previewOpen && (
        <Dialog open onClose={() => setPreviewOpen(false)} title={t('configuracion.vistaPrevia')}
          footer={<>
            <Button variant="outline" onClick={() => setPreviewOpen(false)}>{t('common.cerrar')}</Button>
            <Button onClick={() => printInvoice(`${t('facturas.factura')} ${folioPreview}`)}>{t('configuracion.imprimirDescargar')}</Button>
          </>}>
          <InvoicePrint factura={sampleFactura().factura} items={sampleFactura().items} config={form} />
        </Dialog>
      )}
      {dangerOpen && dangerAction && (
        <Dialog open onClose={() => { setDangerOpen(false); setDangerAction(null) }} title={
          dangerAction === 'completo' ? t('configuracion.resetCompleto') : t('configuracion.resetNuclear')
        }
          footer={<>
            <Button variant="outline" onClick={() => { setDangerOpen(false); setDangerAction(null) }}>{t('common.cancelar')}</Button>
            <Button variant="danger" onClick={async () => {
              try {
                if (dangerAction === 'completo') {
                  await (repo as Repository).resetCompleto()
                  toast(t('configuracion.resetCompletoOk'))
                } else {
                  const r = await (repo as Repository).resetNuclear()
                  toast(t('configuracion.resetNuclearOk', { id: r.newSpreadsheetId }))
                }
                qc.invalidateQueries({ queryKey: ['config'] })
                qc.invalidateQueries({ queryKey: ['almacenamiento'] })
              } catch (e) { toast((e as Error).message, 'error') }
              finally { setDangerOpen(false); setDangerAction(null) }
            }}>{t('common.confirmar')}</Button>
          </>}>
          <div className="space-y-2 text-sm">
            <p className="text-red-600 font-medium">
              {dangerAction === 'completo' ? t('configuracion.resetCompletoConfirm') : t('configuracion.resetNuclearConfirm')}
            </p>
            <p className="text-muted-foreground">
              {dangerAction === 'completo' ? t('configuracion.resetCompletoDesc') : t('configuracion.resetNuclearDesc')}
            </p>
          </div>
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

  const all = [...CURRENCIES, ...parseCustomCurrencies(config.custom_currencies)]
  const activeCodes = (config.active_currencies || '').split(',').map(s => s.trim()).filter(Boolean)
  const active = activeCodes.length ? all.filter(c => activeCodes.includes(c.code)) : all
  const rates = parseRates(config.exchange_rates)
  const frescas = tasasFrescas(rates)
  const base = config.moneda

  const toggleActiva = (code: string, on: boolean) => {
    const cur = new Set(activeCodes)
    if (on) cur.add(code); else cur.delete(code)
    setForm(f => ({ ...f, active_currencies: [...cur].join(',') }))
  }

  const saveRate = (code: string) => {
    const v = Number(rateDrafts[code])
    if (!rateDrafts[code] || !Number.isFinite(v) || v <= 0) { toast('Tasa inválida', 'error'); return }
    const r = parseRates(config.exchange_rates) ?? { base, fecha: '', rates: {} }
    setForm(f => ({ ...f, exchange_rates: JSON.stringify({ ...r, base, fecha: r.fecha, rates: { ...r.rates, [code]: v } }) }))
    setRateDrafts(d => { const n = { ...d }; delete n[code]; return n })
    toast(`Tasa de ${code} guardada`)
  }

  const actualizar = async () => {
    setActualizando(true)
    try {
      const { rates: fetched, fecha } = await fetchExchangeRates(base)
      const r = parseRates(config.exchange_rates) ?? { base, fecha: '', rates: {} }
      const merged: Record<string, number> = { ...r.rates }
      for (const c of all) if (fetched[c.code]) merged[c.code] = fetched[c.code]
      setForm(f => ({ ...f, exchange_rates: JSON.stringify({ base, fecha, rates: merged }) }))
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
    const existing = parseCustomCurrencies(config.custom_currencies)
    if (existing.some(c => c.code === code) || CURRENCIES.some(c => c.code === code)) { toast('Esa moneda ya existe', 'error'); return }
    const cur = { code, symbol: custom.symbol.trim() || code, decimals: dec, locale: 'es-VE', name: code }
    setForm(f => ({ ...f, custom_currencies: JSON.stringify([...existing, cur]) }))
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
              <div key={c.code} className="rounded-lg bg-white border border-gray-100 px-3 py-2 space-y-1">
                <div className="flex items-center gap-2">
                  <div className="text-sm font-medium w-24 shrink-0">{c.code} · {c.symbol}</div>
                  <Input className="flex-1" type="number" step="any" min={0} placeholder={tasa ? String(tasa) : 'Tasa'}
                    value={rateDrafts[c.code] ?? ''} onChange={e => setRateDrafts(d => ({ ...d, [c.code]: e.target.value }))} />
                  <Button size="sm" variant="outline" onClick={() => saveRate(c.code)}>Guardar</Button>
                </div>
                <p className="text-xs text-muted-foreground">1 {base} = {tasa ?? '—'} {c.code}</p>
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

/** Registro automático de la tasa del día + historial de variaciones. */
function TasaDiaCard({ config, setForm, onSaved }: { config: Config; setForm: (fn: (f: Config) => Config) => void; onSaved: () => Promise<void> | void }) {
  const { t } = useI18n()
  const toast = useToast()
  const { tasas } = useTasasHistorial()
  const activa = config.daily_rate_active === 'true'

  const toggle = async () => {
    setForm(f => ({ ...f, daily_rate_active: f.daily_rate_active === 'true' ? 'false' : 'true' }))
    toast(t('configuracion.guardada'))
    setTimeout(() => { void onSaved() }, 0)
  }

  // Últimas variaciones por moneda (últimos 30 registros).
  const recientes = [...tasas].sort((a, b) => b.fecha.localeCompare(a.fecha)).slice(0, 30)
  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="h-4 w-4" checked={activa} onChange={toggle} />
        {t('configuracion.tasaDiaActiva')}
      </label>
      <p className="text-xs text-muted-foreground">{t('configuracion.tasaDiaInfo')}</p>
      <div>
        <div className="text-xs text-muted-foreground mb-2">{t('configuracion.historialTasas')}</div>
        {recientes.length === 0 ? (
          <p className="text-sm text-gray-500">{t('configuracion.sinHistorial')}</p>
        ) : (
          <div className="max-h-56 overflow-auto rounded-xl border border-gray-100">
            <table className="w-full text-sm">
              <thead><tr className="text-xs uppercase text-muted-foreground bg-muted/60"><th className="px-3 py-1.5 text-left">Fecha</th><th className="px-3 py-1.5 text-left">Moneda</th><th className="px-3 py-1.5 text-right">Tasa</th></tr></thead>
              <tbody>
                {recientes.map(x => (
                  <tr key={x.rate_id} className="border-t border-gray-50">
                    <td className="px-3 py-1.5">{x.fecha}</td>
                    <td className="px-3 py-1.5">{x.base} → {x.moneda}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{Number(x.tasa).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

/** Comisiones por transacción en Gastos, CXP, Nómina y métodos de pago. */
function ComisionesCard({ config, setForm }: { config: Config; setForm: (fn: (f: Config) => Config) => void }) {
  const { t } = useI18n()
  const parsed = parseComisiones(config.transaction_fees)

  const update = (patch: Partial<ReturnType<typeof parseComisiones>>) => {
    const next = { ...parsed, ...patch }
    setForm(f => ({ ...f, transaction_fees: JSON.stringify(next) }))
  }

  const numInput = (label: string, value: number, onChange: (n: number) => void) => (
    <div>
      <label className="text-xs text-muted-foreground">{label}</label>
      <Input type="number" min={0} max={100} step="any" defaultValue={value || ''} key={`${label}-${value}`}
        onBlur={e => onChange(Number(e.target.value) || 0)} />
    </div>
  )

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">{t('configuracion.comisionesInfo')}</p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {numInput(t('configuracion.comisionGastos'), parsed.gastos, n => update({ gastos: n }))}
        {numInput(t('configuracion.comisionCxp'), parsed.cxp, n => update({ cxp: n }))}
        {numInput(t('configuracion.comisionNomina'), parsed.nomina, n => update({ nomina: n }))}
      </div>
      <p className="text-xs text-muted-foreground">Las comisiones por método de pago se configuran directamente en cada selector de método (ej. al registrar un cobro o abono).</p>
    </div>
  )
}

/** Metas mensuales de venta (JSON en config). */
function MetasCard({ config, setForm, moneda }: { config: Config; setForm: (fn: (f: Config) => Config) => void; moneda: string }) {
  const { t } = useI18n()
  const metas = parseMetas(config.monthly_goals)
  const [mes, setMes] = useState(() => new Date().toISOString().slice(0, 7))
  const [monto, setMonto] = useState('')

  const guardarMeta = () => {
    const m = Number(monto)
    if (!/^\d{4}-\d{2}$/.test(mes)) return
    const next = { ...metas }
    if (!m || m <= 0) delete next[mes]
    else next[mes] = m
    setForm(f => ({ ...f, monthly_goals: JSON.stringify(next) }))
    setMonto('')
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t('configuracion.metasInfo')}</p>
      <div className="flex flex-wrap items-end gap-2">
        <Input type="month" value={mes} onChange={e => setMes(e.target.value)} className="w-40" />
        <Input type="number" min={0} step="any" value={monto} onChange={e => setMonto(e.target.value)} placeholder={`Monto (${moneda})`} className="w-40" />
        <Button variant="outline" onClick={guardarMeta}>{t('common.guardar')}</Button>
      </div>
      {Object.keys(metas).length > 0 && (
        <ul className="text-sm divide-y divide-gray-50 rounded-xl border border-gray-100 max-h-40 overflow-auto">
          {Object.entries(metas).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => (
            <li key={k} className="flex justify-between px-3 py-1.5">
              <span>{k}</span><b>{v.toLocaleString()} {moneda}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Permisos otorgados a Google (Sheets, Drive, perfil) con guía de revocación. */
function PermisosGoogleCard({ config, setForm }: { config: Config; setForm: (fn: (f: Config) => Config) => void }) {
  const { t } = useI18n()
  let permisos: Record<string, string> = {}
  try { permisos = JSON.parse(config.google_permissions || '{}') } catch { permisos = {} }

  const togglePermiso = (key: string) => {
    const cur = permisos[key] === 'granted' ? 'revoked' : 'granted'
    setForm(f => ({ ...f, google_permissions: JSON.stringify({ ...permisos, [key]: cur }) }))
  }

  const filas = [
    { key: 'sheets', label: t('configuracion.permisoSheets') },
    { key: 'drive', label: t('configuracion.permisoDrive') },
    { key: 'profile', label: t('configuracion.permisoPerfil') },
    { key: 'appdata', label: t('configuracion.permisoAppData') }
  ]
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">{t('configuracion.permisosGoogleInfo')}</p>
      <ul className="divide-y divide-gray-50 rounded-xl border border-gray-100">
        {filas.map(f => (
          <li key={f.key} className="flex items-center justify-between px-3 py-2.5 text-sm">
            <span>{f.label}</span>
            <label className="inline-flex items-center cursor-pointer gap-2">
              <input type="checkbox" className="h-4 w-4" checked={permisos[f.key] !== 'revoked'} onChange={() => togglePermiso(f.key)} />
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
