import type { StorageAdapter } from '../data/storage'

/** Sesión local persistente para modo offline (spec espejo §9).
 *  Tras el primer login OAuth exitoso se guarda { cuenta, creado_en,
 *  ultimo_pull }; el desbloqueo sin red exige PIN o sesión reciente. */

export const KEY_SESION_LOCAL = 'ft_sesion_local'
export const VENTANA_OFFLINE_MS = 24 * 60 * 60 * 1000
const ITERACIONES_PBKDF2 = 100_000

export interface PinAlmacenado { salt: string; hash: string; iteraciones: number }

export interface RegistroSesion {
  cuenta: string
  creado_en: number
  ultimo_pull: number
  pin?: PinAlmacenado
}

function aB64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

function deB64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}

async function derivarPin(pin: string, saltB64: string, iteraciones: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: deB64(saltB64) as BufferSource, iterations: iteraciones },
    key,
    256
  )
  return aB64(new Uint8Array(bits))
}

export function pinValido(pin: string): boolean {
  return /^[0-9]{4,6}$/.test(pin)
}

export async function cargarRegistroSesion(storage: StorageAdapter): Promise<RegistroSesion | null> {
  const raw = await storage.get(KEY_SESION_LOCAL)
  if (!raw) return null
  try {
    const reg = JSON.parse(raw) as RegistroSesion
    return typeof reg.cuenta === 'string' && reg.cuenta ? reg : null
  } catch { return null }
}

/** Guarda/actualiza el registro conservando el PIN ya configurado. */
export async function guardarRegistroSesion(storage: StorageAdapter, datos: { cuenta: string; creado_en?: number; ultimo_pull?: number }): Promise<RegistroSesion> {
  const previo = await cargarRegistroSesion(storage)
  const ahora = Date.now()
  const reg: RegistroSesion = {
    cuenta: datos.cuenta,
    creado_en: datos.creado_en ?? previo?.creado_en ?? ahora,
    ultimo_pull: datos.ultimo_pull ?? ahora,
    ...(previo?.pin ? { pin: previo.pin } : {})
  }
  await storage.set(KEY_SESION_LOCAL, JSON.stringify(reg))
  return reg
}

/** Descarta la sesión local (cambio de cuenta o cierre explícito). */
export async function borrarRegistroSesion(storage: StorageAdapter): Promise<void> {
  await storage.remove(KEY_SESION_LOCAL)
}

export async function configurarPin(storage: StorageAdapter, pin: string): Promise<void> {
  if (!pinValido(pin)) throw new Error('PIN inválido: 4 a 6 dígitos')
  const salt = aB64(crypto.getRandomValues(new Uint8Array(16)))
  const hash = await derivarPin(pin, salt, ITERACIONES_PBKDF2)
  const previo = await cargarRegistroSesion(storage)
  if (!previo) throw new Error('Sin sesión local que proteger')
  const reg: RegistroSesion = { ...previo, pin: { salt, hash, iteraciones: ITERACIONES_PBKDF2 } }
  await storage.set(KEY_SESION_LOCAL, JSON.stringify(reg))
}

export async function verificarPin(storage: StorageAdapter, pin: string): Promise<boolean> {
  const reg = await cargarRegistroSesion(storage)
  const almacenado = reg?.pin
  if (!almacenado || !pinValido(pin)) return false
  const hash = await derivarPin(pin, almacenado.salt, almacenado.iteraciones)
  // Comparación en tiempo constante aproximada sobre hashes de igual longitud.
  let diff = 0
  for (let i = 0; i < hash.length; i++) diff |= hash.charCodeAt(i) ^ almacenado.hash.charCodeAt(i)
  return diff === 0 && hash.length === almacenado.hash.length
}

/** Sin PIN: solo sesiones con pull en las últimas 24 h (spec §9.2). */
export function desbloqueoPermitido(reg: RegistroSesion, ahora = Date.now()): boolean {
  if (reg.pin) return true
  return ahora - reg.ultimo_pull < VENTANA_OFFLINE_MS
}
