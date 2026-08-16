import { useSyncExternalStore } from 'react';
import type { OfferStatus } from './types';

/**
 * Mô phỏng một POST từ Operator mà không ghi vào Supabase: demo cần kiểm tra
 * notification với nhiều payload ngay cả khi campaign/vùng thưởng trong DB đã hết hạn.
 * Dùng external store nhỏ thay vì context để các component đang gọi `useOffers()`
 * cùng nhìn thấy đúng một notification; không tạo API giả trong production bundle.
 */

export interface DemoOperatorPayload {
  key: string;
  placeName: string;
  latitude: number;
  longitude: number;
  incentive: number;
  distanceKm: number;
  etaMinutes: number;
}

export interface DemoOperatorOffer extends DemoOperatorPayload {
  offerId: string;
  createdAt: string;
  status: OfferStatus;
}

export const DEMO_OPERATOR_PRESETS: readonly DemoOperatorPayload[] = [
  {
    key: 'cau-giay',
    placeName: 'Cầu Giấy',
    latitude: 21.0362,
    longitude: 105.7826,
    incentive: 5000,
    distanceKm: 11.9,
    etaMinutes: 27,
  },
  {
    key: 'bach-khoa',
    placeName: 'Bách Khoa',
    latitude: 21.0041,
    longitude: 105.8443,
    incentive: 7000,
    distanceKm: 5.4,
    etaMinutes: 16,
  },
  {
    key: 'ho-tay',
    placeName: 'Hồ Tây',
    latitude: 21.0582,
    longitude: 105.8188,
    incentive: 9000,
    distanceKm: 8.7,
    etaMinutes: 22,
  },
];

let currentOffer: DemoOperatorOffer | null = null;
let sequence = 0;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

/** Mô phỏng `POST /operator/offers` bằng payload đã chọn trên control ngoài phone. */
export function simulateOperatorPost(payload: DemoOperatorPayload): DemoOperatorOffer {
  const now = new Date().toISOString();
  currentOffer = {
    ...payload,
    offerId: `demo-operator-${payload.key}-${++sequence}`,
    createdAt: now,
    status: 'SENT',
  };
  emit();
  return currentOffer;
}

export function clearDemoOperatorOffer() {
  if (!currentOffer) return;
  currentOffer = null;
  emit();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => currentOffer;

export function useDemoOperatorOffer(): DemoOperatorOffer | null {
  return useSyncExternalStore(subscribe, getSnapshot, () => null);
}
