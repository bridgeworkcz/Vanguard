import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { authApi } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (identifier: string, pass: string) => Promise<void>;
  register: (data: { email: string; password: string; fullName: string; phone: string }) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const restore = async () => {
      const savedToken = localStorage.getItem('vanguard_token');
      if (!savedToken) { setLoading(false); return; }
      try {
        const res = await authApi.me(savedToken);
        setToken(savedToken);
        setUser(res.user);
      } catch {
        localStorage.removeItem('vanguard_token');
        setToken(null);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };
    void restore();
  }, []);

  const applyAuth = (res: { token: string; user: User }) => {
    const cleanToken = String(res.token).trim();
    localStorage.setItem('vanguard_token', cleanToken);
    setToken(cleanToken);
    setUser(res.user);
  };

  const login = async (identifier: string, pass: string) => applyAuth(await authApi.login(identifier, pass));
  const register = async (data: { email: string; password: string; fullName: string; phone: string }) => applyAuth(await authApi.register(data));

  const logout = () => {
    localStorage.removeItem('vanguard_token');
    setToken(null);
    setUser(null);
  };

  return <AuthContext.Provider value={{ user, token, login, register, logout, loading }}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
