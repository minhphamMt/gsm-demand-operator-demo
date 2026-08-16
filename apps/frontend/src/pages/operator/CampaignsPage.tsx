import { CampaignList } from '@/features/operator-campaigns/components/CampaignList'
import { OfferTracking } from '@/features/operator-campaigns/components/OfferTracking'
import { PageHeader } from '@/shared/components/ui/PageHeader'

export function CampaignsPage() { return <div className="h-full overflow-y-auto"><PageHeader title="Chiến dịch & Offer" description="Theo dõi funnel tài xế, tiến độ zone và ngân sách theo thời gian thực." /><div className="mt-3 space-y-3"><CampaignList /><OfferTracking /></div></div> }
