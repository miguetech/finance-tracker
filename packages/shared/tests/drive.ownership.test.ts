import { afterEach, describe, expect, it, vi } from 'vitest'
import { DriveApi } from '../src/drive/api'

afterEach(() => {
  vi.unstubAllGlobals()
})

function driveWithMock(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal('fetch', fetchMock)
  return new DriveApi(async () => 'TOKEN')
}

describe('DriveApi.getFileInfo', () => {
  it('returns owners + capabilities on success', async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) => {
      const u = String(url)
      if (u.includes('/drive/v3/files/') && !u.includes('?fields=appProperties')) {
        return { ok: true, json: async () => ({ owners: [{ emailAddress: 'u@x.com', me: true }], capabilities: { canEdit: true }, trashed: false }) }
      }
      return { ok: true, json: async () => ({}) }
    })
    const drive = driveWithMock(fetchMock)
    const res = await drive.getFileInfo('FILE123')
    expect(res).toEqual({ owners: [{ emailAddress: 'u@x.com', me: true }], capabilities: { canEdit: true }, trashed: false })
  })

  it('returns null on 404 (fuera de namespace drive.file)', async () => {
    const drive = driveWithMock(vi.fn(async () => ({ ok: false, status: 404, text: async () => 'not found' })))
    const res = await drive.getFileInfo('AJENA')
    expect(res).toBeNull()
  })

  it('re-throws non-404 errors (quota, 5xx)', async () => {
    const drive = driveWithMock(vi.fn(async () => ({ ok: false, status: 500, text: async () => 'Internal Server Error' })))
    await expect(drive.getFileInfo('X')).rejects.toThrow('Drive API 500')
  })
})
