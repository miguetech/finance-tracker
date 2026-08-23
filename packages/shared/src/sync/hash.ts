type Row = Record<string, string | number>

function fnv1a(texto: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** Hash estable y sensible al orden para detectar cambios de una tabla completa. */
export function hashTabla(filas: Row[]): string {
  let acc = ''
  for (const f of filas) {
    acc = fnv1a(acc + JSON.stringify(f))
  }
  return acc || fnv1a('')
}
