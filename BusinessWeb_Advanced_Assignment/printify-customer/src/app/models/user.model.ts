/** Người dùng phía khách (users-public.json – đã bỏ mật khẩu, OTP...) */
export interface PublicUser {
  _id: string;
  name: string;
  email: string;
  role: 'CUSTOMER' | string;
  status?: 'ACTIVE' | 'PENDING_OTP' | 'LOCKED' | string;
  avatar?: string | null;
}
