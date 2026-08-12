import { createContext, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

/**
 * Campaign hiện đang được chọn trên bản đồ (bấm icon thưởng) — nguồn sự thật duy nhất
 * cho "popup nào đang mở ứng với campaign nào" (story D.1 ghi khi bấm icon, D.2 đọc để
 * render popup đúng campaign đó).
 *
 * Tách khỏi `DriverAppContext` (điều hướng thuần — screen/sheet, không dữ liệu server,
 * xem doc-comment đầu file đó) vì `campaignId` là một mẩu dữ liệu nghiệp vụ, không phải
 * trạng thái màn hình. Gộp vào đó sẽ buộc `DriverAppContext` phải biết về khái niệm
 * "campaign", phá vỡ ranh giới nó đã giữ từ trước.
 *
 * Không tự đọc `useCampaign()` ở đây để tra cứu object đầy đủ: nơi tiêu thụ (`DemandSheet`)
 * đã tự gọi `useCampaign()` rồi, tra hai lần dữ liệu campaign ở hai chỗ không mang lại gì
 * ngoài một cache thứ hai phải giữ đồng bộ.
 */
interface SelectedCampaignValue {
  selectedCampaignId: string | null;
  selectCampaign: (campaignId: string) => void;
  clearSelectedCampaign: () => void;
}

const SelectedCampaignReactContext = createContext<SelectedCampaignValue | null>(null);

export function SelectedCampaignProvider({ children }: { children: ReactNode }) {
  const [selectedCampaignId, setSelectedCampaignId] = useState<string | null>(null);

  const value = useMemo<SelectedCampaignValue>(
    () => ({
      selectedCampaignId,
      selectCampaign: (campaignId: string) => setSelectedCampaignId(campaignId),
      clearSelectedCampaign: () => setSelectedCampaignId(null),
    }),
    [selectedCampaignId],
  );

  return (
    <SelectedCampaignReactContext.Provider value={value}>{children}</SelectedCampaignReactContext.Provider>
  );
}

export function useSelectedCampaign(): SelectedCampaignValue {
  const ctx = useContext(SelectedCampaignReactContext);
  if (!ctx) throw new Error('useSelectedCampaign must be used within SelectedCampaignProvider');
  return ctx;
}
