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

// Чисто-JS декодер JWT Base64Url без використання нестійкого atob()
function parseJwtSafariSafe(token: string): any {
  if (!token || typeof token !== 'string') return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    
    const base64Url = parts[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=';
    let output = '';
    let buffer = 0;
    let bits = 0;

    const cleanStr = base64.replace(/[^A-Za-z0-9+/]/g, '');

    for (let i = 0; i < cleanStr.length; i++) {
      buffer = (buffer << 6) | chars.indexOf(cleanStr[i]);
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        output += String.fromCharCode((buffer >> bits) & 0xff);
      }
    }

    const bytes = new Uint8Array(output.length);
    for (let i = 0; i < output.length; i++) {
      bytes[i] = output.charCodeAt(i);
    }
    const decodedText = new TextDecoder().decode(bytes);
    return JSON.parse(decodedText);
  } catch (e) {
    return null;
  }
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const savedToken = localStorage.getItem('vanguard_token');
      if (savedToken) {
        const payload = parseJwtSafariSafe(savedToken);
        if (payload && payload.exp && payload.exp * 1000 > Date.now()) {
          setToken(savedToken);
          setUser(payload.user || null);
        } else {
          localStorage.removeItem('vanguard_token');
        }
      }
    } catch (e) {
      localStorage.removeItem('vanguard_token');
    }
    setLoading(false);
  }, []);

  const login = async (email: string, pass: string) => {
    const res = await authApi.login(email, pass);
    if (res.token) {
      const cleanToken = String(res.token).replace(/["'\r\n\s]/g, '').trim();
      localStorage.setItem('vanguard_token', cleanToken);
      setToken(cleanToken);
      const payload = parseJwtSafariSafe(cleanToken);
      setUser(payload?.user || res.user || null);
    }
  };

  const register = async (data: { email: string; password: string; fullName: string; phone: string }) => {
    const res = await authApi.register(data);
    if (res.token) {
      const cleanToken = String(res.token).replace(/["'\r\n\s]/g, '').trim();
      localStorage.setItem('vanguard_token', cleanToken);
      setToken(cleanToken);
      const payload = parseJwtSafariSafe(cleanToken);
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
