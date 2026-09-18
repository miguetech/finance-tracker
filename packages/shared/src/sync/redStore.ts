/** Estado de red REAL: no solo navigator.onLine (que miente cuando el WiFi
 *  está conectado pero internet no responde). Cada fallo de transporte que
 *  detecta la app (fetch abortado/timeout en SheetsApi, error de red en la
 *  cola) marca este flag; un éxito posterior lo limpia. La UI lo usa para
 *  mostrar el modal de paso a modo offline SIN esperar a recargar. */

let falloRed = false
const suscriptores = new Set<(offline: boolean) => void>()

export function marcarFalloRed(): void {
  if (falloRed) return
  falloRed = true
  for (const fn of suscriptores) fn(true)
}

export function marcarRedOk(): void {
  if (!falloRed) return
  falloRed = false
  for (const fn of suscriptores) fn(false)
}

export function hayFalloRed(): boolean {
  return falloRed
}

export function suscribirRed(fn: (offline: boolean) => void): () => void {
  suscriptores.add(fn)
  return () => { suscriptores.delete(fn) }
}