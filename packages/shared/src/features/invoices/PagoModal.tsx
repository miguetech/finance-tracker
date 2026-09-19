import React, { useMemo, useState } from 'react'
import { todayLocal } from '../../lib/date'
import { Dialog, Button, Input, Select, useToast } from '../../ui/components'
import { useRegisterPago, useConfig, useMetodosPago } from '../../store/queries'
import { formatMoney, getCurrency, activeCurrencies, convert, parseRates, tasasFrescas } from '../../currency'
import { CurrencySelect } from '../../ui/currency'
import { parseComisionesMetodos, comisionTransaccion, type ComisionMetodo } from '../../reports/comisiones'
import { useI18n } from '../../i18n'
import { IconCoins, IconSettings } from '../../ui/icons'

export function PagoModal({ origen, onClose }: { origen: { id: string; type: 'payment' | 'partial'; balance: number; currency?: string }; onClose: () => void }) {
  const { t } = useI18n()
  const registerPayment = useRegisterPago()
  const { config } = useConfig()
  const metodos = useMetodosPago()
  const [amount, setMonto] = useState('')
  const [metodo, setMetodo] = useState(metodos[0] ?? 'Efectivo')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [monedaPago, setMonedaPago] = useState('')

  const monedaDoc = origen.currency || config?.currency || 'USD'
  const monedaSel = monedaPago || monedaDoc
  const distinta = monedaSel !== monedaDoc
  const simbolo = getCurrency(monedaSel).symbol

  const n = Number(amount) || 0
  // Equivalencias según la rate del día configurada.
  const equivalente = useMemo(() => (distinta ? convert(n, monedaSel, monedaDoc, config) : n), [distinta, n, monedaSel, monedaDoc, config])
  const saldoEquivalente = useMemo(() => (distinta ? convert(origen.balance, monedaDoc, monedaSel, config) : origen.balance), [distinta, origen.balance, monedaDoc, monedaSel, config])
  const rates = parseRates(config?.exchange_rates ?? '')
  const frescas = tasasFrescas(rates)

  // Comisión avanzada del método de pago seleccionado (% y/o fijo mínimo).
  const comisionesMetodos = useMemo(() => parseComisionesMetodos(config?.method_fees), [config?.method_fees])
  const [comisionAbierta, setComisionAbierta] = useState(false)
  const comisionActual: ComisionMetodo = comisionesMetodos[metodo] ?? {}
  const comisionEstimada = comisionTransaccion(equivalente, comisionActual)

  const submit = async () => {
    setError('')
    if (!n || n <= 0) return setError(t('pago.montoInvalido'))
    if (equivalente > origen.balance + 0.009) {
      return setError(`${t('pago.superaSaldo')} (${formatMoney(origen.balance, monedaDoc)})`)
    }
    setGuardando(true)
    try {
      await registerPayment.mutateAsync({
        type: origen.type, origin_id: origen.id, date: todayLocal(), amount: n,
        payment_method: metodo, notes: '', ...(distinta ? { currency: monedaSel } : {})
      })
      onClose()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setGuardando(false)
    }
  }

  return (
    <Dialog open onClose={onClose} title={origen.type === 'payment' ? t('facturas.registrarCobro') : t('cuentas.registrarAbono')}
      footer={<><Button variant="outline" onClick={onClose} disabled={guardando}>{t('common.cancelar')}</Button>
        <Button onClick={submit} disabled={guardando}>{guardando ? t('imagenes.subiendo') : t('common.guardarPago')}</Button></>}>
      <div className="space-y-3">
        <p className="text-sm">{t('pago.saldoDisponible')} <b>{formatMoney(origen.balance, monedaDoc)}</b>
          {distinta && <> · ≈ <b>{formatMoney(saldoEquivalente, monedaSel)}</b></>}
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div><label className="text-xs text-gray-500">{t('pago.monedaPago')}</label>
            <CurrencySelect value={monedaSel} onChange={setMonedaPago}
              opciones={[monedaDoc, ...activeCurrencies(config).map(c => c.code)].filter((v, i, a) => a.indexOf(v) === i)} />
          </div>
          <div>
            <label className="text-xs text-gray-500 flex items-center justify-between">
              <span>{t('common.metodo')}</span>
              <button type="button" onClick={() => setComisionAbierta(a => !a)}
                className="inline-flex items-center gap-0.5 text-primary underline decoration-dotted underline-offset-2 text-xs"
                title={t('pago.comisionTitulo')}>
                <IconSettings className="w-3.5 h-3.5" /> {t('pago.comisionTitulo')}
              </button>
            </label>
            <Select value={metodo} onChange={setMetodo} options={metodos.map(v => ({ value: v, label: v }))} />
          </div>
        </div>
        {comisionAbierta && (
          <ComisionMetodoForm metodo={metodo} actual={comisionActual} monedaBase={config?.currency ?? 'USD'} />
        )}
        {(comisionActual.pct || comisionActual.minimo_fijo) && n > 0 && (
          <p className="text-xs text-amber-700">{t('pago.comisionPreview')}: ≈ {formatMoney(comisionEstimada, config?.currency ?? 'USD')}</p>
        )}
        <div>
          <label className="text-xs text-gray-500">{t('common.monto')} ({simbolo})</label>
          <Input type="number" min={0} step="any" value={amount} onChange={e => setMonto(e.target.value)} autoFocus />
          {distinta && n > 0 && (
            <p className="mt-1 flex items-center gap-1 text-xs text-emerald-700">
              <IconCoins className="w-3.5 h-3.5" /> ≈ {formatMoney(equivalente, monedaDoc)} {t('pago.segunTasa')}
              {rates?.date && <span className={frescas ? '' : 'text-amber-600'}>({rates.date})</span>}
            </p>
          )}
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </div>
    </Dialog>
  )
}

