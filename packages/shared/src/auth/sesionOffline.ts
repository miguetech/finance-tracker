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
  /** Fase C: volcado del espejo cifrado con clave derivada del PIN. */
  cifrado?: boolean
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

export async function cargarRegistroSesion(almacen: StorageAdapter): Promise<RegistroSesion | null> {
  const raw = await almacen.get(KEY_SESION_LOCAL)
  if (!raw) return null
  try {
    const reg = JSON.parse(raw) as RegistroSesion
    return typeof reg.cuenta === 'string' && reg.cuenta ? reg : null
  } catch { return null }
}

/** Guarda/actualiza el registro conservando el PIN ya configurado. */
export async function guardarRegistroSesion(almacen: StorageAdapter, datos: { cuenta: string; creado_en?: number; ultimo_pull?: number }): Promise<RegistroSesion> {
  const previo = await cargarRegistroSesion(almacen)
  const ahora = Date.now()
  const reg: RegistroSesion = {
    cuenta: datos.cuenta,
    creado_en: datos.creado_en ?? previo?.creado_en ?? ahora,
    ultimo_pull: datos.ultimo_pull ?? ahora,
    ...(previo?.pin ? { pin: previo.pin } : {}),
    // El flag sobrevive re-logins: perderlo dejaba al espejo CIFRADO ilegible
    // en modo offline (la app entraría sin clave aunque el PIN fuera bueno).
    ...(previo?.cifrado ? { cifrado: true } : {})
  }
  await almacen.set(KEY_SESION_LOCAL, JSON.stringify(reg))
  return reg
}

/** Descarta la sesión local (cambio de cuenta o cierre explícito). */
export async function borrarRegistroSesion(almacen: StorageAdapter): Promise<void> {
  await almacen.remove(KEY_SESION_LOCAL)
}

export async function configurarPin(almacen: StorageAdapter, pin: string): Promise<void> {
  if (!pinValido(pin)) throw new Error('PIN inválido: 4 a 6 dígitos')
  const salt = aB64(crypto.getRandomValues(new Uint8Array(16)))
  const hash = await derivarPin(pin, salt, ITERACIONES_PBKDF2)
  const previo = await cargarRegistroSesion(almacen)
  if (!previo) throw new Error('Sin sesión local que proteger')
  const reg: RegistroSesion = { ...previo, pin: { salt, hash, iteraciones: ITERACIONES_PBKDF2 } }
  await almacen.set(KEY_SESION_LOCAL, JSON.stringify(reg))
}

export async function verificarPin(almacen: StorageAdapter, pin: string): Promise<boolean> {
  const reg = await cargarRegistroSesion(almacen)
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

/** Fase C: marca el espejo como cifrado; exige PIN ya verificado. */
export async function activarCifradoEspejo(almacen: StorageAdapter, pin: string): Promise<void> {
  const reg = await cargarRegistroSesion(almacen)
  if (!reg?.pin) throw new Error('Configura un PIN antes de cifrar')
  if (!(await verificarPin(almacen, pin))) throw new Error('PIN incorrecto')
  await almacen.set(KEY_SESION_LOCAL, JSON.stringify({ ...reg, cifrado: true }))
}

export async function desactivarCifradoEspejo(almacen: StorageAdapter): Promise<void> {
  const reg = await cargarRegistroSesion(almacen)
  if (!reg) return
  await almacen.set(KEY_SESION_LOCAL, JSON.stringify({ ...reg, cifrado: false }))
}

// ── Desbloqueo recordado durante la sesión de pestaña (sessionStorage) ──────

const KEY_DESBLOQUEO_SESION = 'ft_offline_desbloqueada'

export function marcarDesbloqueoSesion(): void {
  try { sessionStorage.setItem(KEY_DESBLOQUEO_SESION, '1') } catch { /* sin sessionStorage */ }
}

export function hayDesbloqueoSesion(): boolean {
  try { return sessionStorage.getItem(KEY_DESBLOQUEO_SESION) === '1' } catch { return false }
}

export function limpiarDesbloqueoSesion(): void {
  try { sessionStorage.removeItem(KEY_DESBLOQUEO_SESION) } catch { /* noop */ }
}
