import React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, waitFor, act, fireEvent } from '@testing-library/react'
import { ModalConexionPerdida } from '../src/ui/sesionOffline'
import type { RegistroSesion, StorageAdapter } from '../src/data/storage'
import * as sesionOfflineModule from '../src/auth/sesionOffline'

function kv(): StorageAdapter {
  const mapa = new Map<string, string>()
  return { get: async k => mapa.get(k) ?? null, set: async (k, v) => { mapa.set(k, v) }, remove: async k => { mapa.delete(k) } }
}

const registroBase: RegistroSesion = {
  cuenta: 'test@example.com',
  ultimo_pull: Date.now(),
  pin: null,
  cifrado: false,
  creado_en: Date.now()
}

describe('ModalConexionPerdida solo en acciones críticas', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('se renderiza con texto de conexión perdida', () => {
    const almacen = kv()
    const { getByText } = render(
      <ModalConexionPerdida
        almacen={almacen}
        registro={registroBase}
        onEntrar={() => {}}
        yaDesbloqueado={true}
      />
    )
    expect(getByText('Se perdió la conexión a internet')).toBeInTheDocument()
  })

  it('llama onEntrar con PIN cuando se hace clic en entrar', async () => {
    vi.useRealTimers()
    const almacen = kv()
    await almacen.set('pin', '1234')
    const registroConPin: RegistroSesion = { ...registroBase, pin: '1234' }

    const verificarPinSpy = vi.spyOn(sesionOfflineModule, 'verificarPin').mockResolvedValue(true)

    let pinRecibido: string | undefined
    const { getByPlaceholderText, getByRole } = render(
      <ModalConexionPerdida
        almacen={almacen}
        registro={registroConPin}
        onEntrar={(pin) => { pinRecibido = pin }}
        yaDesbloqueado={false}
      />
    )

    const input = getByPlaceholderText(/pin/i)
    fireEvent.change(input, { target: { value: '1234' } })
    fireEvent.click(getByRole('button', { name: /entrar sin conexión/i }))

    await waitFor(() => expect(pinRecibido).toBe('1234'))
    verificarPinSpy.mockRestore()
    vi.useFakeTimers()
  })

  it('no llama onEntrar si PIN incorrecto', async () => {
    vi.useRealTimers()
    const almacen = kv()
    await almacen.set('pin', '1234')
    const registroConPin: RegistroSesion = { ...registroBase, pin: '1234' }

    const verificarPinSpy = vi.spyOn(sesionOfflineModule, 'verificarPin').mockResolvedValue(false)

    let pinRecibido: string | undefined
    const { getByPlaceholderText, getByRole, getByText } = render(
      <ModalConexionPerdida
        almacen={almacen}
        registro={registroConPin}
        onEntrar={(pin) => { pinRecibido = pin }}
        yaDesbloqueado={false}
      />
    )

    const input = getByPlaceholderText(/pin/i)
    fireEvent.change(input, { target: { value: '9999' } })
    fireEvent.click(getByRole('button', { name: /entrar sin conexión/i }))

    await waitFor(() => expect(getByText(/PIN incorrecto/i)).toBeInTheDocument())
    expect(pinRecibido).toBeUndefined()
    verificarPinSpy.mockRestore()
    vi.useFakeTimers()
  })
})