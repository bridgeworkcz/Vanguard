import {
  User,
  Dossier,
  DossierDocument,
  PaymentTransaction,
  Vacancy,
  TeamMember,
  ProcessStatus,
  DossierPaymentStatus,
  DocumentCategory,
  DocumentStatus,
  PaymentReviewStatus
} from '../types';

const TOKEN_KEY = 'vanguard_auth_token';

export const getStoredToken = (): string | null => {
  return localStorage.getItem(TOKEN_KEY);
};

export const setStoredToken = (token: string): void => {
  localStorage.setItem(TOKEN_KEY, token);
};

export const removeStoredToken = (): void => {
  localStorage.removeItem(TOKEN_KEY);
};

async function apiFetch<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `HTTP Error ${response.status}`);
  }

  return data as T;
}

// --- 1. Auth API ---
export const authApi = {
  login: async (email: string, password: string): Promise<{ token: string; user: User }> => {
    const data = await apiFetch<{ token: string; user: User }>('/api/auth?action=login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(data.token);
    return data;
  },

  register: async (payload: {
    email: string;
    password: string;
    fullName: string;
    phone: string;
  }): Promise<{ token: string; user: User }> => {
    const data = await apiFetch<{ token: string; user: User }>('/api/auth?action=register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setStoredToken(data.token);
    return data;
  },

  me: async (): Promise<{ user: User }> => {
    return apiFetch<{ user: User }>('/api/auth?action=me', {
      method: 'GET',
    });
  },

  logout: (): void => {
    removeStoredToken();
  },
};

// --- 2. Dossiers API ---
export const dossiersApi = {
  list: async (id?: string): Promise<{ dossiers?: Dossier[]; dossier?: Dossier }> => {
    const query = id ? `?id=${encodeURIComponent(id)}` : '';
    return apiFetch(`/api/dossiers${query}`, { method: 'GET' });
  },

  create: async (payload: {
    fullName: string;
    passportNumber: string;
    citizenship: string;
    targetCountry: string;
    vacancyId?: string;
    vacancyTitle?: string;
    totalCost?: number;
    currency?: string;
  }): Promise<{ dossier: Dossier }> => {
    return apiFetch<{ dossier: Dossier }>('/api/dossiers?action=create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  updateStatus: async (payload: {
    dossierId: string;
    processStatus?: ProcessStatus;
    paymentStatus?: DossierPaymentStatus;
    assignedManagerId?: string;
  }): Promise<{ dossier: Dossier }> => {
    return apiFetch<{ dossier: Dossier }>('/api/dossiers?action=updateStatus', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

// --- 3. Documents API ---
export const documentsApi = {
  list: async (dossierId: string): Promise<{ documents: DossierDocument[] }> => {
    return apiFetch<{ documents: DossierDocument[] }>(
      `/api/documents?dossierId=${encodeURIComponent(dossierId)}`,
      { method: 'GET' }
    );
  },

  upload: async (payload: {
    dossierId: string;
    category: DocumentCategory;
    fileName: string;
    mimeType: string;
    fileBase64: string;
  }): Promise<{ document: DossierDocument }> => {
    return apiFetch<{ document: DossierDocument }>('/api/documents?action=upload', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  review: async (payload: {
    documentId: string;
    status: DocumentStatus;
    rejectionReason?: string;
  }): Promise<{ document: DossierDocument }> => {
    return apiFetch<{ document: DossierDocument }>('/api/documents?action=review', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

// --- 4. Payments API ---
export const paymentsApi = {
  list: async (dossierId: string): Promise<{ payments: PaymentTransaction[] }> => {
    return apiFetch<{ payments: PaymentTransaction[] }>(
      `/api/payments?dossierId=${encodeURIComponent(dossierId)}`,
      { method: 'GET' }
    );
  },

  submit: async (payload: {
    dossierId: string;
    amount: number;
    currency?: string;
    network?: string;
    txHash: string;
    tranchePercent: 20 | 30 | 50;
  }): Promise<{ payment: PaymentTransaction }> => {
    return apiFetch<{ payment: PaymentTransaction }>('/api/payments?action=submit', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  verify: async (payload: {
    paymentId: string;
    status: PaymentReviewStatus;
  }): Promise<{ payment: PaymentTransaction }> => {
    return apiFetch<{ payment: PaymentTransaction }>('/api/payments?action=verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

// --- 5. Vacancies API ---
export const vacanciesApi = {
  list: async (id?: string): Promise<{ vacancies?: Vacancy[]; vacancy?: Vacancy }> => {
    const query = id ? `?id=${encodeURIComponent(id)}` : '';
    return apiFetch(`/api/vacancies${query}`, { method: 'GET' });
  },

  create: async (payload: Partial<Vacancy>): Promise<{ vacancy: Vacancy }> => {
    return apiFetch<{ vacancy: Vacancy }>('/api/vacancies?action=create', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },
};

// --- 6. Team API ---
export const teamApi = {
  list: async (): Promise<{ team: TeamMember[] }> => {
    return apiFetch<{ team: TeamMember[] }>('/api/team', { method: 'GET' });
  },
};
