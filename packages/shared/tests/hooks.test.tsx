import React from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, act, waitFor } from '@testing-library/react'

// Mock navigator.onLine
const originalOnLine = navigator.onLine

function setOnline(online: boolean) {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => online })
}

function triggerOnline() {
  window.dispatchEvent(new Event('online'))
}

function triggerOffline() {
  window.dispatchEvent(new Event('offline'))
}

describe('useOnlineDebounced', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    setOnline(true)
  })

  afterEach(() => {
    vi.useRealTimers()
    setOnline(originalOnLine)
  })

  it('retorna true inmediatamente si ya está online', async () => {
    const { useOnlineDebounced } = await import('../src/ui/hooks')
    let result: boolean
    function TestComp() { result = useOnlineDebounced(1000); return null }
    render(<TestComp />)
    expect(result).toBe(true)
  })

  it('retorna false inmediatamente si está offline', async () => {
    setOnline(false)
    const { useOnlineDebounced } = await import('../src/ui/hooks')
    let result: boolean
    function TestComp() { result = useOnlineDebounced(1000); return null }
    render(<TestComp />)
    expect(result).toBe(false)
  })

  it('espera el debounce antes de reportar online tras offline', async () => {
    setOnline(false)
    const { useOnlineDebounced } = await import('../src/ui/hooks')
    let result: boolean
    function TestComp() { result = useOnlineDebounced(500); return null }
    const { rerender } = render(<TestComp />)
    expect(result).toBe(false)

    // Simula online pero no ha pasado el debounce
    setOnline(true)
    triggerOnline()
    // Esperar a que useOnline se actualice
    await act(async () => { await Promise.resolve() })
    expect(result).toBe(false)

    // Pasado el debounce
    await act(async () => { vi.advanceTimersByTime(600) })
    expect(result).toBe(true)
  })

  it('resetea el timer si vuelve a offline antes del debounce', async () => {
    setOnline(false)
    const { useOnlineDebounced } = await import('../src/ui/hooks')
    let result: boolean
    function TestComp() { result = useOnlineDebounced(500); return null }
    const { rerender } = render(<TestComp />)

    setOnline(true)
    triggerOnline()
    await act(async () => { vi.advanceTimersByTime(300) })

    // Vuelve a offline antes de completar debounce
    setOnline(false)
    triggerOffline()
    await act(async () => { vi.advanceTimersByTime(100) })
    expect(result).toBe(false)

    // Ahora online de nuevo, debe esperar debounce completo otra vez
    setOnline(true)
    triggerOnline()
    await act(async () => { await Promise.resolve() })
    await act(async () => { vi.advanceTimersByTime(600) })
    expect(result).toBe(true)
  })

  it('cambia el debounce dinámicamente', async () => {
    setOnline(false)
    const { useOnlineDebounced } = await import('../src/ui/hooks')
    let result: boolean
    let ms = 500
    function TestComp() { result = useOnlineDebounced(ms); return null }
    render(<TestComp />)

    setOnline(true)
    triggerOnline()
    await act(async () => { vi.advanceTimersByTime(300) })
    expect(result).toBe(false)

    // Cambia debounce a 200ms
    ms = 200
    // Re-render no debería reiniciar si ya pasó tiempo suficiente
    // (comportamiento depende de implementación, documentar)
  })
})