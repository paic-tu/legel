import * as XLSX from 'xlsx';
import { deadlineDays, delay, TYPES, validateMatter, type Employee, type Matter, type Settings, type Stage, type TypeCode, type report } from './domain';

export const HEADERS = ['رقم المعاملة', 'النوع', 'الموضوع', 'جهة الإحالة', 'الطرف الآخر', 'ضابط الاتصال', 'المكلف', 'مهم', 'عاجل', 'تاريخ الاستلام', 'آخر موعد', 'المرحلة', 'تاريخ الإغلاق', 'المبلغ', 'صيغة التسليم', 'الوصف', 'المهلة المعيارية', 'سجل الإجراءات'];
type Row = Record<string, string | number>;
export function matterRows(matters: Matter[], employees: Employee[]): Row[] {
  const name = (id: string) => employees.find(e => e.id === id)?.name || id;
  return matters.map(m => Object.fromEntries(HEADERS.map((h, i) => [h, [
    m.id, TYPES.find(t => t.code === m.type)!.name, m.subject, m.source, m.party,
    name(m.liaisonId), name(m.assigneeId), m.important ? 'نعم' : 'لا', m.urgent ? 'نعم' : 'لا',
    m.received, m.due, m.stage, m.closed || '', m.amount, m.delivery, m.description, m.standardDays, JSON.stringify(m.audit),
  ][i]])));
}
function append(workbook: XLSX.WorkBook, name: string, rows: Row[], headers?: string[]) {
  const sheet = XLSX.utils.json_to_sheet(rows, headers ? { header: headers } : undefined);
  sheet['!cols'] = (headers || Object.keys(rows[0] || {})).map(h => ({ wch: ['الموضوع', 'الوصف', 'ملاحظة'].includes(h) ? 55 : 22 }));
  sheet['!autofilter'] = { ref: sheet['!ref'] || 'A1:A1' };
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}
export function makeWorkbook(matters: Matter[], employees: Employee[]) {
  const workbook = XLSX.utils.book_new();
  workbook.Workbook = { Views: [{ RTL: true }] };
  append(workbook, 'المعاملات', matterRows(matters, employees), HEADERS);
  append(workbook, 'المنسوبون', employees.map(e => ({ الاسم: e.name, الدور: e.role, الحالة: e.archived ? 'مؤرشف' : 'نشط' })));
  return workbook;
}
export const exportRegistry = (matters: Matter[], employees: Employee[]) => XLSX.writeFile(makeWorkbook(matters, employees), 'سجل المعاملات.xlsx');
export function exportTemplate() {
  const workbook = XLSX.utils.book_new();
  workbook.Workbook = { Views: [{ RTL: true }] };
  append(workbook, 'المعاملات', [], HEADERS);
  XLSX.writeFile(workbook, 'قالب استيراد المعاملات.xlsx');
}
export interface ImportRow { row: number; matter: Matter; errors: string[]; duplicate: boolean }
function dateValue(value: unknown): string {
  if (typeof value === 'number') {
    const d = XLSX.SSF.parse_date_code(value);
    return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : '';
  }
  return String(value ?? '').trim();
}
export function parseWorkbook(workbook: XLSX.WorkBook, employees: Employee[], existing: Matter[], settings: Settings): ImportRow[] {
  const sheet = workbook.Sheets['المعاملات'] || workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) throw new Error('الملف لا يحتوي على ورقة معاملات');
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  if (rows.length > 10000) throw new Error('الحد الأقصى للاستيراد 10000 صف في المرة الواحدة');
  const ids = new Set(existing.map(m => m.id));
  return rows.map((row, index) => {
    const str = (key: string) => String(row[key] ?? '').trim();
    const errors: string[] = [];
    const bool = (key: string) => {
      const value = str(key);
      if (!['نعم', 'لا', '1', '0', 'true', 'false', 'مهم', 'غير مهم', 'عاجل', 'غير عاجل'].includes(value)) errors.push(`قيمة ${key} يجب أن تكون نعم أو لا`);
      return ['نعم', '1', 'true', 'مهم', 'عاجل'].includes(value);
    };
    const id = str('رقم المعاملة');
    const type = TYPES.find(t => t.name === str('النوع') || t.code === str('النوع'))?.code;
    const employee = (key: string) => employees.find(e => e.name === str(key) || e.id === str(key))?.id || '';
    const urgent = bool('عاجل');
    let audit: Matter['audit'] = [];
    if (str('سجل الإجراءات')) {
      try {
        const parsed: unknown = JSON.parse(str('سجل الإجراءات'));
        if (!Array.isArray(parsed) || !parsed.every(a => a && typeof a.id === 'string' && typeof a.at === 'string' && typeof a.actor === 'string' && typeof a.action === 'string' && (a.old === undefined || typeof a.old === 'string') && (a.next === undefined || typeof a.next === 'string'))) throw new Error();
        audit = parsed;
      } catch { errors.push('سجل الإجراءات غير صالح'); }
    }
    const m: Matter = {
      id, type: type as TypeCode, subject: str('الموضوع'), source: str('جهة الإحالة'), party: str('الطرف الآخر'),
      liaisonId: employee('ضابط الاتصال'), assigneeId: employee('المكلف'), important: bool('مهم'), urgent,
      received: dateValue(row['تاريخ الاستلام']), due: dateValue(row['آخر موعد']), closed: dateValue(row['تاريخ الإغلاق']) || undefined,
      stage: str('المرحلة') as Stage, amount: Number(str('المبلغ').replace(/,/g, '') || 0),
      delivery: str('صيغة التسليم'), description: str('الوصف'),
      standardDays: Number(row['المهلة المعيارية'] || deadlineDays(settings.deadlines[type || 'CAS'], urgent)), audit,
    };
    errors.push(...validateMatter(m, employees));
    if (!id) errors.push('رقم المعاملة مطلوب');
    const duplicate = ids.has(id);
    ids.add(id);
    return { row: index + 2, matter: m, errors, duplicate };
  });
}
export async function readImport(file: File, employees: Employee[], matters: Matter[], settings: Settings) {
  if (file.size > 5 * 1024 * 1024) throw new Error('حجم الملف يتجاوز 5 ميجابايت');
  return parseWorkbook(XLSX.read(await file.arrayBuffer(), { type: 'array' }), employees, matters, settings);
}
export function exportErrors(rows: ImportRow[]) {
  const wb = XLSX.utils.book_new();
  wb.Workbook = { Views: [{ RTL: true }] };
  append(wb, 'نتيجة المعاينة', rows.map(r => ({ الصف: r.row, 'رقم المعاملة': r.matter.id, النتيجة: r.errors.length ? r.errors.join('، ') : r.duplicate ? 'رقم مكرر، لن يستورد' : 'صالح للاستيراد' })));
  XLSX.writeFile(wb, 'تقرير أخطاء الاستيراد.xlsx');
}
export function exportReport(r: ReturnType<typeof report>, employees: Employee[], now: string) {
  const wb = XLSX.utils.book_new(); wb.Workbook = { Views: [{ RTL: true }] };
  append(wb, 'الملخص', [
    { المؤشر: 'الفترة', القيمة: `${r.from} - ${r.to}` },
    { المؤشر: 'الوارد', القيمة: r.incoming.length }, { المؤشر: 'المنجز', القيمة: r.done.length },
    { المؤشر: 'نسبة الالتزام', القيمة: r.adherence === null ? 'لا يوجد إنجاز' : `${r.adherence}%` },
    { المؤشر: 'المتراكم', القيمة: r.backlog }, { المؤشر: 'المفتوح', القيمة: r.stats.open.length },
    { المؤشر: 'المتأخر', القيمة: r.stats.late.length }, { المؤشر: 'نسبة المتأخر', القيمة: `${r.lateRate}%` },
    { المؤشر: 'مبالغ قيد التنفيذ', القيمة: r.stats.executionMoney },
  ]);
  append(wb, 'حسب النوع', r.types.map(t => ({ النوع: t.name, الوارد: t.received, المنجز: t.done, 'في المهلة': t.onTime, 'متأخر قائم': t.late, 'متوسط الإنجاز بالأيام': t.average })));
  append(wb, 'حسب المكلف', r.team.map(t => ({ المكلف: t.name, الوارد: t.received, المنجز: t.done, 'نسبة الالتزام': t.adherence === null ? 'لا يوجد إنجاز' : `${t.adherence}%`, المفتوح: t.open, المتأخر: t.late })));
  append(wb, 'المتأخرات', r.stats.late.map(m => ({ 'رقم المعاملة': m.id, الموضوع: m.subject, المكلف: employees.find(e => e.id === m.assigneeId)?.name || '', 'آخر موعد': m.due, 'أيام التأخير': delay(m, now), المبلغ: m.amount })));
  append(wb, 'الملاحظات الآلية', r.notes.map(note => ({ ملاحظة: note })));
  XLSX.writeFile(wb, `التقرير القانوني ${r.from}.xlsx`);
}
