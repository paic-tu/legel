import type { SupabaseClient } from '@supabase/supabase-js';
import type { Employee, EmployeeInput, Matter, MatterDraft, Settings, Snapshot, Stage } from './domain';
import { loadCatalogs, today } from './domain';
import type { LegalRepository } from './repository';
import { cloudError } from './supabase';

export class SupabaseRepository implements LegalRepository {
  constructor(private client: SupabaseClient | null) {}
  private async execute<T>(operation: string, payload: unknown = {}): Promise<T> {
    if (!this.client) throw new Error('إعدادات الاتصال بقاعدة البيانات غير مكتملة.');
    const { data, error } = await this.client.rpc('legal_execute', { operation, payload });
    if (error) throw cloudError(error);
    return data as T;
  }
  async load(): Promise<Snapshot> {
    if (!this.client) throw new Error('إعدادات الاتصال بقاعدة البيانات غير مكتملة.');
    const { data, error } = await this.client.rpc('legal_load');
    if (error) throw cloudError(error);
    if (!data || !Array.isArray(data.matters) || !Array.isArray(data.employees) || !data.settings) throw new Error('استجابة قاعدة البيانات غير مكتملة.');
    if (data.settings.demo !== false || typeof data.preferences?.dark !== 'boolean') throw new Error('قاعدة البيانات تحتاج ترحيل إعدادات التشغيل الفعلي.');
    today(data.settings);
    loadCatalogs(data.catalogs);
    return data as Snapshot;
  }
  // The database resolves the actor from auth.uid(), never from caller-controlled IDs.
  register(_actorId: string, draft: MatterDraft) { return this.execute<Matter>('register', draft); }
  async update(_actorId: string, id: string, changes: Partial<Pick<Matter, 'liaisonId' | 'assigneeId' | 'due' | 'amount'>>) { await this.execute('update', { id, changes }); }
  async transition(_actorId: string, id: string, stage: Stage) { await this.execute('transition', { id, stage }); }
  async note(_actorId: string, id: string, text: string) { await this.execute('note', { id, text }); }
  async addEmployee(_actorId: string, name: string, role: Employee['role'], email?: string) { await this.execute('addEmployee', { name, role, email: email || null }); }
  private async managementSession(refresh = false, expectedUserId?: string) {
    if (!this.client) throw new Error('إعدادات الاتصال بقاعدة البيانات غير مكتملة.');
    const { data, error } = await this.client.auth.getSession();
    if (error) throw new Error('تعذر التحقق من جلسة الدخول؛ تحقق من الاتصال وأعد المحاولة.');
    let session = data.session;
    if (!session) throw new Error('انتهت جلسة الدخول؛ سجّل الدخول مجدداً.');
    const userId = expectedUserId || session.user.id;
    if (session.user.id !== userId) throw new Error('تغير حساب الدخول أثناء الحفظ؛ أعد تحميل البيانات.');
    if (refresh || !session.expires_at || session.expires_at <= Math.floor(Date.now() / 1000) + 60) {
      const renewed = await this.client.auth.refreshSession();
      if (renewed.error) {
        const status = renewed.error.status;
        throw new Error(renewed.error.name === 'AuthRetryableFetchError' || status === 0 || status === 429 || (status && status >= 500)
          ? 'تعذر تجديد الجلسة حالياً؛ تحقق من الاتصال وأعد المحاولة.'
          : 'تعذر تجديد جلسة الدخول؛ سجّل الدخول مجدداً.');
      }
      session = renewed.data.session;
      if (!session) throw new Error('انتهت جلسة الدخول؛ سجّل الدخول مجدداً.');
      if (session.user.id !== userId) throw new Error('تغير حساب الدخول أثناء الحفظ؛ أعد تحميل البيانات.');
    }
    return session;
  }
  async saveEmployee(_actorId: string, employee: EmployeeInput) {
    if (!this.client) throw new Error('إعدادات الاتصال بقاعدة البيانات غير مكتملة.');
    let session = await this.managementSession();
    const invoke = () => this.client!.functions.invoke('legal-manage-employee', {
      body: employee,
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    let result = await invoke();
    // Authentication is rejected before any account mutation, so one renewed retry is safe.
    if (result.error?.context instanceof Response && result.error.context.status === 401) {
      session = await this.managementSession(true, session.user.id);
      result = await invoke();
    }
    const { data, error } = result;
    if (error) {
      const response = error.context;
      if (response instanceof Response) {
        const body = await response.json().catch(() => null);
        if (typeof body?.error === 'string') throw new Error(body.error);
      }
      throw new Error('تعذر الاتصال بإدارة الحسابات؛ أعد المحاولة.');
    }
    if (data?.success !== true) throw new Error('لم يتم تأكيد حفظ الحساب؛ أعد تحميل بيانات المنسوب.');
  }
  async bindAccount(_actorId: string, employeeId: string, email: string) { await this.execute('bindAccount', { employeeId, email }); }
  async removeEmployee(_actorId: string, id: string) { await this.execute('removeEmployee', { id }); }
  async settings(_actorId: string, settings: Settings) { await this.execute('settings', settings); }
  async preferences(dark: boolean) { await this.execute('preferences', { dark }); }
  import(_actorId: string, matters: Matter[]) { return this.execute<number>('import', { matters }); }
}
