import { addDays, differenceInCalendarDays, format, parseISO, startOfMonth, endOfMonth, subMonths, startOfWeek, endOfWeek, subWeeks } from 'date-fns';
import { arSA } from 'date-fns/locale';

export const TYPE_CODES = ['CAS', 'EXE', 'CON', 'OPN', 'LTR', 'STD', 'INV', 'TSK'] as const;
export type TypeCode = typeof TYPE_CODES[number];
export const TYPES: { code: TypeCode; name: string; days: number }[] = [];
export const STAGES = ['مستلمة', 'لدى ضابط الاتصال', 'قيد التنفيذ', 'قيد المراجعة', 'مغلقة'] as const;
export type Stage = typeof STAGES[number];
export const ROLE_CODES = ['مدير الإدارة القانونية', 'ضابط الاتصال', 'مستشار قانوني', 'محامٍ', 'باحث قانوني', 'متدرب'] as const;
export type Role = typeof ROLE_CODES[number];
export const ROLES: Role[] = [];
export interface Employee { id: string; name: string; role: Role; archived?: boolean; authUserId?: string | null; email?: string | null }
export interface EmployeeInput { id?: string; name: string; role: Role; email?: string; password?: string }
export interface Audit { id: string; at: string; actor: string; action: string; old?: string; next?: string }
export interface Matter {
  id: string; type: TypeCode; subject: string; source: string; party: string;
  liaisonId: string; assigneeId: string; important: boolean; urgent: boolean;
  received: string; due: string; stage: Stage; closed?: string; amount: number;
  delivery: string; description: string; standardDays: number; audit: Audit[];
}
export type MatterDraft = Omit<Matter, 'id' | 'audit' | 'closed'>;
export interface Settings { demo: boolean; deadlines: Record<TypeCode, number>; serverToday?: string }
export interface Catalogs { types: { code: TypeCode; name: string; days: number }[]; roles: Role[]; deliveries: string[] }
export interface Snapshot { matters: Matter[]; employees: Employee[]; settings: Settings; catalogs?: Catalogs; preferences?: { dark: boolean } }
export const DELIVERIES: string[] = [];
export function loadCatalogs(catalogs: Catalogs) {
  if (!catalogs || !Array.isArray(catalogs.types) || catalogs.types.length !== TYPE_CODES.length ||
    new Set(catalogs.types.map(t => t.code)).size !== TYPE_CODES.length ||
    catalogs.types.some(t => !TYPE_CODES.includes(t.code) || !t.name?.trim() || !Number.isInteger(t.days) || t.days < 1 || t.days > 365) ||
    !Array.isArray(catalogs.roles) || catalogs.roles.length !== ROLE_CODES.length ||
    new Set(catalogs.roles).size !== ROLE_CODES.length || catalogs.roles.some(r => !ROLE_CODES.includes(r)) ||
    !Array.isArray(catalogs.deliveries) || !catalogs.deliveries.length || catalogs.deliveries.some(d => typeof d !== 'string' || !d.trim())) {
    throw new Error('بيانات القوائم المرجعية في قاعدة البيانات غير مكتملة.');
  }
  TYPES.splice(0, TYPES.length, ...catalogs.types);
  ROLES.splice(0, ROLES.length, ...catalogs.roles);
  DELIVERIES.splice(0, DELIVERIES.length, ...catalogs.deliveries);
}
export const n = (value: number) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value);
export const iso = (date: Date) => format(date, 'yyyy-MM-dd');
export const today = (settings: Settings) => {
  if (!settings.serverToday || !/^\d{4}-\d{2}-\d{2}$/.test(settings.serverToday) || !Number.isFinite(parseISO(settings.serverToday).getTime())) {
    throw new Error('التاريخ المعتمد من قاعدة البيانات غير متاح.');
  }
  return settings.serverToday;
};
export const fullDate = (date: string) => format(parseISO(date), 'EEEE، d MMMM yyyy', { locale: arSA });
export const shortDate = (date: string) => format(parseISO(date), 'd MMM yyyy', { locale: arSA });
export const typeName = (code: TypeCode) => TYPES.find(t => t.code === code)!.name;
export const isManager = (user: Employee) => user.role === 'مدير الإدارة القانونية';
export const isLiaison = (user: Employee) => user.role === 'ضابط الاتصال';
export const canSee = (user: Employee, m: Matter) => isManager(user) || (isLiaison(user) && m.liaisonId === user.id) || m.assigneeId === user.id;
export const canAssign = (user: Employee, m: Matter) => isManager(user) || (isLiaison(user) && m.liaisonId === user.id);
export const canRegister = (user: Employee) => isManager(user);
export function addWorkdays(date: string, days: number): string {
  if (!Number.isInteger(days) || days < 0 || days > 3650 || !Number.isFinite(parseISO(date).getTime())) throw new Error('تاريخ أو عدد أيام عمل غير صالح');
  let cursor = parseISO(date);
  let remaining = days;
  while (remaining > 0) {
    cursor = addDays(cursor, 1);
    if (![5, 6].includes(cursor.getDay())) remaining--;
  }
  return iso(cursor);
}
export function subtractWorkdays(date: string, days: number): string {
  if (!Number.isInteger(days) || days < 0 || days > 3650 || !Number.isFinite(parseISO(date).getTime())) throw new Error('تاريخ أو عدد أيام عمل غير صالح');
  let cursor = parseISO(date);
  while (days > 0) {
    cursor = addDays(cursor, -1);
    if (![5, 6].includes(cursor.getDay())) days--;
  }
  return iso(cursor);
}
export const deadlineDays = (standard: number, urgent: boolean) => urgent ? Math.min(standard, 2) : standard;
export const delay = (m: Matter, now: string) => Math.max(0, differenceInCalendarDays(parseISO(m.closed || now), parseISO(m.due)));
export const overdue = (m: Matter, now: string) => m.stage !== 'مغلقة' && m.due < now;
export const soon = (m: Matter, now: string) => m.stage !== 'مغلقة' && m.due >= now && differenceInCalendarDays(parseISO(m.due), parseISO(now)) <= 3;
export const onTime = (m: Matter) => m.stage === 'مغلقة' && !!m.closed && m.closed <= m.due;
export const priorityKey = (m: Pick<Matter, 'important' | 'urgent'>) => `${m.important ? 'م' : 'غ'} ${m.urgent ? 'ع' : 'غ'}`;
export const PRIORITIES = [
  { key: 'م ع', title: 'مهم وعاجل', action: 'نفّذ فوراً', tone: 'red' },
  { key: 'م غ', title: 'مهم وغير عاجل', action: 'جدول له موعداً', tone: 'green' },
  { key: 'غ ع', title: 'غير مهم وعاجل', action: 'فوّض', tone: 'amber' },
  { key: 'غ غ', title: 'غير مهم وغير عاجل', action: 'أجّل أو أرشف', tone: 'gray' },
];
export function status(m: Matter, now: string) {
  if (m.stage === 'مغلقة') return { text: onTime(m) ? 'مغلقة في المهلة' : 'مغلقة بعد المهلة', tone: onTime(m) ? 'green' : 'amber' };
  if (overdue(m, now)) return { text: `متأخرة ${delay(m, now)} يوم`, tone: 'red' };
  if (soon(m, now)) return { text: 'قريبة الاستحقاق', tone: 'amber' };
  return { text: 'في المهلة', tone: 'green' };
}
export function nextNumber(matters: Matter[], type: TypeCode, date: string) {
  const prefix = `${type}-${date.slice(2, 4)}-`;
  const max = Math.max(0, ...matters.filter(m => m.id.startsWith(prefix)).map(m => Number(m.id.slice(-4))));
  if (max >= 9999) throw new Error('اكتمل نطاق الترقيم لهذا النوع والسنة');
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}
export function validateMatter(m: MatterDraft | Matter, employees: Employee[]) {
  const errors: string[] = [];
  if (!TYPES.some(t => t.code === m.type)) errors.push('نوع المعاملة غير معروف');
  if (!m.subject.trim()) errors.push('الموضوع مطلوب');
  if (!m.source.trim()) errors.push('جهة الإحالة مطلوبة');
  if (!employees.some(e => e.id === m.assigneeId && (!e.archived || m.stage === 'مغلقة'))) errors.push('يجب تحديد مكلّف موجود');
  if (!employees.some(e => e.id === m.liaisonId && (!e.archived || m.stage === 'مغلقة') && (isLiaison(e) || isManager(e)))) errors.push('يجب تحديد ضابط اتصال مؤهل');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.due) || !Number.isFinite(parseISO(m.due).getTime())) errors.push('آخر موعد مطلوب وصالح');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(m.received) || !Number.isFinite(parseISO(m.received).getTime())) errors.push('تاريخ الاستلام غير صالح');
  if (m.due < m.received) errors.push('آخر موعد لا يسبق تاريخ الاستلام');
  if (!DELIVERIES.includes(m.delivery)) errors.push('صيغة التسليم مطلوبة ومعتمدة');
  if (!STAGES.includes(m.stage)) errors.push('مرحلة المعاملة غير معروفة');
  if (!Number.isFinite(m.amount) || m.amount < 0) errors.push('المبلغ يجب أن يكون رقماً غير سالب');
  if (!Number.isInteger(m.standardDays) || m.standardDays < 1 || m.standardDays > 365) errors.push('المهلة المعيارية يجب أن تكون بين 1 و365 يوم عمل');
  if ('id' in m && !new RegExp(`^${m.type}-${m.received.slice(2, 4)}-\\d{4}$`).test(m.id)) errors.push('رقم المعاملة لا يطابق النوع والسنة');
  if ('closed' in m && m.stage === 'مغلقة' && (!m.closed || m.closed < m.received || !Number.isFinite(parseISO(m.closed).getTime()))) errors.push('تاريخ إغلاق صالح مطلوب للمعاملة المغلقة');
  if ('closed' in m && m.stage !== 'مغلقة' && m.closed) errors.push('المعاملة المفتوحة لا تحمل تاريخ إغلاق');
  return errors;
}
export function assertTransition(user: Employee, m: Matter, next: Stage) {
  if (!canSee(user, m)) throw new Error('لا تملك صلاحية الوصول إلى هذه المعاملة');
  if (m.stage === 'مغلقة') throw new Error('المعاملة مغلقة ولا يمكن تعديلها');
  if (next === 'مغلقة') {
    if (!isManager(user) || m.stage !== 'قيد المراجعة') throw new Error('الإغلاق متاح للمدير فقط بعد رفع المعاملة للمراجعة');
    return;
  }
  if (isManager(user)) return;
  const allowed = isLiaison(user) ? ['قيد التنفيذ', 'قيد المراجعة'] : ['قيد المراجعة'];
  if (!allowed.includes(next) || (next === 'قيد المراجعة' && m.stage !== 'قيد التنفيذ') || (next === 'قيد التنفيذ' && m.stage !== 'لدى ضابط الاتصال')) throw new Error('هذا الانتقال غير مسموح لدورك أو للمرحلة الحالية');
}
export function metrics(matters: Matter[], now: string) {
  const open = matters.filter(m => m.stage !== 'مغلقة');
  const done = matters.filter(m => m.stage === 'مغلقة' && m.closed?.slice(0, 7) === now.slice(0, 7));
  const money = (type: 'EXE' | 'CAS' | 'other') => open.filter(m => type === 'other' ? !['EXE', 'CAS'].includes(m.type) : m.type === type).reduce((sum, m) => sum + m.amount, 0);
  return { open, done, late: open.filter(m => overdue(m, now)), soon: open.filter(m => soon(m, now)), adherence: done.length ? Math.round(done.filter(onTime).length / done.length * 100) : 0, executionMoney: money('EXE'), caseMoney: money('CAS'), otherMoney: money('other') };
}
export const PERIODS = ['هذا الأسبوع', 'الأسبوع الماضي', 'هذا الشهر', 'الشهر الماضي'] as const;
export function periodRange(index: number, now: string) {
  const date = parseISO(now);
  const base = index === 1 ? subWeeks(date, 1) : index === 3 ? subMonths(date, 1) : date;
  return index < 2 ? { from: iso(startOfWeek(base, { weekStartsOn: 0 })), to: iso(endOfWeek(base, { weekStartsOn: 0 })) } : { from: iso(startOfMonth(base)), to: iso(endOfMonth(base)) };
}
export function report(matters: Matter[], employees: Employee[], now: string, index: number) {
  const range = periodRange(index, now);
  const within = (date?: string) => !!date && date >= range.from && date <= range.to;
  const incoming = matters.filter(m => within(m.received));
  const done = matters.filter(m => m.stage === 'مغلقة' && within(m.closed));
  const stats = metrics(matters, now);
  const group = (subset: Matter[]) => {
    const received = subset.filter(m => within(m.received)).length;
    const completed = subset.filter(m => m.stage === 'مغلقة' && within(m.closed));
    return { received, done: completed.length, onTime: completed.filter(onTime).length, adherence: completed.length ? Math.round(completed.filter(onTime).length / completed.length * 100) : null, open: subset.filter(m => m.stage !== 'مغلقة').length, late: subset.filter(m => overdue(m, now)).length, average: completed.length ? Math.round(completed.reduce((s, m) => s + differenceInCalendarDays(parseISO(m.closed!), parseISO(m.received)), 0) / completed.length * 10) / 10 : 0 };
  };
  const types = TYPES.map(t => ({ name: t.name, ...group(matters.filter(m => m.type === t.code)) }));
  const team = employees.filter(e => !isManager(e) || matters.some(m => m.assigneeId === e.id)).map(e => ({ name: e.name, ...group(matters.filter(m => m.assigneeId === e.id)) }));
  const oldest = [...stats.late].sort((a, b) => a.due.localeCompare(b.due))[0];
  const notes: string[] = [];
  if (oldest) notes.push(`يوجد ${stats.late.length} معاملات متأخرة، أقدمها ${oldest.id} بتأخير ${delay(oldest, now)} يوماً.`);
  const overloaded = team.find(e => e.open > stats.open.length / 2);
  if (overloaded) notes.push(`حمل العمل غير متوازن: ${overloaded.name} يحمل ${overloaded.open} من ${stats.open.length} معاملة مفتوحة.`);
  const urgent = stats.open.filter(m => m.important && m.urgent).length;
  if (urgent) notes.push(`يوجد ${urgent} معاملات مهمة وعاجلة ما زالت مفتوحة وتحتاج متابعة مباشرة.`);
  const invalid = matters.filter(m => !m.due || !m.assigneeId || !m.liaisonId).length;
  if (invalid) notes.push(`يوجد ${invalid} معاملات بلا مهلة أو مسؤول، وهذا يخالف سياسة تنظيم العمل.`);
  if (incoming.length > done.length) notes.push(`الوارد أكثر من المنجز خلال الفترة، فالمتراكم يزيد بمقدار ${incoming.length - done.length} معاملة.`);
  const adherence = done.length ? Math.round(done.filter(onTime).length / done.length * 100) : null;
  if (adherence !== null && adherence < 85) notes.push(`نسبة الالتزام ${adherence}% دون المستهدف 85%، ويوصى بمراجعة أسباب التأخر.`);
  if (!notes.length) notes.push('لا توجد تنبيهات في هذه الفترة؛ استمر في متابعة المهل وتوثيق الإجراءات.');
  return { ...range, incoming, done, stats, types, team, notes, adherence, backlog: incoming.length - done.length, lateRate: stats.open.length ? Math.round(stats.late.length / stats.open.length * 100) : 0 };
}
