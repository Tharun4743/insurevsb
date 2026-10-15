import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { getMe, logout as apiLogout } from '../api/client';

export type UserRole = 'customer' | 'admin' | 'compliance_officer';

export interface User {
  id: string;
  email: string;
  fullName?: string;
  role: UserRole;
  status?: string;
  isEmailVerified: boolean;
  telematicsConsent?: boolean;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  role: UserRole;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (token: string, user: User) => void;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('insure_auth_token'));
  const [user, setUser] = useState<User | null>(() => {
    const cached = localStorage.getItem('insure_user');
    return cached ? JSON.parse(cached) : null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);

  const refreshUser = useCallback(async () => {
    const savedToken = localStorage.getItem('insure_auth_token');
    if (!savedToken) {
      setUser(null);
      setIsLoading(false);
      return;
    }

    try {
      const res = await getMe();
      if (res?.user) {
        setUser(res.user);
        localStorage.setItem('insure_user', JSON.stringify(res.user));
      }
    } catch (err) {
      console.warn('Session check failed or expired:', err);
      // If token expired, clear
      localStorage.removeItem('insure_auth_token');
      localStorage.removeItem('insure_user');
      setToken(null);
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
  }, [refreshUser]);

  const login = (newToken: string, newUser: User) => {
    localStorage.setItem('insure_auth_token', newToken);
    localStorage.setItem('insure_user', JSON.stringify(newUser));
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    apiLogout().catch(() => {});
    localStorage.removeItem('insure_auth_token');
    localStorage.removeItem('insure_user');
    setToken(null);
    setUser(null);
  };

  const role: UserRole = user?.role || 'customer';
  const isAuthenticated = Boolean(token && user);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        role,
        isAuthenticated,
        isLoading,
        login,
        logout,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
