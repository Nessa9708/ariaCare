import { createClient } from '@supabase/supabase-js';

const rawUrl = import.meta.env.VITE_SUPABASE_URL || '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Supabase's Data API screen shows /rest/v1/, but supabase-js needs the base URL only.
// This strips it automatically so the app still works if the REST endpoint is pasted.
const normalizedUrl = rawUrl
  .trim()
  .replace(/\/rest\/v1\/?$/i, '')
  .replace(/\/$/, '');

export const FAMILY_ID = (import.meta.env.VITE_ARIA_FAMILY_ID || 'aria-family').trim();

export const supabaseConfigured = Boolean(
  normalizedUrl &&
  anonKey &&
  normalizedUrl.startsWith('https://') &&
  normalizedUrl.includes('.supabase.co') &&
  !normalizedUrl.includes('your_supabase') &&
  !anonKey.includes('your_supabase')
);

export const supabase = supabaseConfigured ? createClient(normalizedUrl, anonKey.trim()) : null;

export function usernameToEmail(username) {
  return `${username.trim().toLowerCase()}@ariacare.local`;
}
