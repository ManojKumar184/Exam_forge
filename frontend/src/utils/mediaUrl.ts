import { apiConfig } from '../config/api';

/** Resolve /uploads/... paths to the API origin for <img src>. */
export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) {
    return url;
  }
  const base = apiConfig.baseUrl || '';
  return `${base}${url.startsWith('/') ? url : `/${url}`}`;
}
