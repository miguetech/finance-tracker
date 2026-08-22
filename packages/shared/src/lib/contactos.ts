/** Contactos: importación CSV con etiquetado de origen y formateo de teléfonos. */

export interface ContactoImportado {
  nombre: string
  telefono: string
  email: string
  origen: 'google' | 'csv'
  etiqueta?: string
}

/** Parsea un CSV simple (con comillas y separador , o ;) a objetos por cabecera. */
export function parseCsv(texto: string): Record<string, string>[] {
  const limpio = texto.replace(/^\uFEFF/, '').trim()
  if (!limpio) return []
  const sep = detectarSeparador(limpio)
  const filas: string[][] = []
  let campo = ''
  let fila: string[] = []
  let enComillas = false
  for (let i = 0; i < limpio.length; i++) {
    const ch = limpio[i]
    if (enComillas) {
      if (ch === '"') {
        if (limpio[i + 1] === '"') { campo += '"'; i++ } else enComillas = false
      } else campo += ch
    } else if (ch === '"') {
      enComillas = true
    } else if (ch === sep) {
      fila.push(campo); campo = ''
    } else if (ch === '\n') {
      fila.push(campo); campo = ''; filas.push(fila); fila = []
    } else if (ch !== '\r') {
      campo += ch
    }
  }
  fila.push(campo)
  filas.push(fila)

  const headers = filas[0].map(h => h.trim().toLowerCase())
  return filas.slice(1)
    .filter(f => f.some(c => c.trim() !== ''))
    .map(f => {
      const obj: Record<string, string> = {}
      headers.forEach((h, i) => { obj[h] = (f[i] ?? '').trim() })
      return obj
    })
}

function detectarSeparador(texto: string): string {
  const primeraLinea = texto.split('\n')[0]
  const comas = (primeraLinea.match(/,/g) ?? []).length
  const puntosYComa = (primeraLinea.match(/;/g) ?? []).length
  const tabs = (primeraLinea.match(/\t/g) ?? []).length
  if (tabs > comas && tabs > puntosYComa) return '\t'
  return puntosYComa > comas ? ';' : ','
}

const COLUMNAS_NOMBRE = ['nombre', 'name', 'given name', 'family name', 'full name']
const COLUMNAS_TELEFONO = ['telefono', 'teléfono', 'tel', 'phone', 'phone 1 - value', 'mobile']
const COLUMNAS_EMAIL = ['email', 'correo', 'e-mail', 'e-mail 1 - value']

function primerValor(row: Record<string, string>, candidatos: string[]): string {
  for (const key of Object.keys(row)) {
    const k = key.toLowerCase()
    if (candidatos.some(c => k === c || k.startsWith(c))) {
      const v = row[key]?.trim()
      if (v) return v
    }
  }
  return ''
}

/**
 * Convierte filas CSV (formato Google Contacts o genérico) en contactos.
 * `codigoPais` se añade si falta (ej. '58' → +58…).
 */
export function contactosDesdeCsv(texto: string, codigoPais = '', etiquetaOrigen = 'csv'): ContactoImportado[] {
  const rows = parseCsv(texto)
  return rows.map(row => ({
    nombre: primerValor(row, COLUMNAS_NOMBRE) || 'Sin nombre',
    telefono: formatearTelefono(primerValor(row, COLUMNAS_TELEFONO), codigoPais),
    email: primerValor(row, COLUMNAS_EMAIL),
    origen: 'csv' as const,
    etiqueta: etiquetaOrigen
  })).filter(c => c.nombre !== 'Sin nombre' || c.telefono || c.email)
}

/** Normaliza teléfono a formato internacional: +<pais><numero> sin espacios ni guiones. */
export function formatearTelefono(telefono: string, codigoPais = ''): string {
  const digitos = telefono.replace(/[^\d+]/g, '')
  if (!digitos) return ''
  if (digitos.startsWith('+')) return digitos
  const pais = codigoPais.replace(/\D/g, '')
  return pais ? `+${pais}${digitos}` : `+${digitos}`
}

/** URL de WhatsApp Web/Móvil con mensaje prellenado. */
export function whatsappUrl(telefono: string, mensaje: string): string {
  const num = formatearTelefono(telefono).replace(/\D/g, '')
  return `https://wa.me/${num}?text=${encodeURIComponent(mensaje)}`
}

export function mailtoUrl(email: string, asunto: string, cuerpo = ''): string {
  return `mailto:${email}?subject=${encodeURIComponent(asunto)}${cuerpo ? `&body=${encodeURIComponent(cuerpo)}` : ''}`
}

/**
 * Importa contactos desde Google Contacts (People API) con un token de acceso
 * que incluya el scope `contacts.readonly`. Etiqueta el origen como 'google'.
 */
export async function contactosDesdeGoogle(token: string, codigoPais = '', max = 500): Promise<ContactoImportado[]> {
  const out: ContactoImportado[] = []
  let pageToken = ''
  do {
    const qs = new URLSearchParams({
      personFields: 'names,emailAddresses,phoneNumbers',
      pageSize: String(Math.min(200, max - out.length))
    })
    if (pageToken) qs.set('pageToken', pageToken)
    const res = await fetch(`https://people.googleapis.com/v1/people/me/connections?${qs}`, {
      headers: { Authorization: `Bearer ${token}` }
    })
    if (!res.ok) throw new Error(`Google People API ${res.status}`)
    const data = await res.json() as {
      connections?: { names?: { displayName?: string }[]; emailAddresses?: { value?: string }[]; phoneNumbers?: { value?: string }[] }[]
      nextPageToken?: string
    }
    for (const p of data.connections ?? []) {
      out.push({
        nombre: p.names?.[0]?.displayName ?? 'Sin nombre',
        telefono: formatearTelefono(p.phoneNumbers?.[0]?.value ?? '', codigoPais),
        email: p.emailAddresses?.[0]?.value ?? '',
        origen: 'google',
        etiqueta: 'google'
      })
    }
    pageToken = data.nextPageToken ?? ''
  } while (pageToken && out.length < max)
  return out.filter(c => c.nombre !== 'Sin nombre' || c.telefono || c.email)
}
