import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios';
import { apiConfig } from '../config/api';

const ACCESS_KEY = 'examforge_access_token';
const REFRESH_KEY = 'examforge_refresh_token';

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY);
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
}

export const apiClient = axios.create({
  baseURL: apiConfig.isConfigured ? `${apiConfig.baseUrl}/api` : '',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
  withCredentials: true,
});

apiClient.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = getRefreshToken();
  if (!refreshToken || !apiConfig.isConfigured) return null;

  try {
    const { data } = await axios.post(
      `${apiConfig.baseUrl}/api/auth/refresh`,
      { refreshToken },
      { withCredentials: true }
    );
    const { accessToken, refreshToken: newRefresh } = data.data;
    setTokens(accessToken, newRefresh);
    return accessToken;
  } catch {
    clearTokens();
    return null;
  }
}

apiClient.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true;
      if (!refreshPromise) {
        refreshPromise = refreshAccessToken().finally(() => {
          refreshPromise = null;
        });
      }
      const newToken = await refreshPromise;
      if (newToken) {
        original.headers.Authorization = `Bearer ${newToken}`;
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
