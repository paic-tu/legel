import type { SupabaseClient } from '@supabase/supabase-js';
import type { Employee, Matter, MatterDraft, Settings, Snapshot, Stage } from './domain';
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
  async bindAccount(_actorId: string, employeeId: string, email: string) { await this.execute('bindAccount', { employeeId, email }); }
  async removeEmployee(_actorId: string, id: string) { await this.execute('removeEmployee', { id }); }
  async settings(_actorId: string, settings: Settings) { await this.execute('settings', settings); }
  async preferences(dark: boolean) { await this.execute('preferences', { dark }); }
  import(_actorId: string, matters: Matter[]) { return this.execute<number>('import', { matters }); }
}
