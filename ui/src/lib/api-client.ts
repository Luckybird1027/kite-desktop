// API client with authentication support
import {
  appendClusterNameParam,
  stripClusterNameHeader,
} from './cluster-transport'
import { withSubPath } from './subpath'
import { toast } from 'sonner'

export interface APIErrorOptions {
  code?: string
  detail?: string
  status?: number
}

export class APIError extends Error {
  code?: string
  detail?: string
  status?: number

  constructor(message: string, options: APIErrorOptions = {}) {
    super(message)
    this.name = 'APIError'
    this.code = options.code
    this.detail = options.detail
    this.status = options.status
  }
}

class ApiClient {
  private baseUrl: string = ''
  private getCurrentCluster: (() => string | null) | null = null
  private reloadInFlight = new Set<string>()

  constructor(baseUrl: string = '') {
    this.baseUrl = baseUrl
  }

  setClusterProvider(provider: () => string | null) {
    this.getCurrentCluster = provider
  }

  private async makeRequest<T>(
    url: string,
    options: RequestInit = {},
    canAutoRecover: boolean = true
  ): Promise<T> {
    const fullUrl = withSubPath(this.baseUrl + url)

    const headers: Record<string, string> = {
      ...(options.headers as Record<string, string>),
    }
    const explicitClusterName = stripClusterNameHeader(headers)

    // Only set default Content-Type to application/json if not already set and body is not FormData
    if (!headers['Content-Type'] && !(options.body instanceof FormData)) {
      headers['Content-Type'] = 'application/json'
    }

    const requestUrl = appendClusterNameParam(
      fullUrl,
      explicitClusterName ?? this.getCurrentCluster?.()
    )

    const defaultOptions: RequestInit = {
      credentials: 'include',
      headers,
      ...options,
    }

    try {
      const response = await fetch(requestUrl, defaultOptions)

      if (response.status === 401) {
        throw new APIError('Unauthorized', { status: 401 })
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new APIError(
          errorData.error || `HTTP error! status: ${response.status}`,
          {
            code:
              typeof errorData.errorCode === 'string'
                ? errorData.errorCode
                : undefined,
            detail:
              typeof errorData.errorDetail === 'string'
                ? errorData.errorDetail
                : undefined,
            status: response.status,
          }
        )
      }

      const contentType = response.headers.get('content-type')
      if (contentType && contentType.includes('application/json')) {
        return await response.json()
      } else {
        return (await response.text()) as T
      }
    } catch (error) {
      if (
        canAutoRecover &&
        this.shouldTryClusterSourceReload(url, error) &&
        (await this.tryReloadClusterFromSource())
      ) {
        return this.makeRequest<T>(url, options, false)
      }

      console.error('API request failed:', error)
      throw error
    }
  }

  private shouldTryClusterSourceReload(url: string, error: unknown): boolean {
    if (!(error instanceof APIError)) {
      return false
    }
    if (!this.getCurrentCluster?.()) {
      return false
    }
    if (url.includes('/admin/clusters/source-reload')) {
      return false
    }
    if (error.status !== 500 && error.status !== 502 && error.status !== 503 && error.status !== 504) {
      return false
    }

    const message = (error.detail || error.message || '').toLowerCase()
    return (
      message.includes('connection refused') ||
      message.includes('context deadline exceeded') ||
      message.includes('no such host') ||
      message.includes('i/o timeout') ||
      message.includes('tls handshake timeout') ||
      message.includes('x509:') ||
      message.includes('eof')
    )
  }

  private async tryReloadClusterFromSource(): Promise<boolean> {
    const clusterName = this.getCurrentCluster?.()
    if (!clusterName) {
      return false
    }
    if (this.reloadInFlight.has(clusterName)) {
      return false
    }

    this.reloadInFlight.add(clusterName)
    const toastId = `cluster-source-reload-${clusterName}`

    try {
      const reloadResponse = await this.makeRequest<{
        ok: boolean
        changed: boolean
        reconnected?: boolean
        message?: string
        error?: string
      }>(
        '/admin/clusters/source-reload',
        {
          method: 'POST',
          body: JSON.stringify({ name: clusterName }),
        },
        false
      )

      if (!reloadResponse.changed) {
        return false
      }

      if (reloadResponse.ok && reloadResponse.reconnected) {
        toast.success('Detected kubeconfig file update and reconnected cluster.', {
          id: toastId,
        })
        return true
      }

      toast.warning(
        reloadResponse.error ||
          'Kubeconfig file changed, but reconnection failed. Please verify your local cluster status.',
        { id: toastId }
      )
      return false
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      toast.warning(message, { id: toastId })
      return false
    } finally {
      this.reloadInFlight.delete(clusterName)
    }
  }

  async get<T>(url: string, options?: RequestInit): Promise<T> {
    return this.makeRequest<T>(url, { ...options, method: 'GET' })
  }

  async post<T>(
    url: string,
    data?: unknown,
    options?: RequestInit
  ): Promise<T> {
    const isFormData = data instanceof FormData
    return this.makeRequest<T>(url, {
      ...options,
      method: 'POST',
      body: isFormData
        ? (data as BodyInit)
        : data
          ? JSON.stringify(data)
          : undefined,
    })
  }

  async put<T>(url: string, data?: unknown, options?: RequestInit): Promise<T> {
    const isFormData = data instanceof FormData
    return this.makeRequest<T>(url, {
      ...options,
      method: 'PUT',
      body: isFormData
        ? (data as BodyInit)
        : data
          ? JSON.stringify(data)
          : undefined,
    })
  }

  async delete<T>(url: string, options?: RequestInit): Promise<T> {
    return this.makeRequest<T>(url, { ...options, method: 'DELETE' })
  }

  async patch<T>(
    url: string,
    data?: unknown,
    options?: RequestInit
  ): Promise<T> {
    const isFormData = data instanceof FormData
    return this.makeRequest<T>(url, {
      ...options,
      method: 'PATCH',
      body: isFormData
        ? (data as BodyInit)
        : data
          ? JSON.stringify(data)
          : undefined,
    })
  }
}

export const API_BASE_URL = '/api/v1'

// Create a singleton instance
export const apiClient = new ApiClient(API_BASE_URL)
