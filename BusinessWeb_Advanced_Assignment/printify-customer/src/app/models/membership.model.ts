/** Hạng thành viên tính theo tổng chi tiêu (đơn đã hoàn tất) */
export type TierKey = 'BRONZE' | 'SILVER' | 'GOLD';

export interface Tier {
  key: TierKey;
  label: string;
  icon: string;
  /** Tổng chi tiêu tối thiểu (VNĐ) */
  minSpent: number;
  /** Giảm trên tiền hàng mọi đơn (không áp vào phí thiết kế, phí ship) */
  discountRate: number;
  /** Số lần in lại mẫu được miễn phí cho mỗi dòng đơn (mặc định 1) */
  freeReprints: number;
  perks: string[];
}

export const TIERS: Tier[] = [
  {
    key: 'BRONZE',
    label: 'Đồng',
    icon: '🥉',
    minSpent: 0,
    discountRate: 0,
    freeReprints: 1,
    perks: ['Tích 1 điểm cho mỗi 10.000đ', 'Ưu đãi sinh nhật'],
  },
  {
    key: 'SILVER',
    label: 'Bạc',
    icon: '🥈',
    minSpent: 2_000_000,
    discountRate: 0.03,
    freeReprints: 1,
    perks: ['Giảm 3% tiền hàng mọi đơn', 'Tích 1,2× điểm', 'Ưu đãi sinh nhật'],
  },
  {
    key: 'GOLD',
    label: 'Vàng',
    icon: '🥇',
    minSpent: 5_000_000,
    discountRate: 0.05,
    freeReprints: 2,
    perks: ['Giảm 5% tiền hàng mọi đơn', 'Miễn phí in lại mẫu lần 2', 'Tích 1,5× điểm', 'Quà sinh nhật'],
  },
];

/** Dòng giảm giá theo hạng cho Giỏ hàng / Checkout */
export interface TierDiscount {
  rate: number;
  label: string;
  /** Gợi ý khi chưa được giảm / có thể giảm nhiều hơn */
  hint: string;
}

const pct = (r: number) => Math.round(r * 100) + '%';
const vnd = (n: number) => new Intl.NumberFormat('vi-VN').format(n) + 'đ';

/** null = khách chưa đăng nhập */
export function tierDiscount(m: MembershipInfo | null): TierDiscount {
  if (!m) return { rate: 0, label: 'Ưu đãi thành viên', hint: 'Đăng nhập để nhận ưu đãi theo hạng thành viên (Bạc −3%, Vàng −5%).' };
  const { tier, next, remaining } = m;
  const nextHint = next ? `Chi tiêu thêm ${vnd(remaining)} để lên hạng ${next.label} (giảm ${pct(next.discountRate)}).` : '';
  return {
    rate: tier.discountRate,
    label: tier.discountRate ? `Ưu đãi hạng ${tier.label} (−${pct(tier.discountRate)})` : `Ưu đãi hạng ${tier.label}`,
    hint: nextHint,
  };
}

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
