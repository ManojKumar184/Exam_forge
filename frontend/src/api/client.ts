import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { apiConfig } from '../config/api';

const ACCESS_KEY = 'examforge_access_token';
const REFRESH_KEY = 'examforge_refresh_token';
let csrfToken: string | null = null;
const INSTITUTION_KEY = 'examforge_active_institution';

if (typeof window !== 'undefined') {
  // Remove legacy bearer tokens from earlier releases now that auth uses cookies.
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export function getActiveInstitutionId(): string | null {
  return localStorage.getItem(INSTITUTION_KEY);
}

export function setActiveInstitutionId(id: string) {
  localStorage.setItem(INSTITUTION_KEY, id);
}

export function getAccessToken(): string | null {
  return null;
}

export function getRefreshToken(): string | null {
  return null;
}

export function setTokens(accessToken: string, refreshToken: string) {
  void accessToken;
  void refreshToken;
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  csrfToken = null;
}

export const apiClient = axios.create({
  baseURL: apiConfig.isConfigured ? `${apiConfig.baseUrl}/api` : '',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const institutionId = getActiveInstitutionId();
  if (institutionId) config.headers.set('X-Institution-Id', institutionId);
  if (csrfToken && !['get', 'head', 'options'].includes((config.method || 'get').toLowerCase())) {
    config.headers.set('X-CSRF-Token', csrfToken);
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (!apiConfig.isConfigured) return null;

  try {
    const response = await axios.post(
      `${apiConfig.baseUrl}/api/auth/refresh`,
      {},
      { withCredentials: true }
    );
    csrfToken = response.headers?.['x-csrf-token'] || null;
    return 'cookie-session';
  } catch {
    clearTokens();
    return null;
  }
}

apiClient.interceptors.response.use((response) => {
  const token = response.headers?.['x-csrf-token'];
  if (typeof token === 'string') csrfToken = token;
  return response;
});

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const requestUrl = String(original?.url || '');
    if (error.response?.status === 401 && original && !original._retry && !requestUrl.includes('/auth/')) {
      original._retry = true;
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const newToken = await refreshPromise;
      if (newToken) {
        return apiClient(original);
      }
    }
    return Promise.reject(error);
  }
);

export function getApiErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    const msg = error.response?.data?.error?.message;
    if (typeof msg === 'string') return msg;
    return error.message;
  }
  if (error instanceof Error) return error.message;
  return 'An unexpected error occurred';
}
