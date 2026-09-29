import { Dossier, DossierDocument, PaymentTransaction, Vacancy, TeamMember, User } from '../types';

async function apiFetch(endpoint: string, options: RequestInit = {}) {
  let token = localStorage.getItem('vanguard_token');
  
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token && typeof token === 'string') {
    const cleanToken = token.replace(/["'\r\n\s]/g, '').trim();
    if (cleanToken && cleanToken.length > 10) {
      headers['Authorization'] = `Bearer ${cleanToken}`;
    } else {
      localStorage.removeItem('vanguard_token');
    }
  }

  try {
    const res = await fetch(`/api${endpoint}`, {
      ...options,
      headers,
    });

    const text = await res.text();
    let data: any = {};
    try {
      data = JSON.parse(text);
    } catch {
      data = { error: text || `HTTP Status ${res.status}` };
    }

    if (!res.ok) {
      throw new Error(data.error || data.message || `Server Error (${res.status})`);
    }

    return data;
  } catch (err: any) {
    throw err;
  }
}

export const authApi = {
  login: (identifier: string, password: string) =>
    apiFetch('/auth', {
      method: 'POST',
      body: JSON.stringify({ action: 'login', email: identifier, phone: identifier, password }),
    }) as Promise<{ token: string; user: User }>,

  register: (data: { email: string; password: string; fullName: string; phone: string }) =>
    apiFetch('/auth', {
      method: 'POST',
      body: JSON.stringify({ action: 'register', ...data }),
    }) as Promise<{ token: string; user: User }>,

  me: (token?: string) => apiFetch('/auth', { method: 'GET', headers: token ? { Authorization: `Bearer ${token}` } : {} }) as Promise<{ user: User }>,
};

export const dossiersApi = {
  list: () => apiFetch('/dossiers', { method: 'GET' }) as Promise<{ dossiers: Dossier[] }>,
  
  create: (data: {
    fullName: string;
    passportNumber: string;
    citizenship: string;
    targetCountry: string;
    totalCost: number;
    currency?: string;
    vacancyId?: string;
  }) =>
    apiFetch('/dossiers', {
      method: 'POST',
      body: JSON.stringify(data),
    }) as Promise<{ dossier: Dossier }>,

  updateStatus: (data: { dossierId: string; processStatus?: string; paymentStatus?: string }) =>
    apiFetch('/dossiers', {
      method: 'PATCH',
      body: JSON.stringify(data),
    }) as Promise<{ dossier: Dossier }>,
};

export const documentsApi = {
  list: (dossierId: string) =>
    apiFetch(`/documents?dossierId=${encodeURIComponent(dossierId)}`, {
      method: 'GET',
    }) as Promise<{ documents: DossierDocument[] }>,

  upload: (data: {
    dossierId: string;
    category: string;
    fileName: string;
    mimeType: string;
    fileBase64: string;
  }) =>
    apiFetch('/documents', {
      method: 'POST',
      body: JSON.stringify(data),
    }) as Promise<{ document: DossierDocument }>,
};

export const paymentsApi = {
  list: (dossierId: string) =>
    apiFetch(`/payments?dossierId=${encodeURIComponent(dossierId)}`, {
      method: 'GET',
    }) as Promise<{ payments: PaymentTransaction[] }>,

  submit: (data: {
    dossierId: string;
    amount: number;
    currency: string;
    network: string;
    txHash: string;
    tranchePercent: number;
  }) =>
    apiFetch('/payments', {
      method: 'POST',
      body: JSON.stringify(data),
    }) as Promise<{ payment: PaymentTransaction }>,
};

export const vacanciesApi = {
  list: () => apiFetch('/vacancies', { method: 'GET' }) as Promise<{ vacancies: Vacancy[] }>,
};

export const teamApi = {
  list: () => apiFetch('/team', { method: 'GET' }) as Promise<{ team: TeamMember[] }>,
};
