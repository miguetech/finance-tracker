import { describe, it, expect } from 'vitest'
import { parseCsv, contactosDesdeCsv, formatearTelefono, whatsappUrl, mailtoUrl } from '../src/lib/contactos'

describe('contactos', () => {
  it('parseCsv lee comas, punto y coma y comillas', () => {
    const a = parseCsv('nombre,telefono\nAna,+58 412 1234567')
    expect(a).toHaveLength(1)
    expect(a[0].nombre).toBe('Ana')
    const b = parseCsv('"nombre;extra";tel\n"Perez, Juan";0412-999')
    expect(b[0]['nombre;extra']).toBe('Perez, Juan')
    expect(b[0].tel).toBe('0412-999')
  })
  it('parseCsv vacío devuelve []', () => {
    expect(parseCsv('')).toEqual([])
    expect(parseCsv('\n\n')).toEqual([])
  })
  it('formatearTelefono añade código de país y limpia símbolos', () => {
    expect(formatearTelefono('(412) 123-4567', '58')).toBe('+584121234567')
    expect(formatearTelefono('+34 600 111 222')).toBe('+34600111222')
    expect(formatearTelefono('', '58')).toBe('')
  })
  it('contactosDesdeCsv mapea columnas de Google Contacts', () => {
    const csv = 'Name,"Phone 1 - Value",E-mail 1 - Value\nLuis Pérez,+58 414 555 1212,luis@x.com'
    const cs = contactosDesdeCsv(csv, '58', 'proveedores')
    expect(cs).toHaveLength(1)
    expect(cs[0]).toMatchObject({ nombre: 'Luis Pérez', email: 'luis@x.com', origen: 'csv', etiqueta: 'proveedores' })
    expect(cs[0].telefono.startsWith('+')).toBe(true)
  })
  it('whatsappUrl genera enlace wa.me con mensaje', () => {
    const url = whatsappUrl('+58 412 1234567', 'Hola, ¿cómo va?')
    expect(url.startsWith('https://wa.me/584121234567?text=')).toBe(true)
    expect(url).toContain('Hola%2C')
  })
  it('mailtoUrl codifica asunto', () => {
    expect(mailtoUrl('a@b.com', 'Pedido urgente')).toBe('mailto:a@b.com?subject=Pedido%20urgente')
  })
})
