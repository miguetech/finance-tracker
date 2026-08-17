import React from 'react'
import { Select } from './components'
import { useConfig } from '../store/queries'
import { activeCurrencies, getCurrency, formatMoney } from '../currency'
import type { Config } from '../types/entities'

export function CurrencySelect({ value, onChange, label }: { value: string; onChange: (v: string) => void; label?: string }) {
  const { config } = useConfig()
  const currencies = activeCurrencies(config)
  const options = currencies.map(c => ({ value: c.code, label: `${c.code} · ${c.symbol} · ${c.name}` }))
  return (
    <div>
      {label && <label className="text-xs text-gray-500">{label}</label>}
      <Select value={value} onChange={onChange} options={options} />
    </div>
  )
}

/** Muestra el monto con el símbolo de su moneda. Usa la moneda base si el registro no especifica. */
export function Money({ monto, moneda, base }: { monto: number; moneda?: string; base?: string }) {
  const code = moneda || base || 'USD'
  return <>{formatMoney(Number(monto) || 0, code)}</>
}

/** Muestra moneda base configurada (para selects de "moneda base" en Configuración). */
export function useBaseCurrency(): string {
  const { config } = useConfig()
  return config?.moneda ?? 'USD'
}

export function currencyFor(cfg: Config | null | undefined, code: string) {
  return getCurrency(code || cfg?.moneda || 'USD')
}
