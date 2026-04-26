import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { apiClient } from './api-client'

const toastSuccessMock = vi.fn()
const toastWarningMock = vi.fn()

vi.mock('sonner', () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccessMock(...args),
    warning: (...args: unknown[]) => toastWarningMock(...args),
  },
}))

describe('apiClient cluster transport', () => {
  const fetchMock = vi.fn()

  beforeEach(() => {
    fetchMock.mockReset()
    toastSuccessMock.mockReset()
    toastWarningMock.mockReset()
    vi.stubGlobal('fetch', fetchMock)
    apiClient.setClusterProvider(() => '生产集群')
  })

  afterEach(() => {
    apiClient.setClusterProvider(() => null)
  })

  it('moves the cluster name from headers to the query string', async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({
        'content-type': 'application/json',
      }),
      json: async () => ({ ok: true }),
    })

    await apiClient.get('/nodes')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/nodes?x-cluster-name=%E7%94%9F%E4%BA%A7%E9%9B%86%E7%BE%A4',
      expect.objectContaining({
        headers: {
          'Content-Type': 'application/json',
        },
      })
    )
  })

  it('retries original request after source reload succeeds', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        headers: new Headers({
          'content-type': 'application/json',
        }),
        json: async () => ({
          error: 'upstream failure',
          errorDetail: 'connection refused',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
        }),
        json: async () => ({
          ok: true,
          changed: true,
          reconnected: true,
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
        }),
        json: async () => ({ data: 'ok' }),
      })

    const result = await apiClient.get<{ data: string }>('/nodes')
    expect(result).toEqual({ data: 'ok' })

    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/v1/admin/clusters/source-reload?x-cluster-name=%E7%94%9F%E4%BA%A7%E9%9B%86%E7%BE%A4',
      expect.objectContaining({
        method: 'POST',
      })
    )
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(toastSuccessMock).toHaveBeenCalledTimes(1)
  })

  it('does not retry when source reload says config is unchanged', async () => {
    fetchMock
      .mockResolvedValueOnce({
        ok: false,
        status: 502,
        headers: new Headers({
          'content-type': 'application/json',
        }),
        json: async () => ({
          error: 'upstream failure',
          errorDetail: 'connection refused',
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({
          'content-type': 'application/json',
        }),
        json: async () => ({
          ok: true,
          changed: false,
          message: 'kubeconfig file is unchanged',
        }),
      })

    await expect(apiClient.get('/nodes')).rejects.toThrow('upstream failure')
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(toastSuccessMock).not.toHaveBeenCalled()
  })
})
