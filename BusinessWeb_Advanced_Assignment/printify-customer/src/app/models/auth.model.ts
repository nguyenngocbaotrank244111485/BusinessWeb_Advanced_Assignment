export interface CustomerUser {
  _id: string;
  name: string;
  email: string;
  role: 'CUSTOMER';
  status: 'ACTIVE';
  avatar: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface OtpRequestResult {
  message: string;
  demoOtp?: string; // Local development only. Never expose on production.
}

export interface AuthResult {
  user: CustomerUser;
}