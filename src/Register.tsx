import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { CalendarDays, CircleCheck, FilePlus2, Info, RotateCcw, Scale } from 'lucide-react';
import { Badge, Panel } from './components';
import { addWorkdays, canRegister, deadlineDays, DELIVERIES, fullDate, isLiaison, isManager, nextNumber, PRIORITIES, priorityKey, TYPES, type MatterDraft } from './domain';
import { repository } from './repository';
import { useApp } from './store';

export function Field({ label, children, required = false, wide = false, hint }: { label: string; children: ReactNode; required?: boolean; wide?: boolean; hint?: string }) { return <label className={`field ${wide ? 'field-wide' : ''}`}><span>{label}{required && <b className="required" aria-hidden="true"> *</b>}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function Register({ now }: { now: string }) {
  const { data, userId, run, notify, filterRegistry, open } = useApp();
  const defaults = (): MatterDraft => ({ type: 'CAS', subject: '', source: '', party: '', liaisonId: '', assigneeId: '', important: true, urgent: true, received: now, due: addWorkdays(now, 2), stage: 'لدى ضابط الاتصال', amount: 0, delivery: 'مذكرة', description: '', standardDays: 2 });
  const [draft, setDraft] = useState<MatterDraft>(defaults);
  const [manualDue, setManualDue] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState('');
  const days = deadlineDays(data!.settings.deadlines[draft.type], draft.urgent);
  const proposed = addWorkdays(now, days);
  const number = nextNumber(data!.matters, draft.type, now);
  const priority = PRIORITIES.find(p => p.key === priorityKey(draft))!;
  useEffect(() => { setDraft(d => ({ ...d, received: now, standardDays: days, ...(!manualDue ? { due: proposed } : {}) })); }, [now, days, proposed, manualDue]);
  const change = <K extends keyof MatterDraft>(key: K, value: MatterDraft[K]) => setDraft(d => ({ ...d, [key]: value }));
  const reset = () => { setDraft(defaults()); setManualDue(false); setErrors(''); };
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true); setErrors('');
    const matter = await run(() => repository.register(userId, draft));
    setBusy(false);
    if (matter) { notify(`تم تسجيل المعاملة وإصدار الرقم ${matter.id}`); reset(); filterRegistry({ query: matter.id }); open(matter); }
    else setErrors('لم تُسجّل المعاملة. راجع الحقول ورسالة التنبيه ثم أعد المحاولة.');
  };
  const user = data!.employees.find(e => e.id === userId)!;
  if (!canRegister(user)) return <Panel title="تسجيل معاملة" subtitle="تسجيل الأعمال واعتمادها"><p className="info-banner">تسجيل المعاملات متاح لمدير الإدارة القانونية فقط. يمكنك متابعة المعاملات المسندة إليك من السجل.</p></Panel>;
  const active = data!.employees.filter(e => !e.archived);
  return <>
    <div className="page-heading"><div><div className="eyebrow"><span />وارد جديد</div><h1>تسجيل معاملة</h1><p>كل عمل يبدأ برقم، ومسؤول واضح، وموعد محدد.</p></div><Badge><CircleCheck size={14} />التسجيل وفق سياسة العمل</Badge></div>
    <div className="register-layout"><div><div className="live-preview"><div><span>رقم المعاملة المقترح</span><strong className="mono">{number}</strong><small>يُعتمد تلقائياً عند التسجيل</small></div><div><span>آخر موعد مقترح</span><strong>{fullDate(proposed)}</strong><small>{days} يوم عمل {draft.urgent && '· مهلة عاجلة'}</small></div><div><span>تصنيف الأولوية</span><Badge tone={priority.tone}>{priority.title}</Badge><small>{priority.action}</small></div></div>
      <form className="panel registration-form" onSubmit={submit}><div className="form-section-title"><span className="section-number">01</span><div><h2>بيانات المعاملة</h2><p>المعلومات الأساسية للعمل المطلوب</p></div></div><div className="form-grid">
        <Field label="نوع المعاملة" required><select value={draft.type} onChange={e => change('type', e.target.value as MatterDraft['type'])}>{TYPES.map(t => <option key={t.code} value={t.code}>{t.name}</option>)}</select></Field>
        <Field label="جهة الإحالة / الطالب" required><input required value={draft.source} onChange={e => change('source', e.target.value)} maxLength={200} /></Field>
        <Field label="الموضوع" required wide><input required value={draft.subject} onChange={e => change('subject', e.target.value)} maxLength={500} /></Field>
        <Field label="الطرف الآخر"><input value={draft.party} onChange={e => change('party', e.target.value)} maxLength={200} /></Field>
        <Field label="المبلغ (ر.س)" hint="للقضايا والتنفيذ والمطالبات؛ 0 عند عدم وجود مبلغ"><input type="number" min="0" step="0.01" value={draft.amount} onChange={e => change('amount', Number(e.target.value))} dir="ltr" /></Field>
      </div><div className="form-section-title"><span className="section-number">02</span><div><h2>التوجيه والأولوية</h2><p>تحديد المسؤول عن المتابعة والتنفيذ</p></div></div><div className="form-grid">
        <Field label="ضابط الاتصال (الموجّه)" required><select required value={draft.liaisonId} onChange={e => change('liaisonId', e.target.value)}><option value="">اختر ضابط الاتصال</option>{active.filter(e => isLiaison(e) || isManager(e)).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
        <Field label="المكلّف بالتنفيذ" required><select required value={draft.assigneeId} onChange={e => change('assigneeId', e.target.value)}><option value="">اختر المكلّف</option>{active.map(e => <option key={e.id} value={e.id}>{e.name} · {e.role}</option>)}</select></Field>
        <div className="field"><span>الأهمية</span><div className="segmented"><button type="button" aria-pressed={draft.important} className={draft.important ? 'selected' : ''} onClick={() => change('important', true)}>مهم</button><button type="button" aria-pressed={!draft.important} className={!draft.important ? 'selected' : ''} onClick={() => change('important', false)}>غير مهم</button></div></div>
        <div className="field"><span>الاستعجال</span><div className="segmented"><button type="button" aria-pressed={draft.urgent} className={draft.urgent ? 'selected' : ''} onClick={() => change('urgent', true)}>عاجل</button><button type="button" aria-pressed={!draft.urgent} className={!draft.urgent ? 'selected' : ''} onClick={() => change('urgent', false)}>غير عاجل</button></div></div>
      </div><div className="form-section-title"><span className="section-number">03</span><div><h2>المهلة وصيغة التسليم</h2><p>موعد الإجراء والناتج المطلوب</p></div></div><div className="form-grid">
        <Field label="آخر موعد للإجراء" required hint="الموعد النظامي اليدوي يتقدم على المهلة المعيارية"><input type="date" required min={now} value={draft.due} onChange={e => { setManualDue(true); change('due', e.target.value); }} /><button className="text-button" type="button" onClick={() => { setManualDue(false); change('due', proposed); }}><RotateCcw size={13} />استخدام الموعد المقترح</button></Field>
        <Field label="صيغة التسليم" required><select value={draft.delivery} onChange={e => change('delivery', e.target.value)}>{DELIVERIES.map(d => <option key={d}>{d}</option>)}</select></Field>
        <Field label="التكليف والملاحظات والمستندات" wide><textarea rows={4} value={draft.description} onChange={e => change('description', e.target.value)} maxLength={5000} /></Field>
      </div>{errors && <p className="error-message" role="alert">{errors}</p>}<div className="form-footer"><div className="actions"><button type="submit" className="primary" disabled={busy}><FilePlus2 size={18} />{busy ? 'جارٍ التسجيل...' : 'تسجيل وإصدار الرقم'}</button><button type="button" className="secondary" onClick={reset} disabled={busy}><RotateCcw size={16} />تفريغ</button></div><p><Info size={14} />المهلة المعيارية لـ«{TYPES.find(t => t.code === draft.type)!.name}»: {days} يوم عمل.</p></div></form>
    </div><aside className="register-guide"><div className="guide-icon"><Scale size={30} /></div><h2>عمل منظّم.<br />أثر موثّق.</h2><p>البيانات الدقيقة عند التسجيل تعني متابعة أوضح وتقارير أكثر موثوقية.</p><div className="guide-item"><CircleCheck size={18} /><div><strong>لا عمل بلا رقم</strong><span>رقم مستقل لكل نوع وسنة، يُصدر عند الحفظ.</span></div></div><div className="guide-item"><CalendarDays size={18} /><div><strong>مهل بأيام العمل</strong><span>تستثنى الجمعة والسبت، والعاجل لا يتجاوز يومي عمل.</span></div></div><div className="guide-item"><CircleCheck size={18} /><div><strong>مراجعة قبل الإغلاق</strong><span>يراجع المدير الناتج ويعتمده قبل إغلاق المعاملة.</span></div></div><div className="guide-bottom">الحقول المشار إليها بـ * إلزامية</div></aside></div>
  </>;
}
