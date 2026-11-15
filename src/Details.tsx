import { useEffect, useState } from 'react';
import { Check, CircleCheck, Clock3, FileText, History, MessageSquarePlus, Save, Send } from 'lucide-react';
import { Badge, Confirm, Modal, StatusBadge } from './components';
import { assertTransition, canAssign, fullDate, isLiaison, isManager, n, PRIORITIES, priorityKey, STAGES, type Matter, type Stage } from './domain';
import { Field } from './Register';
import { repository } from './repository';
import { useApp } from './store';

export function Details({ matter: m, now }: { matter: Matter; now: string }) {
  const { data, userId, close, run } = useApp();
  const user = data!.employees.find(e => e.id === userId)!;
  const name = (id: string) => data!.employees.find(e => e.id === id)?.name || 'منسوب مؤرشف';
  const [values, setValues] = useState({ liaisonId: m.liaisonId, assigneeId: m.assigneeId, due: m.due, amount: m.amount });
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<Stage | 'update' | null>(null);
  const locked = m.stage === 'مغلقة';
  useEffect(() => { setValues({ liaisonId: m.liaisonId, assigneeId: m.assigneeId, due: m.due, amount: m.amount }); }, [m.liaisonId, m.assigneeId, m.due, m.amount]);
  const permitted = (stage: Stage) => { try { assertTransition(user, m, stage); return stage !== m.stage; } catch { return false; } };
  const p = PRIORITIES.find(p => p.key === priorityKey(m))!;
  const changes = Object.fromEntries(Object.entries(values).filter(([key, value]) => m[key as keyof typeof values] !== value));
  const doConfirm = async () => {
    const result = await run(async () => {
      if (confirm === 'update') await repository.update(userId, m.id, changes);
      else if (confirm) await repository.transition(userId, m.id, confirm);
      return true;
    }, confirm === 'update' ? 'تم حفظ التعديلات وتوثيقها في سجل الإجراءات' : 'تم تحديث مرحلة المعاملة');
    if (result) setConfirm(null);
  };
  return <><Modal title="تفاصيل المعاملة" onClose={close} drawer>
    <div className="drawer-content"><div className="detail-number-row"><span className="mono detail-number">{m.id}</span>{isManager(user) && <button className="primary small-button" disabled={!permitted('مغلقة')} onClick={() => setConfirm('مغلقة')}><Check size={16} />إغلاق المعاملة</button>}</div><h1 className="detail-title">{m.subject}</h1><div className="detail-badges"><StatusBadge matter={m} now={now} /><Badge tone={p.tone}>{p.title}</Badge></div>
      <dl className="detail-grid">{[['النوع', data && m.type], ['جهة الإحالة', m.source], ['الطرف الآخر', m.party || 'لا يوجد طرف آخر'], ['ضابط الاتصال', name(m.liaisonId)], ['المكلّف', name(m.assigneeId)], ['تاريخ الاستلام', fullDate(m.received)], ['آخر موعد', fullDate(m.due)], ['صيغة التسليم', m.delivery], ['المبلغ', `${n(m.amount)} ر.س`], ...(m.closed ? [['تاريخ الإغلاق', fullDate(m.closed)]] : [])].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{label === 'النوع' ? ({ CAS: 'قضية', EXE: 'تنفيذ', CON: 'عقد / مراجعة عقد', OPN: 'استشارة / رأي قانوني', LTR: 'خطاب / مراسلة', STD: 'دراسة قانونية', INV: 'شكوى / تحقيق', TSK: 'مهمة إدارية' })[m.type] : value}</dd></div>)}</dl>
      <section className="requirement-box"><h2><FileText size={17} />المطلوب والمستندات</h2><p>{m.description || `إعداد ${m.delivery} بشأن ${m.subject} ورفعه للمراجعة.`}</p></section>
      <section className="detail-section"><h2><CircleCheck size={18} />مرحلة المعاملة</h2><div className="detail-stages">{STAGES.map((s, i) => <button key={s} className={m.stage === s ? 'current' : ''} disabled={!permitted(s)} aria-current={m.stage === s ? 'step' : undefined} onClick={() => setConfirm(s)}><span>{i + 1}</span>{s}</button>)}</div><p className="field-help">{locked ? 'المعاملة مغلقة، وسجلها محفوظ للرجوع إليه.' : isManager(user) ? 'يمكن إعادة المعاملة إلى التنفيذ بملاحظات أو اعتمادها بعد المراجعة.' : 'يمكن رفع الناتج للمراجعة من مرحلة التنفيذ؛ الإغلاق من اختصاص المدير.'}</p></section>
      {!locked && canAssign(user, m) && <section className="detail-section"><h2><Clock3 size={18} />التوجيه والمهلة</h2><form onSubmit={e => { e.preventDefault(); setConfirm('update'); }}><div className="form-grid"><Field label="ضابط الاتصال"><select value={values.liaisonId} disabled={!isManager(user)} onChange={e => setValues(v => ({ ...v, liaisonId: e.target.value }))}>{data!.employees.filter(e => !e.archived && (isLiaison(e) || isManager(e))).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field><Field label="المكلّف"><select value={values.assigneeId} onChange={e => setValues(v => ({ ...v, assigneeId: e.target.value }))}>{data!.employees.filter(e => !e.archived).map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field><Field label="آخر موعد"><input type="date" required min={m.received} disabled={!isManager(user)} value={values.due} onChange={e => setValues(v => ({ ...v, due: e.target.value }))} /></Field><Field label="المبلغ (ر.س)"><input type="number" min="0" step="0.01" disabled={!isManager(user)} value={values.amount} onChange={e => setValues(v => ({ ...v, amount: Number(e.target.value) }))} dir="ltr" /></Field></div><button className="secondary" type="submit" disabled={!Object.keys(changes).length}><Save size={16} />حفظ التعديلات</button></form></section>}
      {!locked && <section className="detail-section"><h2><MessageSquarePlus size={18} />إضافة إجراء أو ملاحظة</h2><form onSubmit={async e => { e.preventDefault(); setBusy(true); const ok = await run(async () => { await repository.note(userId, m.id, note); return true; }, 'تم توثيق الإجراء'); setBusy(false); if (ok) setNote(''); }}><textarea aria-label="نص الإجراء أو الملاحظة" value={note} onChange={e => setNote(e.target.value)} required rows={3} maxLength={5000} placeholder="دوّن الإجراء المتخذ والناتج، مثل: قُدّمت المذكرة في ناجز." /><div className="note-footer"><span>يُحفظ باسمك مع التاريخ والوقت</span><button className="primary small-button" type="submit" disabled={!note.trim() || busy}><Send size={15} />{busy ? 'جارٍ الحفظ...' : 'إضافة الإجراء'}</button></div></form></section>}
      <section className="detail-section"><h2><History size={18} />سجل الإجراءات <span className="count-pill">{m.audit.length}</span></h2><p className="field-help">سجل غير قابل للحذف؛ يوضح من قام بالإجراء ومتى.</p><ol className="audit-list">{[...m.audit].reverse().map(a => <li key={a.id}><span className="audit-dot" /><strong>{a.action}</strong>{(a.old !== undefined || a.next !== undefined) && <div className="audit-change">{a.old && <span>{a.old}</span>}{a.old && a.next && <span>←</span>}{a.next && <b>{a.next}</b>}</div>}<div className="audit-meta"><span>{a.actor}</span><time dateTime={a.at}>{new Intl.DateTimeFormat('ar-SA-u-ca-gregory-nu-latn', { dateStyle: 'medium', timeStyle: 'short', hour12: false }).format(new Date(a.at))}</time></div></li>)}</ol></section>
    </div>
  </Modal>{confirm && <Confirm title={confirm === 'update' ? 'تأكيد تعديل بيانات المعاملة' : confirm === 'مغلقة' ? 'اعتماد الناتج وإغلاق المعاملة' : 'تأكيد تغيير المرحلة'} text={confirm === 'update' ? 'ستُحفظ القيم الجديدة وتُسجّل القيم القديمة والجديدة في سجل الإجراءات.' : confirm === 'مغلقة' ? 'هل راجعت الناتج واعتمدت تسليمه؟ سيُسجّل تاريخ الإغلاق وتُحسب نتيجة الالتزام بالمهلة تلقائياً.' : `نقل المعاملة إلى «${confirm}»؟ سيُوثّق هذا الانتقال باسمك.`} onClose={() => setConfirm(null)} onConfirm={doConfirm} />}</>;
}
