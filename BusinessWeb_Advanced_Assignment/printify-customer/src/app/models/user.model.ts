/** Người dùng phía khách (users-public.json – đã bỏ mật khẩu, OTP...) */
export interface PublicUser {
  _id: string;
  name: string;
  email: string;
  role: 'CUSTOMER' | string;
  status?: 'ACTIVE' | 'PENDING_OTP' | 'LOCKED' | string;
  avatar?: string | null;
  /** Sổ địa chỉ (điền nhanh ở Checkout) */
  addresses?: SavedAddress[];
}

export interface SavedAddress {
  _id: string;
  name: string;
  phone: string;
  province: string;
  ward: string;
  detail: string;
  isDefault?: boolean;
}
