import { describe, it, expect } from 'vitest'
import { SCOPE } from '../src/auth/popupOAuth'

describe('popupOAuth scope includes appdata', () => {
  it('includes drive.appdata in SCOPE', () => {
    expect(SCOPE).toContain(encodeURIComponent('https://www.googleapis.com/auth/drive.appdata'))
  })
})