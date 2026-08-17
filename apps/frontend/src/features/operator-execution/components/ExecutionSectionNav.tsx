import { ClipboardCheck, MessageSquareText } from 'lucide-react'
import { Link, useLocation } from 'react-router'

import { routes } from '@/shared/config/routes'

import '@/shared/components/layout/execution-section-nav.css'

export function ExecutionSectionNav() {
  const location = useLocation()
  const isOfferSection = location.pathname.startsWith(routes.operator.executionOffersRoot)

  return <nav aria-label="Khu vực đang vận hành" className="nf-workspace-subnav">
    <div className="nf-workspace-subnav-copy">
      <small>ĐANG VẬN HÀNH</small>
      <span>Chọn luồng cần theo dõi</span>
    </div>
    <div className="nf-workspace-subnav-links">
      <Link aria-current={!isOfferSection ? 'page' : undefined} className={!isOfferSection ? 'is-active' : ''} to={routes.operator.execution}><ClipboardCheck size={15} />Phương án</Link>
      <Link aria-current={isOfferSection ? 'page' : undefined} className={isOfferSection ? 'is-active' : ''} to={routes.operator.executionOffersRoot}><MessageSquareText size={15} />Offer</Link>
    </div>
  </nav>
}
