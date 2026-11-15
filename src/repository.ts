import { configurationError, supabase } from './supabase';
import { SupabaseRepository } from './supabaseRepository';
import type { Employee, Matter, MatterDraft, Settings, Snapshot, Stage } from './domain';

export interface LegalRepository {
  load(): Promise<Snapshot>;
  register(actorId: string, draft: MatterDraft): Promise<Matter>;
  update(actorId: string, id: string, changes: Partial<Pick<Matter, 'liaisonId' | 'assigneeId' | 'due' | 'amount'>>): Promise<void>;
  transition(actorId: string, id: string, stage: Stage): Promise<void>;
  note(actorId: string, id: string, text: string): Promise<void>;
  addEmployee(actorId: string, name: string, role: Employee['role'], email?: string): Promise<void>;
  bindAccount(actorId: string, employeeId: string, email: string): Promise<void>;
  removeEmployee(actorId: string, id: string): Promise<void>;
  settings(actorId: string, settings: Settings): Promise<void>;
  preferences(dark: boolean): Promise<void>;
  import(actorId: string, matters: Matter[]): Promise<number>;
}

// Fail closed when configuration is absent. No local office data is available.
export const repository: LegalRepository = new SupabaseRepository(supabase);
export function requireCloudConfiguration() {
  if (configurationError) throw new Error(configurationError);
}
