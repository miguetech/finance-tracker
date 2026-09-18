/** Pestaña Sistema (spec F1): metadatos de operación del sistema, separados
 *  de Config. Misma forma que Config (clave/valor, HEADER_ROWS=0), SOLO en el
 *  BASE. Vive fuera de TABLES porque no es un catálogo de negocio. */

export const SISTEMA_SHEET = 'Sistema'
export const SISTEMA_RANGO = `'${SISTEMA_SHEET}'!A1:B500`

/** Claves fijas del sistema. `eventos_{año}` se reconoce por patrón. */
export const CLAVES_SISTEMA = [
  'ft_vers',
  'ft_instancia',
  'ft_id',
  'ft_estado',
  'ft_historial',
  'ft_dueño_email',
  'ft_transferencia',
  'ft_lock_largo',
  'mutex',
  'reset_historial',
  'anio_activo'
] as const

/** ¿Es una clave del sistema (nunca debe vivir en Config)? */
export function esClaveSistema(clave: string): boolean {
  if (/^eventos_\d{4}$/.test(clave)) return true
  return (CLAVES_SISTEMA as readonly string[]).includes(clave)
}