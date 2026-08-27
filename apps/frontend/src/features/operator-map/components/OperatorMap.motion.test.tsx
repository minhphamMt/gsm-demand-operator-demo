import { act, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { Move } from '@/features/operator-data'
import { createZones } from '@/features/operator-data/model/zoneGeometry'

const mapboxMocks = vi.hoisted(() => ({
  setLngLat: vi.fn(),
  setRotation: vi.fn(),
}))

vi.mock('@/shared/config/env', () => ({
  env: { hasMapboxToken: true, mapboxAccessToken: 'pk.test' },
}))

vi.mock('mapbox-gl/esm', () => {
  class MockMap {
    private readonly canvas = { style: { cursor: '' } }

    addControl() { return this }
    addLayer() { return this }
    addSource() { return this }
    easeTo() { return this }
    flyTo() { return this }
    getCanvas() { return this.canvas }
    getLayer() { return {} }
    getSource() { return { setData: vi.fn() } }
    isStyleLoaded() { return true }
    jumpTo() { return this }
    off() { return this }
    on(event: string, ...args: unknown[]) {
      if (event === 'load') {
        const handler = args.at(-1) as (() => void)
        queueMicrotask(handler)
      }
      return this
    }
    once() { return this }
    remove() { return undefined }
    resize() { return this }
    setFeatureState() { return this }
    setPaintProperty() { return this }
    stop() { return this }
  }

  class MockMarker {
    private readonly element: HTMLElement

    constructor({ element }: { element: HTMLElement }) {
      this.element = element
    }
    addTo() {
      document.body.append(this.element)
      return this
    }
    getElement() { return this.element }
    remove() {
      this.element.remove()
      return this
    }
    setLngLat(coordinate: unknown) {
      mapboxMocks.setLngLat(coordinate)
      this.element.dataset.coordinate = JSON.stringify(coordinate)
      return this
    }
    setRotation(bearing: number) {
      mapboxMocks.setRotation(bearing)
      this.element.dataset.bearing = String(bearing)
      return this
    }
  }

  return {
    AttributionControl: class {},
    Map: MockMap,
    Marker: MockMarker,
    NavigationControl: class {},
  }
})

import { OperatorMap } from './OperatorMap'

describe('OperatorMap relocation vehicle', () => {
  let animationFrames: FrameRequestCallback[]
  let nowMs: number

  beforeEach(() => {
    mapboxMocks.setLngLat.mockClear()
    mapboxMocks.setRotation.mockClear()
    animationFrames = []
    nowMs = Date.parse('2026-08-25T00:00:00.000Z')
    vi.spyOn(Date, 'now').mockImplementation(() => nowMs)
    vi.stubGlobal('ResizeObserver', class {
      disconnect() { return undefined }
      observe() { return undefined }
    })
    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      animationFrames.push(callback)
      return 1
    }))
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('renders the project car and advances it along each executing move', async () => {
    const zones = createZones().slice(0, 2).map((zone) => ({ ...zone, rainMmH: 0 }))
    const move = {
      id: 'move-1',
      etaMinutes: 15,
      sourceZoneId: zones[0]!.id,
      targetZoneId: zones[1]!.id,
      quantity: 8,
    } as Move
    const commonProps = {
      forecastMinutes: 5,
      moves: [move],
      onZoneSelect: vi.fn(),
      vehicleStartedAt: '2026-08-25T00:00:00.000Z',
      zones,
    }
    const view = render(<OperatorMap {...commonProps} flowState="executing" />)

    const marker = await screen.findByRole('img', { name: '8 xe đang điều chuyển' })
    expect(marker).toHaveAttribute('data-move-id', 'move-1')
    expect(marker.querySelector('img')).toHaveAttribute('src', expect.stringContaining('operations-car-cartoon.png'))
    expect(mapboxMocks.setLngLat).toHaveBeenCalled()

    act(() => animationFrames.splice(0).forEach((callback) => callback(1_000)))
    const startCoordinate = marker.dataset.coordinate
    nowMs = Date.parse('2026-08-25T00:06:00.000Z')
    act(() => animationFrames.splice(0).forEach((callback) => callback(3_000)))
    expect(marker.dataset.coordinate).not.toBe(startCoordinate)
    expect(mapboxMocks.setRotation).toHaveBeenCalled()

    nowMs = Date.parse('2026-08-25T00:12:00.000Z')
    act(() => animationFrames.splice(0).forEach((callback) => callback(4_000)))
    const destinationCoordinate = marker.dataset.coordinate
    nowMs = Date.parse('2026-08-25T00:20:00.000Z')
    act(() => animationFrames.splice(0).forEach((callback) => callback(5_000)))
    expect(marker.dataset.coordinate).toBe(destinationCoordinate)

    view.rerender(<OperatorMap {...commonProps} flowState="completed" />)
    await waitFor(() => expect(screen.queryByRole('img', { name: '8 xe đang điều chuyển' })).not.toBeInTheDocument())
  })

  // Hồi quy: nguồn `operator-move-flows` mang cả cung điều chuyển lẫn hình mũi tên. Không lọc
  // theo `kind` thì mỗi chặng sinh hai xe — một chiếc bám vào ba điểm của mũi tên.
  it('runs exactly one vehicle per move even though the flow source also carries arrowheads', async () => {
    const zones = createZones().slice(0, 2).map((zone) => ({ ...zone, rainMmH: 0 }))
    const move = {
      id: 'move-1',
      etaMinutes: 15,
      sourceZoneId: zones[0]!.id,
      targetZoneId: zones[1]!.id,
      quantity: 8,
    } as Move

    render(<OperatorMap flowState="executing" forecastMinutes={5} moves={[move]} onZoneSelect={vi.fn()} vehicleStartedAt="2026-08-25T00:00:00.000Z" zones={zones} />)

    const markers = await screen.findAllByRole('img', { name: '8 xe đang điều chuyển' })
    expect(markers).toHaveLength(1)
    expect(markers[0]).toHaveAttribute('data-move-id', 'move-1')
  })
})
