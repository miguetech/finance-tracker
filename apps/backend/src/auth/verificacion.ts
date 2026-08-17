import { randomAlfa } from '@ft/shared'

export interface IntentoVerificacion {
  codigo: string
  dispositivo: string
  verif: string
  exp: number
  email: string
}

export type EnviarVerificacion = (email: string, codigo: string) => void

export interface Verificador {
  iniciar(intento: Omit<IntentoVerificacion, 'verif' | 'exp'>): { intentoId: string }
  validar(intentoId: string, codigoIngresado: string): IntentoVerificacion | null
}

const TTL_MS = 10 * 60 * 1000

function randomDigits(len: number): string {
  const cryptoObj = globalThis.crypto as Crypto | undefined
  let out = ''
  for (let i = 0; i < len; i++) {
    if (cryptoObj?.getRandomValues) {
      const buf = new Uint8Array(1)
      cryptoObj.getRandomValues(buf)
      out += String(buf[0] % 10)
    } else {
      out += String(Math.floor(Math.random() * 10))
    }
  }
  return out
}

export function createVerificador(opts: { store: Map<string, IntentoVerificacion>, enviar: EnviarVerificacion }): Verificador {
  return {
    iniciar(intento) {
      const intentoId = randomAlfa(8)
      const verif = randomDigits(6)
      opts.store.set(intentoId, { ...intento, verif, exp: Date.now() + TTL_MS })
      opts.enviar(intento.email, verif)
      return { intentoId }
    },
    validar(intentoId, codigoIngresado) {
      const intento = opts.store.get(intentoId)
      if (!intento) return null
      if (intento.exp < Date.now() || intento.verif !== codigoIngresado) {
        opts.store.delete(intentoId)
        return null
      }
      opts.store.delete(intentoId)
      return intento
    }
  }
}