/** Configuración avanzada de comisión para un método de pago, guardada por método
 *  (independiente de la configuración global de fees por módulo). */
function ComisionMetodoForm({ metodo, actual, monedaBase }: { metodo: string; actual: ComisionMetodo; monedaBase: string }) {
  const { t } = useI18n()
  const toast = useToast()
  const { config, saveConfig } = useConfig()
  const [pct, setPct] = useState(String(actual.pct ?? ''))
  const [minimo, setMinimo] = useState(String(actual.minimo_fijo ?? ''))
  const [guardando, setGuardando] = useState(false)

  const guardar = async () => {
    setGuardando(true)
    try {
      const todos = parseComisionesMetodos(config?.method_fees)
      const p = Number(pct) || 0
      const m = Number(minimo) || 0
      if (p <= 0 && m <= 0) delete todos[metodo]
      else todos[metodo] = { ...(p > 0 ? { pct: p } : {}), ...(m > 0 ? { minimo_fijo: m } : {}) }
      await saveConfig.mutateAsync({ ...(config as NonNullable<typeof config>), method_fees: JSON.stringify(todos) })
      toast(t('pago.comisionGuardada'))
    } catch (e) {
      toast((e as Error).message, 'error')
    }
    setGuardando(false)
  }

  return (
    <div className="rounded-lg border border-primary/20 bg-primary-soft/30 p-3 space-y-2">
      <div className="text-xs font-medium text-primary">{t('pago.comisionDe', { metodo })}</div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-xs text-gray-500">{t('pago.comisionPct')} (%)</label>
          <Input type="number" min={0} max={100} step="any" value={pct} onChange={e => setPct(e.target.value)} placeholder="Ej. 3" />
        </div>
        <div>
          <label className="text-xs text-gray-500">{t('pago.comisionMinimo')}</label>
          <Input type="number" min={0} step="any" value={minimo} onChange={e => setMinimo(e.target.value)} placeholder={`Ej. 1 ${monedaBase}`} />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t('pago.comisionInfo')}</p>
      <div className="flex justify-end">
        <Button size="sm" onClick={guardar} disabled={guardando}>{guardando ? t('imagenes.subiendo') : t('common.guardar')}</Button>
      </div>
    </div>
  )
}
