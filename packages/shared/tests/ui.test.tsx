import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { StatCard, Badge } from '../src/ui/components'

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
