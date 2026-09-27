import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { authApi } from '../services/api';

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (email: string, pass: string) => Promise<void>;
  register: (data: { email: string; password: string; fullName: string; phone: string }) => Promise<void>;
  logout: () => void;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Повністю сумісний з Safari (iOS WebKit) декодер JWT Base64Url
function parseJwt(token: string): any {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    // Перетворення URL-safe Base64 у канонічний Base64
    let base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    
    // Додавання необхідного вирівнювання '=' для Safari
    while (base64.length % 4 !== 0) {
      base64 += '=';
    }
    
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    
    const jsonPayload = new TextDecoder().decode(bytes);
    return JSON.parse(jsonPayload);
  } catch (e) {
    console.error('JWT Parse Error (WebKit Safe):', e);
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const savedToken = localStorage.getItem('vanguard_token');
    if (savedToken) {
      const payload = parseJwt(savedToken);
      if (payload && payload.exp && payload.exp * 1000 > Date.now()) {
        setToken(savedToken);
        setUser(payload.user || null);
      } else {
        localStorage.removeItem('vanguard_token');
      }
    }
    setLoading(false);
  }, []);

  const login = async (email: string, pass: string) => {
    const res = await authApi.login(email, pass);
    if (res.token) {
      localStorage.setItem('vanguard_token', res.token);
      setToken(res.token);
      const payload = parseJwt(res.token);
      setUser(payload?.user || res.user || null);
    }
  };

  const register = async (data: { email: string; password: string; fullName: string; phone: string }) => {
    const res = await authApi.register(data);
    if (res.token) {
      localStorage.setItem('vanguard_token', res.token);
      setToken(res.token);
      const payload = parseJwt(res.token);
      setUser(payload?.user || res.user || null);
    }
  };

  const logout = () => {
    localStorage.removeItem('vanguard_token');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, token, login, register, logout, loading }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
