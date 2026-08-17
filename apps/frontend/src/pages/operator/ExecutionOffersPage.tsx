import { MessageSquareText } from 'lucide-react'
import { useParams } from 'react-router'

import { OfferTracking } from '@/features/operator-campaigns/components/OfferTracking'
import { OperatorWorkspacePage } from '@/shared/components/layout/OperatorWorkspacePage'

export function ExecutionOffersPage() {
  const { campaignId } = useParams()

  return (
    <OperatorWorkspacePage
      description="Theo dõi phản hồi, xe đến và các offer đang phát hành của phương án hiện tại."
      eyebrow="VẬN HÀNH · OFFER TRỰC TIẾP"
      icon={<MessageSquareText size={20} />}
      statusLabel="TỰ ĐỘNG CẬP NHẬT 2 GIÂY"
      title="Offer đang phát hành"
    >
      {campaignId ? <OfferTracking campaignId={campaignId} /> : <OfferTracking />}
    </OperatorWorkspacePage>
  )
}
