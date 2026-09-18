import React, { useMemo, useState } from 'react'
import { useConfig } from '../store/queries'
import { activeCurrencies, parseRates, tasasFrescas, fetchExchangeRates } from '../currency'
import { Button } from './components'
import { IconCoins } from './icons'
import { useI18n } from '../i18n'
import { useEspejo } from '../store/espejoContext'
import type { NavKey } from './layout/Layout'

/** Indicador discreto de frescura del espejo (sin botón: cada sección
 *  sincroniza sus tablas al abrirse). */
function FrescuraEspejo() {
  const { activo, ultimoPull } = useEspejo()
  if (!activo) return null
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground" title={ultimoPull ? new Date(ultimoPull).toLocaleTimeString() : ''}>
      <span className="w-2 h-2 rounded-full bg-green-500 inline-block" />
      {ultimoPull ? new Date(ultimoPull).toLocaleTimeString() : '—'}
    </div>
  )
}

/** Burbuja flotante persistente con la tasa del día y actualización rápida. */
export function RateBubble({ onNavigate }: { onNavigate?: (k: NavKey) => void }) {
  const { t } = useI18n()
  const { config, saveConfig } = useConfig()
  const [open, setOpen] = useState(false)
  const [actualizando, setActualizando] = useState(false)
  const [error, setError] = useState('')

  const base = config?.moneda || 'USD'
  const rates = parseRates(config?.exchange_rates ?? '')
  const frescas = tasasFrescas(rates)
  const divisas = useMemo(() =>
    activeCurrencies(config).filter(c => c.code !== base),
    [config, base]
  )
  if (!config || divisas.length === 0) return null

  const actualizar = async () => {
    setActualizando(true)
    setError('')
    try {
      const { rates: fetched, fecha } = await fetchExchangeRates(base)
      const r = parseRates(config.exchange_rates) ?? { base, fecha: '', rates: {} }
      const merged: Record<string, number> = { ...r.rates }
      for (const c of divisas) if (fetched[c.code]) merged[c.code] = fetched[c.code]
      await saveConfig.mutateAsync({ ...config, exchange_rates: JSON.stringify({ base, fecha, rates: merged }) })
    } catch (e) {
      setError((e as Error).message)
    }
    setActualizando(false)
  }

  const primera = divisas[0]
  const tasaPrimera = rates?.rates[primera.code]

  return (
    <div className="fixed bottom-4 right-4 z-50 print:hidden">
      {!open ? (
        <button onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-full bg-surface border border-gray-200 shadow-card px-3.5 py-2 text-sm font-medium text-gray-700 hover:border-primary/40 hover:text-primary transition-colors"
          title={t('tasas.tasaDia')}>
          <IconCoins className="w-4 h-4 text-primary" />
          {tasaPrimera ? <>1 {base} = <b className="tabular-nums">{tasaPrimera}</b> {primera.code}</> : t('tasas.tasaDia')}
        </button>
      ) : (
        <div className="w-72 rounded-2xl bg-surface border border-gray-200 shadow-card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="font-semibold text-sm flex items-center gap-1.5"><IconCoins className="w-4 h-4 text-primary" />{t('tasas.tasaDia')}</div>
            <button onClick={() => setOpen(false)} className="text-gray-400 hover:text-gray-600 text-lg leading-none" aria-label="Cerrar">×</button>
          </div>
          <ul className="space-y-1.5 text-sm">
            {divisas.map(c => {
              const tasa = rates?.rates[c.code]
              return (
                <li key={c.code} className="flex justify-between items-baseline">
                  <span className="text-muted-foreground">1 {base} =</span>
                  <span className="tabular-nums font-medium">{tasa ? `${tasa} ${c.symbol}` : '—'}</span>
                </li>
              )
            })}
          </ul>
          {rates?.fecha && (
            <p className={`text-xs ${frescas ? 'text-emerald-700' : 'text-amber-600'}`}>
              {frescas ? t('tasas.alDia') : t('tasas.desactualizada')}: {rates.fecha}
            </p>
          )}
          <FrescuraEspejo />
          {error && <p className="text-xs text-red-600">{error}</p>}
          <div className="flex gap-2 flex-wrap">
            <Button size="sm" variant="outline" onClick={actualizar} disabled={actualizando}>
              {actualizando ? t('imagenes.subiendo') : t('tasas.actualizar')}
            </Button>
            {onNavigate && (
              <Button size="sm" variant="ghost" onClick={() => { setOpen(false); onNavigate('configuracion') }}>
                {t('tasas.configurar')}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
