/** Hạng thành viên tính theo tổng chi tiêu (đơn đã hoàn tất) */
export type TierKey = 'BRONZE' | 'SILVER' | 'GOLD';

export interface Tier {
  key: TierKey;
  label: string;
  icon: string;
  /** Tổng chi tiêu tối thiểu (VNĐ) */
  minSpent: number;
  perks: string[];
}

export const TIERS: Tier[] = [
  { key: 'BRONZE', label: 'Đồng', icon: '🥉', minSpent: 0, perks: ['Tích 1 điểm cho mỗi 10.000đ', 'Ưu đãi sinh nhật'] },
  { key: 'SILVER', label: 'Bạc', icon: '🥈', minSpent: 2_000_000, perks: ['Giảm 3% mọi đơn hàng', 'Tích 1,2× điểm', 'Ưu đãi sinh nhật'] },
  { key: 'GOLD', label: 'Vàng', icon: '🥇', minSpent: 5_000_000, perks: ['Giảm 5% mọi đơn hàng', 'Miễn phí in lại mẫu lần 2', 'Tích 1,5× điểm', 'Quà sinh nhật'] },
];

export interface MembershipInfo {
  tier: Tier;
  next: Tier | null;
  totalSpent: number;
  points: number;
  /** % tiến độ tới hạng kế tiếp (0–100) */
  progress: number;
  /** Số tiền còn thiếu để lên hạng kế */
  remaining: number;
}

export function membershipOf(totalSpent = 0, points = 0): MembershipInfo {
  const idx = TIERS.reduce((acc, t, i) => (totalSpent >= t.minSpent ? i : acc), 0);
  const tier = TIERS[idx];
  const next = TIERS[idx + 1] ?? null;
  const progress = next ? Math.min(100, Math.round(((totalSpent - tier.minSpent) / (next.minSpent - tier.minSpent)) * 100)) : 100;
  return { tier, next, totalSpent, points, progress, remaining: next ? next.minSpent - totalSpent : 0 };
}
