const API_URL = import.meta.env.VITE_API_URL?.trim() || '';

export const apiConfig = {
  baseUrl: API_URL.replace(/\/$/, ''),
  isConfigured: API_URL.length > 0,
};

export const API_SETUP_MESSAGE =
  'Backend API is not configured. Set VITE_API_URL in your .env file and restart the dev server.';
