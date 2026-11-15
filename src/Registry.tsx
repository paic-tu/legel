import { useMemo, useState, type ChangeEvent } from 'react';
import { ArrowDownUp, ChevronLeft, ChevronRight, Download, FileSpreadsheet, Search, Upload, X } from 'lucide-react';
import { Badge, Empty, Modal, StatusBadge } from './components';
import { isManager, n, overdue, PRIORITIES, priorityKey, shortDate, soon, TYPES, type Matter } from './domain';
import { exportErrors, exportRegistry, exportTemplate, readImport, type ImportRow } from './excel';
import { repository } from './repository';
import { emptyFilters, useApp } from './store';

export function ImportDialog({ onClose }: { onClose: () => void }) {
  const { data, userId, notify, run } = useApp();
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [fileName, setFileName] = useState('');
  const valid = rows?.filter(r => !r.errors.length && !r.duplicate) || [];
  const selectFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    setBusy(true); setFileName(file.name);
    try { setRows(await readImport(file, data!.employees, data!.matters, data!.settings)); }
    catch (error) { setRows(null); notify(error instanceof Error ? error.message : 'تعذر قراءة الملف', true); }
    finally { setBusy(false); e.target.value = ''; }
  };
  return <Modal title="استيراد المعاملات من Excel" onClose={onClose} wide>
    <div className="import-body"><div className="info-banner"><FileSpreadsheet size={20} /><p>ارفع ملفاً بالأعمدة العربية المعتمدة. تُراجع البيانات قبل الاعتماد، وتُستثنى الأرقام المكررة دون تعديل المعاملات الحالية.</p></div>
      <div className="upload-box"><Upload size={30} /><strong>{busy ? 'جارٍ قراءة الملف...' : fileName || 'اختر ملف المعاملات'}</strong><span>ملف Excel، حتى 5 ميجابايت و10000 صف</span><label className="primary upload-label">اختيار ملف<input type="file" accept=".xlsx,.xls" onChange={selectFile} disabled={busy} aria-label="اختيار ملف Excel للاستيراد" /></label><button className="text-button" onClick={exportTemplate}><Download size={15} />تنزيل القالب الفارغ</button></div>
      {rows && <><div className="import-stats"><Badge>{valid.length} صالح</Badge><Badge tone="red">{rows.filter(r => r.errors.length).length} به أخطاء</Badge><Badge tone="amber">{rows.filter(r => r.duplicate).length} مكرر</Badge></div><div className="import-preview"><table><thead><tr><th>الصف</th><th>رقم المعاملة</th><th>الموضوع</th><th>نتيجة المعاينة</th></tr></thead><tbody>{rows.map(r => <tr key={r.row}><td>{r.row}</td><td className="mono">{r.matter.id || 'غير محدد'}</td><td>{r.matter.subject || 'غير محدد'}</td><td className={r.errors.length ? 'red-text' : ''}>{r.errors.join('، ') || (r.duplicate ? 'مكرر؛ لن يستورد' : 'صالح للاستيراد')}</td></tr>)}</tbody></table>{!rows.length && <Empty text="الملف لا يحتوي على بيانات معاملات" />}</div><div className="actions"><button className="primary" disabled={!valid.length || busy} onClick={async () => { setBusy(true); const count = await run(() => repository.import(userId, valid.map(r => r.matter))); setBusy(false); if (count !== undefined) { notify(`تم استيراد ${count} معاملة بنجاح`); onClose(); } }}><Upload size={16} />{busy ? 'جارٍ الاعتماد...' : `اعتماد ${valid.length} معاملة`}</button><button className="secondary" onClick={() => exportErrors(rows)}><Download size={16} />تقرير المعاينة</button></div></>}
    </div>
  </Modal>;
}
export function Registry({ matters, now }: { matters: Matter[]; now: string }) {
  const { data, userId, filters, setFilters, open } = useApp();
  const user = data!.employees.find(e => e.id === userId)!;
  const [importOpen, setImportOpen] = useState(false);
  const [sort, setSort] = useState<{ key: keyof Matter; asc: boolean }>({ key: 'due', asc: true });
  const [page, setPage] = useState(1);
  const names = (id: string) => data!.employees.find(e => e.id === id)?.name || 'منسوب مؤرشف';
  const filtered = useMemo(() => matters.filter(m => {
    const query = filters.query.trim().toLowerCase();
    return (!query || [m.id, m.subject, m.party, m.source].some(v => v.toLowerCase().includes(query))) &&
      (!filters.type || m.type === filters.type) && (!filters.assignee || m.assigneeId === filters.assignee) &&
      (!filters.priority || priorityKey(m) === filters.priority) && (!filters.stage || m.stage === filters.stage) &&
      (!filters.status || (filters.status === 'open' && m.stage !== 'مغلقة') || (filters.status === 'closed' && m.stage === 'مغلقة') ||
        (filters.status === 'closedMonth' && m.stage === 'مغلقة' && m.closed?.slice(0, 7) === now.slice(0, 7)) ||
        (filters.status === 'late' && overdue(m, now)) || (filters.status === 'soon' && soon(m, now)) || (filters.status === 'ontime' && m.stage !== 'مغلقة' && !overdue(m, now) && !soon(m, now)));
  }).sort((a, b) => {
    const key = sort.key;
    const va = key === 'important' ? PRIORITIES.findIndex(p => p.key === priorityKey(a)) : key === 'assigneeId' || key === 'liaisonId' ? names(String(a[key])) : a[key];
    const vb = key === 'important' ? PRIORITIES.findIndex(p => p.key === priorityKey(b)) : key === 'assigneeId' || key === 'liaisonId' ? names(String(b[key])) : b[key];
    return (typeof va === 'number' && typeof vb === 'number' ? va - vb : String(va).localeCompare(String(vb), 'ar')) * (sort.asc ? 1 : -1);
  }), [matters, filters, sort, data, now]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / 10));
  const currentPage = Math.min(page, pageCount);
  const displayed = filtered.slice((currentPage - 1) * 10, currentPage * 10);
  const changeFilter = (key: keyof typeof filters, value: string) => { setFilters({ [key]: value }); setPage(1); };
  const headers: { label: string; key: keyof Matter }[] = [{ label: 'الرقم', key: 'id' }, { label: 'النوع', key: 'type' }, { label: 'الموضوع', key: 'subject' }, { label: 'ضابط الاتصال', key: 'liaisonId' }, { label: 'المكلّف', key: 'assigneeId' }, { label: 'الأولوية', key: 'important' }, { label: 'المهلة', key: 'due' }, { label: 'المرحلة', key: 'stage' }, { label: 'المبلغ', key: 'amount' }];
  return <>
    <div className="page-heading"><div><div className="eyebrow"><span />إدارة الأعمال</div><h1>سجل المعاملات</h1><p>{filtered.length} من {matters.length} معاملة <span className="text-separator">|</span> سجل موحّد لكل عمل، وأثر واضح لكل إجراء.</p></div><div className="actions">{isManager(user) && <button className="secondary" onClick={() => setImportOpen(true)}><Upload size={17} />استيراد من Excel</button>}<button className="primary" onClick={() => exportRegistry(matters, data!.employees)}><Download size={17} />تصدير إلى Excel</button></div></div>
    <section className="panel registry-panel"><div className="filter-toolbar"><div className="search-field"><Search size={18} /><input aria-label="بحث في سجل المعاملات" value={filters.query} onChange={e => changeFilter('query', e.target.value)} placeholder="ابحث بالرقم أو الموضوع أو الطرف..." />{filters.query && <button className="icon-button" aria-label="مسح البحث" onClick={() => changeFilter('query', '')}><X size={15} /></button>}</div><select aria-label="تصفية حسب النوع" value={filters.type} onChange={e => changeFilter('type', e.target.value)}><option value="">جميع الأنواع</option>{TYPES.map(t => <option value={t.code} key={t.code}>{t.name}</option>)}</select><select aria-label="تصفية حسب المكلّف" value={filters.assignee} onChange={e => changeFilter('assignee', e.target.value)}><option value="">جميع المكلّفين</option>{data!.employees.filter(e => !e.archived).map(e => <option value={e.id} key={e.id}>{e.name}</option>)}</select><select aria-label="تصفية حسب الحالة" value={filters.status} onChange={e => changeFilter('status', e.target.value)}><option value="">جميع الحالات</option><option value="open">مفتوحة</option><option value="late">متأخرة</option><option value="soon">قريبة الاستحقاق</option><option value="ontime">في المهلة</option><option value="closed">مغلقة</option><option value="closedMonth">مغلقة هذا الشهر</option></select><select aria-label="تصفية حسب الأولوية" value={filters.priority} onChange={e => changeFilter('priority', e.target.value)}><option value="">جميع الأولويات</option>{PRIORITIES.map(p => <option key={p.key} value={p.key}>{p.title}</option>)}</select></div>
      {Object.values(filters).some(Boolean) && <div className="active-filters"><span>النتائج مصفّاة {filters.stage && `· ${filters.stage}`}</span><button className="text-button" onClick={() => { setFilters(emptyFilters); setPage(1); }}><X size={14} />مسح التصفية</button></div>}
      <div className="table-wrapper"><table className="registry-table"><thead><tr>{headers.map(h => <th key={h.key} aria-sort={sort.key === h.key ? sort.asc ? 'ascending' : 'descending' : 'none'}><button onClick={() => setSort({ key: h.key, asc: sort.key === h.key ? !sort.asc : true })}>{h.label}<ArrowDownUp size={12} /></button></th>)}</tr></thead><tbody>{displayed.map(m => <tr key={m.id} onClick={() => open(m)}><td data-label="الرقم"><button className="mono row-link" onClick={e => { e.stopPropagation(); open(m); }}>{m.id}</button></td><td data-label="النوع">{TYPES.find(t => t.code === m.type)?.name}</td><td data-label="الموضوع" className="subject-cell"><strong>{m.subject}</strong><span>{m.source}</span></td><td data-label="ضابط الاتصال">{names(m.liaisonId)}</td><td data-label="المكلّف">{names(m.assigneeId)}</td><td data-label="الأولوية"><Badge tone={PRIORITIES.find(p => p.key === priorityKey(m))!.tone}>{priorityKey(m)}</Badge></td><td data-label="المهلة"><div className="deadline-cell"><span>{shortDate(m.due)}</span><StatusBadge matter={m} now={now} /></div></td><td data-label="المرحلة"><span className="stage-label">{m.stage}</span></td><td data-label="المبلغ" className="amount-cell">{m.amount ? n(m.amount) : '—'}</td></tr>)}</tbody></table>{!filtered.length && <Empty action={<button className="secondary" onClick={() => setFilters(emptyFilters)}>عرض جميع المعاملات</button>} />}</div>
      <div className="pagination"><span>{filtered.length ? `${(currentPage - 1) * 10 + 1} - ${Math.min(currentPage * 10, filtered.length)}` : '0'} من {filtered.length} معاملة</span><div><button className="icon-button" aria-label="الصفحة السابقة" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}><ChevronRight size={18} /></button><span>صفحة {currentPage} من {pageCount}</span><button className="icon-button" aria-label="الصفحة التالية" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}><ChevronLeft size={18} /></button></div></div>
    </section>{importOpen && <ImportDialog onClose={() => setImportOpen(false)} />}
  </>;
}
