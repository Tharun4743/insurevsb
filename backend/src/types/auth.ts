export type UserRole = 'customer' | 'admin' | 'compliance_officer';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  is_verified: boolean;
  password_hash?: string;
  verification_token?: string | null;
  reset_token?: string | null;
  reset_token_expiry?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AuthPayload {
  userId: string;
  id?: string;
  email: string;
  role: UserRole;
  name?: string;
}

export interface AuthResponse {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    is_verified: boolean;
  };
}
