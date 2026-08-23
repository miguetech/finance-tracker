/** Codificación del volcado del espejo para persistencia: base64 plano o
 *  sobre de cifrado AES-GCM (cuando hay clave). Mismo canal IndexedDB. */

export function codificarPlano(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return JSON.stringify({ v: 1, plano: true, datos: btoa(s) })
}

export function decodificar(json: string): { datosB64: string; cifrado: boolean } | null {
  try {
    const obj = JSON.parse(json) as { v?: number; plano?: boolean; datos?: string; salt?: string }
    if (!obj.datos) return null
    if (obj.plano) return { datosB64: obj.datos, cifrado: false }
    if (obj.salt) return { datosB64: obj.datos, cifrado: true } // descifrar requiere el pin
    return null
  } catch { return null }
}

export function aB64(bytes: Uint8Array): string {
  let s = ''
  for (const b of bytes) s += String.fromCharCode(b)
  return btoa(s)
}

export function deB64(b64: string): Uint8Array {
  return Uint8Array.from(atob(b64), c => c.charCodeAt(0))
}
