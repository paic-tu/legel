import { create } from 'zustand';
import { repository } from './repository';
import type { Matter, Snapshot } from './domain';
import type { Session } from '@supabase/supabase-js';
import { configurationError, invitationLanding, supabase } from './supabase';

export type Page = 'dashboard' | 'registry' | 'register' | 'reports' | 'settings';
export interface Filters { query: string; type: string; assignee: string; status: string; priority: string; stage: string }
export const emptyFilters: Filters = { query: '', type: '', assignee: '', status: '', priority: '', stage: '' };
interface AppState {
  data: Snapshot | null;
  error: string;
  userId: string;
  authStatus: 'checking' | 'signedOut' | 'ready';
  sessionUserId: string | null;
  sessionEmail: string;
  passwordRecovery: boolean;
  page: Page;
  filters: Filters;
  selectedId: string | null;
  dark: boolean;
  toast: { message: string; error: boolean } | null;
  setPage: (page: Page) => void;
  setFilters: (filters: Partial<Filters>) => void;
  open: (matter: Matter) => void;
  close: () => void;
  filterRegistry: (filters: Partial<Filters>) => void;
  toggleDark: () => void;
  notify: (message: string, error?: boolean) => void;
  run: <T>(task: () => Promise<T>, message?: string) => Promise<T | undefined>;
}
let toastTimer: ReturnType<typeof setTimeout>;
export const useApp = create<AppState>((set, get) => ({
  data: null, error: '', userId: '', page: 'dashboard', filters: emptyFilters, selectedId: null,
  authStatus: 'checking', sessionUserId: null, sessionEmail: '', passwordRecovery: false,
  dark: false, toast: null,
  setPage: page => set({ page, selectedId: null }),
  setFilters: filters => set({ filters: { ...get().filters, ...filters } }),
  open: matter => set({ selectedId: matter.id }),
  close: () => set({ selectedId: null }),
  filterRegistry: filters => set({ page: 'registry', filters: { ...emptyFilters, ...filters } }),
  toggleDark: () => {
    if (get().authStatus !== 'ready' || !get().data) return;
    void get().run(() => repository.preferences(!get().dark));
  },
  notify: (message, error = false) => { clearTimeout(toastTimer); set({ toast: { message, error } }); toastTimer = setTimeout(() => set({ toast: null }), 5000); },
  run: async (task, message) => {
    const actor = get().userId;
    const sessionId = get().sessionUserId;
    try { const result = await task(); const data = await repository.load(); if (get().userId !== actor || get().sessionUserId !== sessionId) return undefined; set({ data, dark: data.preferences!.dark }); if (message) get().notify(message); return result; }
    catch (error) { get().notify(error instanceof Error ? error.message : 'تعذر إتمام العملية، يرجى إعادة المحاولة', true); return undefined; }
  },
}));
let requestVersion = 0;
let currentSession: Session | null = null;
async function loadCloud(session: Session) {
  const version = ++requestVersion;
  try {
    const data = await repository.load();
    if (version !== requestVersion || currentSession?.user.id !== session.user.id) return;
    const employee = data.employees.find(e => e.authUserId === session.user.id && !e.archived);
    if (!employee) throw new Error('الحساب غير مرتبط بمنسوب نشط. اطلب من المدير ربط حسابك من الإعدادات.');
    useApp.setState({ data, dark: data.preferences!.dark, userId: employee.id, error: '', authStatus: 'ready' });
  } catch (error) {
    if (version !== requestVersion || currentSession?.user.id !== session.user.id) return;
    useApp.setState({ data: null, error: error instanceof Error ? error.message : 'تعذر تحميل بيانات الحساب', authStatus: 'ready' });
  }
}
function acceptSession(session: Session | null) {
  const changed = currentSession?.user.id !== session?.user.id;
  currentSession = session;
  if (!session) {
    requestVersion++;
    useApp.setState({ data: null, dark: false, userId: '', sessionUserId: null, sessionEmail: '', authStatus: 'signedOut', passwordRecovery: false, error: '', page: 'dashboard', selectedId: null, filters: emptyFilters, toast: null });
    return;
  }
  useApp.setState({ sessionUserId: session.user.id, sessionEmail: session.user.email || '', ...(changed ? { data: null, userId: '', error: '', authStatus: 'checking' as const, selectedId: null, page: 'dashboard' as const, filters: emptyFilters } : {}) });
  // Auth callbacks must finish before making authenticated API calls.
  setTimeout(() => { if (currentSession?.user.id === session.user.id) void loadCloud(session); }, 0);
}
export async function initialize() {
  if (!supabase || configurationError) {
    useApp.setState({ error: configurationError, authStatus: 'signedOut' });
    return;
  }
  let invitePending = invitationLanding;
  const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
    if (session && (event === 'PASSWORD_RECOVERY' || (invitePending && event === 'SIGNED_IN'))) {
      invitePending = false;
      useApp.setState({ passwordRecovery: true });
    }
    acceptSession(session);
  });
  const { data, error } = await supabase.auth.getSession();
  if (error) {
    listener.subscription.unsubscribe();
    useApp.setState({ error: 'تعذر استعادة جلسة الدخول. أعد تحميل الصفحة.', authStatus: 'signedOut' });
    return;
  }
  acceptSession(data.session);
  const timer = setInterval(() => { if (currentSession) void loadCloud(currentSession); }, 30000);
  import.meta.hot?.dispose(() => { listener.subscription.unsubscribe(); clearInterval(timer); requestVersion++; });
}
