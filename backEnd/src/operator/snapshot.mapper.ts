type SnapshotCellRow = {
  available_supply?: unknown;
  current_demand?: unknown;
  current_supply?: unknown;
  h3_index?: unknown;
  predicted_demand?: unknown;
}

type H3CellRow = {
  ai_zone_id?: unknown;
  boundary_geojson?: { coordinates?: unknown } | null;
  center_geojson?: { coordinates?: unknown } | null;
  district_name?: unknown;
}

type AiForecastRow = {
  confidence?: unknown;
  predicted_demand?: unknown;
}

const numeric = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0

export function mapSnapshotZone(
  cell: SnapshotCellRow,
  h3?: H3CellRow,
  forecasts?: { horizon15?: AiForecastRow; horizon30?: AiForecastRow },
) {
  const supply = numeric(cell.available_supply ?? cell.current_supply)
  const demand = numeric(cell.current_demand)
  const forecast15 = numeric(forecasts?.horizon15?.predicted_demand ?? cell.predicted_demand)
  const forecast30 = numeric(forecasts?.horizon30?.predicted_demand ?? forecast15)
  const gap = Math.max(0, demand - supply)

  return {
    id: String(cell.h3_index ?? ''),
    h3Index: String(cell.h3_index ?? ''),
    label: String(h3?.district_name ?? cell.h3_index ?? ''),
    center: Array.isArray(h3?.center_geojson?.coordinates) ? h3.center_geojson.coordinates : null,
    boundary: Array.isArray(h3?.boundary_geojson?.coordinates)
      && Array.isArray(h3.boundary_geojson.coordinates[0]) ? h3.boundary_geojson.coordinates[0] : [],
    supply,
    demand,
    gap,
    severity: severityForGap(gap),
    confidence: forecasts?.horizon15?.confidence === null || forecasts?.horizon15?.confidence === undefined
      ? null
      : numeric(forecasts.horizon15.confidence) * 100,
    forecast15,
    forecast30,
  }
}

function severityForGap(gap: number) {
  if (gap >= 11) return 'Critical'
  if (gap >= 6) return 'High'
  if (gap >= 1) return 'Medium'
  return 'Low'
}
