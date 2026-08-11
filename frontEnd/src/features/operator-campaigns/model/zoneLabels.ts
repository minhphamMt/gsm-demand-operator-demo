const zoneLabels: Readonly<Record<string, string>> = {
  'zone-04': 'Hoàn Kiếm',
  'zone-07': 'Tây Hồ',
  'zone-10': 'Hoàng Mai',
}

export function getZoneLabel(zoneId: string) {
  return zoneLabels[zoneId] ?? zoneId
}
