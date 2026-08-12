import { Badge, type BadgeTone } from '@/shared/components/ui/Badge'

const severityTone: Record<string, BadgeTone> = { Low: 'info', Medium: 'warning', High: 'danger', Critical: 'danger' }
const severityLabel: Record<string, string> = { Low: 'Thấp', Medium: 'Trung bình', High: 'Cao', Critical: 'Nghiêm trọng' }

export function SeverityBadge({ severity }: { severity: string }) {
  return <Badge tone={severityTone[severity] ?? 'neutral'}>{severityLabel[severity] ?? severity}</Badge>
}
