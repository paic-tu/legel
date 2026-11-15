import { createClient } from '@supabase/supabase-js';

export const cloudMode = true;
const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
export const invitationLanding = typeof window !== 'undefined' &&
  new URLSearchParams(window.location.hash.slice(1)).get('type') === 'invite';
export const configurationError = !url || !key
  ? 'تعذر الاتصال بالنظام. تواصل مع مسؤول النظام.'
  : '';
export const supabase = !configurationError
  ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } })
  : null;

export function cloudError(error: { code?: string; message?: string; status?: number } | null): Error {
  if (error?.code === 'PGRST202' || error?.code === '42P01') return new Error('النظام غير متاح حالياً. تواصل مع مسؤول النظام.');
  if (error?.code === '42501') return new Error('الحساب غير مرتبط بمنسوب نشط أو لا يملك صلاحية هذه العملية.');
  if (error?.message && /[\u0600-\u06ff]/.test(error.message)) return new Error(error.message);
  if (error?.code === '23505') return new Error('الاسم أو الحساب أو رقم المعاملة موجود بالفعل.');
  if (error?.code === '23503') return new Error('الموظف أو الحساب المحدد غير موجود أو مرتبط بسجل آخر.');
  return new Error('تعذر إتمام الطلب. تحقق من الاتصال ثم أعد المحاولة.');
}
