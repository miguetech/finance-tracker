import React from 'react'
import { Badge } from './components'

export type StockLevel = 'ok' | 'bajo' | 'critico'

/** Nivel de stock de un producto según su umbral mínimo. */
export function stockLevel(stock: number, minimo: number): StockLevel {
  if (stock <= 0) return 'critico'
  if (minimo > 0 && stock < minimo) return 'critico'
  if (minimo > 0 && stock <= minimo * 1.2) return 'bajo'
  return 'ok'
}

export function StockBadge({ stock, minimo }: { stock: number; minimo: number }) {
  const level = stockLevel(stock, minimo)
  if (level === 'ok') return <Badge tone="green">OK</Badge>
  if (level === 'bajo') return <Badge tone="yellow">Bajo</Badge>
  return <Badge tone="red">Crítico</Badge>
}
