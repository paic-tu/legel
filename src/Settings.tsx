import { useEffect, useState, type FormEvent } from 'react';
import { BadgeCheck, CircleCheck, Info, Plus, Save, ShieldCheck, Trash2, Users } from 'lucide-react';
import { Badge, Confirm, Modal, Panel } from './components';
import { isManager, ROLES, TYPES, type Employee, type Matter } from './domain';
import { Field } from './Register';
import { repository } from './repository';
import { useApp } from './store';
import { cloudMode } from './supabase';

export function Settings({ matters }: { matters: Matter[] }) {
  const { data, userId, run } = useApp();
  const user = data!.employees.find(e => e.id === userId)!;
  const editable = isManager(user);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [bind, setBind] = useState<Employee | null>(null);
  const [bindEmail, setBindEmail] = useState('');
  const [role, setRole] = useState<Employee['role']>('محامٍ');
  const [days, setDays] = useState(data!.settings.deadlines);
  const [remove, setRemove] = useState<Employee | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDays(data!.settings.deadlines), [data!.settings.deadlines]);
  const add = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    const ok = await run(async () => { await repository.addEmployee(userId, name, role, email); return true; }, 'تمت إضافة المنسوب');
    setBusy(false); if (ok) { setName(''); setEmail(''); }
  };
  return <>
    <div className="page-heading"><div><div className="eyebrow"><span />حوكمة العمل</div><h1>الإدارة والإعدادات</h1><p>الفريق، والمهل، وآلية العمل المعتمدة.</p></div><Badge><ShieldCheck size={14} />{editable ? 'صلاحيات مدير الإدارة' : 'عرض آلية العمل'}</Badge></div>
    <div className="overview-grid settings-grid"><Panel title="منسوبو الإدارة" subtitle="الفريق والأدوار وحمل العمل الحالي" action={<Users size={19} className="muted" />}><div className="table-wrapper"><table className="data-table staff-table"><thead><tr><th>الاسم</th><th>الدور</th><th>المفتوح</th>{cloudMode && editable && <th>حساب الدخول</th>}{editable && <th>إزالة</th>}</tr></thead><tbody>{data!.employees.filter(e => !e.archived).map(e => {
      const open = matters.filter(m => m.stage !== 'مغلقة' && m.assigneeId === e.id).length;
      const linked = data!.matters.some(m => m.stage !== 'مغلقة' && (m.assigneeId === e.id || m.liaisonId === e.id));
      return <tr key={e.id}><td data-label="الاسم"><span className="staff-name"><span className="avatar">{e.name[0]}</span>{e.name}</span></td><td data-label="الدور">{e.role}</td><td data-label="المفتوح"><span className="count-pill">{open}</span></td>{cloudMode && editable && <td data-label="حساب الدخول">{e.authUserId ? <Badge>مرتبط</Badge> : <button className="text-button" onClick={() => { setBind(e); setBindEmail(''); }}>ربط حساب {e.name}</button>}</td>}{editable && <td data-label="إزالة"><button className="icon-button red-text" aria-label={`إزالة ${e.name}`} title={linked ? 'أعد إسناد المعاملات المفتوحة أولاً' : 'إزالة المنسوب'} disabled={isManager(e) || linked} onClick={() => setRemove(e)}><Trash2 size={16} /></button></td>}</tr>;
    })}</tbody></table></div>{editable && <form className="add-employee" onSubmit={add}><h3><Plus size={16} />إضافة منسوب</h3><div><Field label="الاسم" required><input required value={name} onChange={e => setName(e.target.value)} maxLength={100} /></Field><Field label="الدور"><select value={role} onChange={e => setRole(e.target.value as Employee['role'])}>{ROLES.map(r => <option key={r}>{r}</option>)}</select></Field>{cloudMode && <Field label="بريد حساب الدخول"><input type="email" value={email} onChange={e => setEmail(e.target.value)} dir="ltr" /></Field>}<button type="submit" className="primary" disabled={busy || !name.trim()}><Plus size={16} />إضافة</button></div><p className="field-help">لا يمكن إزالة من لديه معاملات مفتوحة، سواء كان مكلّفاً أو ضابط اتصال.</p></form>}</Panel>
      <Panel title="أنواع المعاملات والمهل" subtitle="التعديلات تسري على المعاملات الجديدة فقط" action={<BadgeCheck size={19} className="muted" />}><form onSubmit={async e => { e.preventDefault(); setBusy(true); await run(() => repository.settings(userId, { ...data!.settings, deadlines: days }), 'تم حفظ المهل المعيارية'); setBusy(false); }}><div className="table-wrapper"><table className="data-table deadline-table"><thead><tr><th>النوع</th><th>الرمز</th><th>المهلة (أيام عمل)</th></tr></thead><tbody>{TYPES.map(t => <tr key={t.code}><td data-label="النوع">{t.name}</td><td data-label="الرمز" className="mono">{t.code}</td><td data-label="المهلة"><input aria-label={`مهلة ${t.name}`} type="number" min="1" max="365" step="1" required disabled={!editable} value={days[t.code]} onChange={e => setDays(d => ({ ...d, [t.code]: Number(e.target.value) }))} /></td></tr>)}</tbody></table></div><div className="deadline-footer"><p><Info size={17} />العاجل تُختصر مهلته إلى يومي عمل كحد أقصى، وأيام العمل تستثني الجمعة والسبت.</p>{editable && <button className="primary" type="submit" disabled={busy || JSON.stringify(days) === JSON.stringify(data!.settings.deadlines)}><Save size={16} />حفظ المهل</button>}</div></form></Panel></div>
    <Panel title="آلية العمل المعتمدة" subtitle="دورة موحدة لكل عمل يدخل الإدارة القانونية" action={<CircleCheck size={19} className="green-text" />}><div className="approved-workflow">{[
      ['الاستلام', 'يصل الطلب إلى مدير الإدارة من الجهة المختصة.'], ['التسجيل', 'إصدار رقم وتحديد نوع العمل والمهلة وصيغة التسليم.'], ['التوجيه', 'إحالة المعاملة إلى ضابط الاتصال وتحديد المنفّذ.'], ['التنفيذ', 'تنفيذ المطلوب وتوثيق الإجراءات ورفع الناتج.'], ['المراجعة', 'يراجع المدير الناتج ويعتمده أو يعيده بملاحظات.'], ['الإغلاق', 'تسجيل التسليم واحتساب الإنجاز في المهلة أو بعدها.'],
    ].map(([title, desc], i) => <div key={title}><span className="workflow-number">{i + 1}</span><h3>{title}</h3><p>{desc}</p></div>)}</div></Panel>
    {bind && <Modal title={`ربط حساب ${bind.name}`} onClose={() => setBind(null)}><form className="account-binding-form" onSubmit={async event => { event.preventDefault(); setBusy(true); const ok = await run(async () => { await repository.bindAccount(userId, bind.id, bindEmail.trim()); return true; }, 'تم ربط الحساب بالمنسوب'); setBusy(false); if (ok) setBind(null); }}><Field label="البريد الإلكتروني للحساب" required><input type="email" required dir="ltr" value={bindEmail} onChange={e => setBindEmail(e.target.value)} /></Field><button className="primary" disabled={busy} type="submit">تأكيد ربط الحساب</button></form></Modal>}
    {remove && <Confirm title="إزالة منسوب من الفريق" text={`سيُزال «${remove.name}» من المستخدمين النشطين، مع الاحتفاظ باسمه في المعاملات التاريخية. هل تريد المتابعة؟`} onClose={() => setRemove(null)} onConfirm={async () => { const ok = await run(async () => { await repository.removeEmployee(userId, remove.id); return true; }, 'تمت إزالة المنسوب من الفريق النشط'); if (ok) setRemove(null); }} />}
  </>;
}
