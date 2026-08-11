import { CampaignList } from '@/features/operator-campaigns/components/CampaignList'
import { OfferTracking } from '@/features/operator-campaigns/components/OfferTracking'
import { PageHeader } from '@/shared/components/ui/PageHeader'

export function CampaignsPage() { return <><PageHeader title="Chiến dịch huy động & offer" description="Tổng quan hiệu suất điều phối, funnel tài xế, ngân sách và trạng thái offer theo thời gian thực." /><div className="mt-6 space-y-5"><CampaignList /><OfferTracking /></div></> }
