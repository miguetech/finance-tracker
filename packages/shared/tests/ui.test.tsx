import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { Button, StatCard, Badge } from '../src/ui/components'

describe('ui', () => {
  it('StatCard renderiza label y value', () => {
    render(<StatCard label="Cobrado" value="$1,000.00" />)
    expect(screen.getByText('Cobrado')).toBeTruthy()
    expect(screen.getByText('$1,000.00')).toBeTruthy()
  })
  it('Badge renderiza tono', () => {
    render(<Badge tone="success">Pagada</Badge>)
    expect(screen.getByText('Pagada')).toBeTruthy()
  })
})

describe('Button', () => {
  it('renderiza con variante success', () => {
    render(<Button variant="success">Guardar</Button>)
    const btn = screen.getByText('Guardar')
    expect(btn.className).toContain('bg-green-600')
  })
  it('size lg agrega padding grande', () => {
    render(<Button size="lg">Grande</Button>)
    expect(screen.getByText('Grande').className).toContain('px-5')
  })
  it('iconOnly no renderiza texto', () => {
    const { container } = render(<Button iconOnly aria-label="editar">✎</Button>)
    expect(container.textContent).toBe('')
  })
  it('icon se renderiza antes del texto', () => {
    render(<Button icon={<span data-testid="ico">+</span>}>Crear</Button>)
    expect(screen.getByTestId('ico')).toBeTruthy()
  })
})
