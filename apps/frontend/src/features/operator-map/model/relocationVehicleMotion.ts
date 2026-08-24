export type RouteCoordinate = readonly [longitude: number, latitude: number]

export type RouteMotion = {
  bearing: number
  coordinate: [longitude: number, latitude: number]
}

/** Returns the screen-independent position and heading for the relocation car. */
export function routeMotionAt(coordinates: readonly RouteCoordinate[], progress: number): RouteMotion | null {
  if (coordinates.length === 0) return null
  if (coordinates.length === 1) return { bearing: 0, coordinate: [...coordinates[0]!] }

  const finiteProgress = Number.isFinite(progress) ? progress : 0
  const normalizedProgress = ((finiteProgress % 1) + 1) % 1
  const routeProgress = normalizedProgress * (coordinates.length - 1)
  const segmentIndex = Math.min(Math.floor(routeProgress), coordinates.length - 2)
  const segmentProgress = routeProgress - segmentIndex
  const start = coordinates[segmentIndex]!
  const end = coordinates[segmentIndex + 1]!
  const longitude = start[0] + (end[0] - start[0]) * segmentProgress
  const latitude = start[1] + (end[1] - start[1]) * segmentProgress
  const averageLatitudeRadians = ((start[1] + end[1]) / 2) * Math.PI / 180
  const eastward = (end[0] - start[0]) * Math.cos(averageLatitudeRadians)
  const northward = end[1] - start[1]
  const bearing = (Math.atan2(eastward, northward) * 180 / Math.PI + 360) % 360

  return { bearing, coordinate: [longitude, latitude] }
}
