export type FolioToken = '{YYYY}' | '{YY}' | '{MM}' | '{DD}'

export const FOLIO_TOKENS: { token: FolioToken; descripcion: string; ejemplo: string }[] = [
  { token: '{YYYY}', descripcion: 'Año completo', ejemplo: '2026' },
  { token: '{YY}', descripcion: 'Año corto', ejemplo: '26' },
  { token: '{MM}', descripcion: 'Mes (2 dígitos)', ejemplo: '08' },
  { token: '{DD}', descripcion: 'Día', ejemplo: '13' }
]

export function expandFolioTemplate(template: string, fecha: string): string {
  const d = new Date(fecha + 'T00:00:00')
  if (isNaN(d.getTime())) return template
  const yyyy = String(d.getFullYear())
  const yy = yyyy.slice(-2)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return template
    .replaceAll('{YYYY}', yyyy)
    .replaceAll('{YY}', yy)
    .replaceAll('{MM}', mm)
    .replaceAll('{DD}', dd)
}

export function invalidFolioTokens(template: string): string[] {
  const invalidos: string[] = []
  const re = /\{([^}]*)\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(template)) !== null) {
    const token = m[0]
    if (!FOLIO_TOKENS.some(t => t.token === token)) invalidos.push(token)
  }
  return invalidos
}
