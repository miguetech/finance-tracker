import React from 'react'

const cx = (...a: (string | false | undefined)[]) => a.filter(Boolean).join(' ')
export const CHART_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#06b6d4', '#8b5cf6', '#ec4899', '#84cc16']

function niceMax(v: number): number {
  if (v <= 0) return 1
  const mag = Math.pow(10, Math.floor(Math.log10(v)))
  return Math.ceil(v / mag) * mag
}

export interface SeriePunto { label: string; value: number }

/** Barras simples verticales con etiquetas y valores. */
export function BarChart({ data, height = 200, format = (n: number) => String(n), color = CHART_COLORS[0] }: {
  data: SeriePunto[]
  height?: number
  format?: (n: number) => string
  color?: string
}) {
  if (data.length === 0) return <p className="text-sm text-gray-500 py-8 text-center">Sin datos</p>
  const max = niceMax(Math.max(...data.map(d => d.value), 0))
  return (
    <div className="w-full overflow-x-auto">
      <div className="flex items-end gap-2 min-w-full" style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className="flex flex-col items-center justify-end gap-1 flex-1 min-w-10" title={`${d.label}: ${format(d.value)}`}>
            <span className="text-[10px] text-muted-foreground tabular-nums">{format(d.value)}</span>
            <div className="w-full rounded-t-md transition-all" style={{ height: `${Math.max(2, (d.value / max) * (height - 34))}px`, backgroundColor: color, opacity: d.value < 0 ? 0.4 : 1 }} />
            <span className="text-[10px] text-muted-foreground truncate w-full text-center">{d.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Barras agrupadas para comparar series (ej. entradas vs salidas, meta vs logro). */
export function GroupedBarChart({ series, labels, height = 220, colors = [CHART_COLORS[0], CHART_COLORS[1]], format = (n: number) => String(n) }: {
  series: { name: string; values: number[] }[]
  labels: string[]
  height?: number
  colors?: string[]
  format?: (n: number) => string
}) {
  if (labels.length === 0) return <p className="text-sm text-gray-500 py-8 text-center">Sin datos</p>
  const max = niceMax(Math.max(0, ...series.flatMap(s => s.values.map(v => Math.abs(v)))))
  const n = series.length
  return (
    <div>
      <div className="flex gap-3 mb-2 flex-wrap">
        {series.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: colors[i % colors.length] }} />{s.name}
          </span>
        ))}
      </div>
      <div className="overflow-x-auto pb-1">
        <div className="flex items-end gap-3" style={{ height }}>
          {labels.map((lab, li) => (
            <div key={li} className="flex flex-col items-center justify-end gap-1 flex-1 min-w-14">
              <div className="flex items-end justify-center gap-0.5 w-full" style={{ height: height - 30 }}>
                {series.map((s, si) => (
                  <div key={si} className="rounded-t-sm transition-all" style={{ width: `${Math.max(100 / labels.length / (n + 1), 8)}%`, maxWidth: 26, height: `${Math.max(2, (Math.abs(s.values[li] ?? 0) / max) * (height - 40))}px`, backgroundColor: colors[si % colors.length] }} title={`${s.name} ${lab}: ${format(s.values[li] ?? 0)}`} />
                ))}
              </div>
              <span className="text-[10px] text-muted-foreground truncate">{lab}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/** Gráfica de líneas comparativa con relleno suave. */
export function LineChart({ series, labels, height = 220, colors = [CHART_COLORS[0], CHART_COLORS[1]], format = (n: number) => String(n) }: {
  series: { name: string; values: number[] }[]
  labels: string[]
  height?: number
  colors?: string[]
  format?: (n: number) => string
}) {
  if (labels.length === 0) return <p className="text-sm text-gray-500 py-8 text-center">Sin datos</p>
  const W = 560
  const H = height
  const padL = 8
  const padB = 22
  const padT = 12
  const all = series.flatMap(s => s.values)
  const max = niceMax(Math.max(...all, 1))
  const min = Math.min(...all, 0)
  const x = (i: number) => padL + (i * (W - padL * 2)) / Math.max(1, labels.length - 1)
  const y = (v: number) => padT + (1 - (v - min) / (max - min || 1)) * (H - padT - padB)

  return (
    <div>
      <div className="flex gap-3 mb-1 flex-wrap">
        {series.map((s, i) => (
          <span key={i} className="inline-flex items-center gap-1.5 text-xs text-gray-600">
            <span className="inline-block w-3 h-1 rounded-full" style={{ backgroundColor: colors[i % colors.length] }} />{s.name}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Gráfica de líneas">
        {[max, min].map((v, i) => (
          <g key={i}>
            <line x1={padL} x2={W - padL} y1={y(v)} y2={y(v)} stroke="#eef0f3" strokeWidth="1" />
            <text x={padL} y={y(v) - 3} fontSize="9" fill="#9ca3af">{format(v)}</text>
          </g>
        ))}
        {series.map((s, si) => {
          const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(' ')
          return (
            <g key={si}>
              <polyline points={pts} fill="none" stroke={colors[si % colors.length]} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => <circle key={i} cx={x(i)} cy={y(v)} r="3" fill="#fff" stroke={colors[si % colors.length]} strokeWidth="2"><title>{`${s.name} ${labels[i]}: ${format(v)}`}</title></circle>)}
            </g>
          )
        })}
        {labels.map((lab, i) => (
          <text key={i} x={x(i)} y={H - 6} fontSize="9" fill="#6b7280" textAnchor={i === 0 ? 'start' : i === labels.length - 1 ? 'end' : 'middle'}>{lab}</text>
        ))}
      </svg>
    </div>
  )
}

/** Barras horizontales (ranking) — top productos, categorías, etc. */
export function HBarChart({ data, format = (n: number) => String(n), color = CHART_COLORS[0], max: maxProp }: {
  data: SeriePunto[]
  format?: (n: number) => string
  color?: string
  max?: number
}) {
  if (data.length === 0) return <p className="text-sm text-gray-500 py-8 text-center">Sin datos</p>
  const max = maxProp ?? Math.max(...data.map(d => Math.abs(d.value)), 1)
  return (
    <div className="space-y-2.5">
      {data.map((d, i) => (
        <div key={i}>
          <div className="flex justify-between text-xs mb-1"><span className="truncate mr-2">{d.label}</span><span className="tabular-nums text-gray-500 shrink-0">{format(d.value)}</span></div>
          <div className="h-2 bg-muted rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(1, (Math.abs(d.value) / max) * 100)}%`, backgroundColor: d.value < 0 ? CHART_COLORS[3] : color }} />
          </div>
        </div>
      ))}
    </div>
  )
}

/** Donut simple con leyenda (contribución por producto, balance, etc.). */
export function DonutChart({ data, size = 160, format = (n: number) => String(n) }: {
  data: SeriePunto[]
  size?: number
  format?: (n: number) => string
}) {
  const total = data.reduce((s, d) => s + Math.abs(d.value), 0)
  if (total <= 0) return <p className="text-sm text-gray-500 py-8 text-center">Sin datos</p>
  const r = 60
  const c = 2 * Math.PI * r
  let offset = 0
  return (
    <div className="flex items-center gap-4 flex-wrap">
      <svg width={size} height={size} viewBox="0 0 160 160" role="img" aria-label="Distribución">
        <circle cx="80" cy="80" r={r} fill="none" stroke="#f0f0f3" strokeWidth="24" />
        {data.filter(d => Math.abs(d.value) > 0).map((d, i) => {
          const frac = Math.abs(d.value) / total
          const dash = `${frac * c} ${c}`
          const el = (
            <circle key={i} cx="80" cy="80" r={r} fill="none" stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth="24"
              strokeDasharray={dash} strokeDashoffset={-offset * c} transform="rotate(-90 80 80)">
              <title>{`${d.label}: ${format(d.value)} (${Math.round(frac * 100)}%)`}</title>
            </circle>
          )
          offset += frac
          return el
        })}
      </svg>
      <ul className="space-y-1.5 text-xs">
        {data.map((d, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
            <span className="truncate max-w-40">{d.label}</span>
            <span className="text-gray-500 tabular-nums ml-auto">{format(d.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Medidor semicircular para indicadores tipo cobertura del punto de equilibrio. */
export function Gauge({ pct, label, sublabel }: { pct: number; label: string; sublabel?: string }) {
  const clamped = Math.max(0, Math.min(150, pct))
  const angle = (clamped / 150) * 180
  const rad = ((180 - angle) * Math.PI) / 180
  const r = 62
  const cxS = 80
  const cyS = 78
  const px = cxS + r * Math.cos(rad)
  const py = cyS - r * Math.sin(rad)
  const arc = (fromDeg: number, toDeg: number) => {
    const a1 = ((180 - fromDeg) * Math.PI) / 180
    const a2 = ((180 - toDeg) * Math.PI) / 180
    return `M ${cxS + r * Math.cos(a1)} ${cyS - r * Math.sin(a1)} A ${r} ${r} 0 0 1 ${cxS + r * Math.cos(a2)} ${cyS - r * Math.sin(a2)}`
  }
  const color = clamped >= 100 ? CHART_COLORS[1] : clamped >= 70 ? CHART_COLORS[2] : CHART_COLORS[3]
  return (
    <div className={cx('flex flex-col items-center')}>
      <svg width="160" height="95" viewBox="0 0 160 95" role="img" aria-label={label}>
        <path d={arc(0, 150)} fill="none" stroke="#eef0f3" strokeWidth="14" strokeLinecap="round" />
        <path d={arc(0, Math.max(2, angle))} fill="none" stroke={color} strokeWidth="14" strokeLinecap="round" />
        <circle cx={px} cy={py} r="5" fill={color} />
        <text x="80" y="70" textAnchor="middle" fontSize="20" fontWeight="700" fill="#111827">{label}</text>
      </svg>
      {sublabel && <p className="text-xs text-muted-foreground -mt-1">{sublabel}</p>}
    </div>
  )
}
