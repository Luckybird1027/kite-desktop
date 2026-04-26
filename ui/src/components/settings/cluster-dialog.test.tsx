import React from 'react'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('react-i18next', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-i18next')>()
  return {
    ...actual,
    useTranslation: () => ({
      t: (
        key: string,
        fallbackOrOptions?: string | { defaultValue?: string; version?: string }
      ) => {
        if (typeof fallbackOrOptions === 'string') {
          return fallbackOrOptions
        }
        if (fallbackOrOptions?.defaultValue) {
          return fallbackOrOptions.defaultValue.replace(
            '{{version}}',
            fallbackOrOptions.version ?? ''
          )
        }
        return key
      },
    }),
  }
})

const openNativeFileMock = vi.fn()
vi.mock('@/lib/desktop', () => ({
  openNativeFile: (...args: unknown[]) => openNativeFileMock(...args),
}))

import { ClusterDialog } from './cluster-dialog'

beforeEach(() => {
  openNativeFileMock.mockReset()

  if (!HTMLElement.prototype.hasPointerCapture) {
    Object.defineProperty(HTMLElement.prototype, 'hasPointerCapture', {
      configurable: true,
      value: () => false,
    })
  }
  if (!HTMLElement.prototype.setPointerCapture) {
    Object.defineProperty(HTMLElement.prototype, 'setPointerCapture', {
      configurable: true,
      value: () => {},
    })
  }
  if (!HTMLElement.prototype.releasePointerCapture) {
    Object.defineProperty(HTMLElement.prototype, 'releasePointerCapture', {
      configurable: true,
      value: () => {},
    })
  }
  if (!HTMLElement.prototype.scrollIntoView) {
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: () => {},
    })
  }

  class ResizeObserverMock {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  vi.stubGlobal('ResizeObserver', ResizeObserverMock)
})

describe('ClusterDialog', () => {
  it('keeps create disabled until connection test succeeds', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()
    const onTestConnection = vi
      .fn()
      .mockResolvedValue({ message: 'ok', version: 'v1.30.0' })

    render(
      <ClusterDialog
        open
        onOpenChange={() => {}}
        onSubmit={onSubmit}
        onTestConnection={onTestConnection}
      />
    )

    const nameInput = screen.getByLabelText('Cluster Name *')
    const configInput = screen.getByLabelText('Kubeconfig *')
    const addButton = screen.getByRole('button', { name: 'Add Cluster' })
    const testButton = screen.getByRole('button', { name: 'Test Connection' })

    expect(addButton).toBeDisabled()
    expect(testButton).toBeDisabled()

    await user.type(nameInput, 'dev-cluster')
    await user.type(configInput, 'apiVersion: v1')

    expect(testButton).toBeEnabled()
    expect(addButton).toBeDisabled()

    await user.click(testButton)

    await waitFor(() => expect(onTestConnection).toHaveBeenCalledTimes(1))
    await waitFor(() => expect(addButton).toBeEnabled())

    await user.type(configInput, '\nkind: Config')

    await waitFor(() => expect(addButton).toBeDisabled())
  })

  it('keeps create disabled when connection test fails', async () => {
    const user = userEvent.setup()
    const onTestConnection = vi.fn().mockRejectedValue(new Error('connection failed'))

    render(
      <ClusterDialog
        open
        onOpenChange={() => {}}
        onSubmit={() => {}}
        onTestConnection={onTestConnection}
      />
    )

    await user.type(screen.getByLabelText('Cluster Name *'), 'dev-cluster')
    await user.type(screen.getByLabelText('Kubeconfig *'), 'apiVersion: v1')
    await user.click(screen.getByRole('button', { name: 'Test Connection' }))

    await waitFor(() => expect(onTestConnection).toHaveBeenCalledTimes(1))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add Cluster' })).toBeDisabled()
    )
  })

  it('requires kubeconfig path when config source is file', async () => {
    const user = userEvent.setup()
    const onTestConnection = vi
      .fn()
      .mockResolvedValue({ message: 'ok', version: 'v1.30.0' })

    render(
      <ClusterDialog
        open
        onOpenChange={() => {}}
        onSubmit={() => {}}
        onTestConnection={onTestConnection}
      />
    )

    await user.type(screen.getByLabelText('Cluster Name *'), 'dev-cluster')
    await user.click(screen.getAllByRole('combobox')[1])
    const configSourceOptions = await screen.findAllByText(
      'Use local kubeconfig file'
    )
    await user.click(configSourceOptions[1] ?? configSourceOptions[0])

    expect(screen.queryByLabelText('Kubeconfig *')).not.toBeInTheDocument()
    expect(screen.getByLabelText('Kubeconfig File *')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: 'Test Connection' })
    ).toBeDisabled()

    await user.type(
      screen.getByLabelText('Kubeconfig File *'),
      'C:/Users/demo/.kube/config'
    )
    expect(screen.getByRole('button', { name: 'Test Connection' })).toBeEnabled()
  })

  it('fills kubeconfig path from native file picker', async () => {
    const user = userEvent.setup()
    openNativeFileMock.mockResolvedValue({
      canceled: false,
      path: 'C:/Users/demo/.kube/config',
    })

    render(
      <ClusterDialog
        open
        onOpenChange={() => {}}
        onSubmit={() => {}}
        onTestConnection={vi.fn()}
      />
    )

    await user.click(screen.getAllByRole('combobox')[1])
    const configSourceOptions = await screen.findAllByText(
      'Use local kubeconfig file'
    )
    await user.click(configSourceOptions[1] ?? configSourceOptions[0])
    await user.click(screen.getByRole('button', { name: 'Browse' }))

    await waitFor(() => {
      expect(screen.getByLabelText('Kubeconfig File *')).toHaveValue(
        'C:/Users/demo/.kube/config'
      )
    })
  })
})
