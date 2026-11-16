import { useEffect, useState, type FormEvent } from 'react';
import { BadgeCheck, CircleCheck, Info, Pencil, Plus, Save, ShieldCheck, Trash2, Users } from 'lucide-react';
import { Badge, Confirm, Modal, Panel } from './components';
import { isManager, ROLES, TYPES, type Employee, type EmployeeInput, type Matter } from './domain';
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
  const [password, setPassword] = useState('');
  const [editing, setEditing] = useState<EmployeeInput | null>(null);
  const [role, setRole] = useState<Employee['role']>('محامٍ');
  const [days, setDays] = useState(data!.settings.deadlines);
  const [remove, setRemove] = useState<Employee | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => setDays(data!.settings.deadlines), [data!.settings.deadlines]);
  const add = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    const ok = await run(async () => { await repository.saveEmployee(userId, { name, role, email, ...(password ? { password } : {}) }); return true; }, 'تمت إضافة المنسوب');
    setBusy(false); if (ok) { setName(''); setEmail(''); setPassword(''); }
  };
  return <>
    <div className="page-heading"><div><div className="eyebrow"><span />حوكمة العمل</div><h1>الإدارة والإعدادات</h1><p>الفريق، والمهل، وآلية العمل المعتمدة.</p></div><Badge><ShieldCheck size={14} />{editable ? 'صلاحيات مدير الإدارة' : 'عرض آلية العمل'}</Badge></div>
    <div className="overview-grid settings-grid"><Panel title="منسوبو الإدارة" subtitle="الفريق والأدوار وحمل العمل الحالي" action={<Users size={19} className="muted" />}><div className="table-wrapper"><table className="data-table staff-table"><thead><tr><th>الاسم</th><th>الدور</th><th>المفتوح</th>{cloudMode && editable && <th>حساب الدخول</th>}{editable && <th>إدارة</th>}</tr></thead><tbody>{data!.employees.filter(e => !e.archived).map(e => {
      const open = matters.filter(m => m.stage !== 'مغلقة' && m.assigneeId === e.id).length;
      const linked = data!.matters.some(m => m.stage !== 'مغلقة' && (m.assigneeId === e.id || m.liaisonId === e.id));
      return <tr key={e.id}><td data-label="الاسم"><span className="staff-name"><span className="avatar">{e.name[0]}</span>{e.name}</span></td><td data-label="الدور">{e.role}</td><td data-label="المفتوح"><span className="count-pill">{open}</span></td>{cloudMode && editable && <td data-label="حساب الدخول">{e.email ? <span className="mono" dir="ltr">{e.email}</span> : <Badge>{e.authUserId ? 'مرتبط' : 'دون حساب'}</Badge>}</td>}{editable && <td data-label="إدارة"><button className="icon-button" aria-label={`تعديل ${e.name}`} title="تعديل المنسوب والحساب" disabled={busy} onClick={() => setEditing({ id: e.id, name: e.name, role: e.role, email: e.email || '', password: '' })}><Pencil size={16} /></button><button className="icon-button red-text" aria-label={`إزالة ${e.name}`} title={linked ? 'أعد إسناد المعاملات المفتوحة أولاً' : 'إزالة المنسوب'} disabled={busy || isManager(e) || linked} onClick={() => setRemove(e)}><Trash2 size={16} /></button></td>}</tr>;
    })}</tbody></table></div>{editable && <form className="add-employee" onSubmit={add}><h3><Plus size={16} />إضافة منسوب</h3><div><Field label="الاسم" required><input required value={name} onChange={e => setName(e.target.value)} maxLength={100} /></Field><Field label="الدور"><select value={role} onChange={e => setRole(e.target.value as Employee['role'])}>{ROLES.map(r => <option key={r}>{r}</option>)}</select></Field>{cloudMode && <><Field label="بريد حساب الدخول"><input type="email" value={email} onChange={e => setEmail(e.target.value)} dir="ltr" placeholder="name@thabat.sa" required={!!password} maxLength={254} /></Field><Field label="كلمة المرور الأولية"><input type="password" value={password} onChange={e => setPassword(e.target.value)} dir="ltr" autoComplete="new-password" minLength={8} maxLength={128} required={!!email.trim()} /></Field></>}<button type="submit" className="primary" disabled={busy || !name.trim()}><Plus size={16} />إضافة</button></div><p className="field-help">لا يمكن إزالة من لديه معاملات مفتوحة، سواء كان مكلّفاً أو ضابط اتصال.</p></form>}</Panel>
      <Panel title="أنواع المعاملات والمهل" subtitle="التعديلات تسري على المعاملات الجديدة فقط" action={<BadgeCheck size={19} className="muted" />}><form onSubmit={async e => { e.preventDefault(); setBusy(true); await run(() => repository.settings(userId, { ...data!.settings, deadlines: days }), 'تم حفظ المهل المعيارية'); setBusy(false); }}><div className="table-wrapper"><table className="data-table deadline-table"><thead><tr><th>النوع</th><th>الرمز</th><th>المهلة (أيام عمل)</th></tr></thead><tbody>{TYPES.map(t => <tr key={t.code}><td data-label="النوع">{t.name}</td><td data-label="الرمز" className="mono">{t.code}</td><td data-label="المهلة"><input aria-label={`مهلة ${t.name}`} type="number" min="1" max="365" step="1" required disabled={!editable} value={days[t.code]} onChange={e => setDays(d => ({ ...d, [t.code]: Number(e.target.value) }))} /></td></tr>)}</tbody></table></div><div className="deadline-footer"><p><Info size={17} />العاجل تُختصر مهلته إلى يومي عمل كحد أقصى، وأيام العمل تستثني الجمعة والسبت.</p>{editable && <button className="primary" type="submit" disabled={busy || JSON.stringify(days) === JSON.stringify(data!.settings.deadlines)}><Save size={16} />حفظ المهل</button>}</div></form></Panel></div>
    <Panel title="آلية العمل المعتمدة" subtitle="دورة موحدة لكل عمل يدخل الإدارة القانونية" action={<CircleCheck size={19} className="green-text" />}><div className="approved-workflow">{[
      ['الاستلام', 'يصل الطلب إلى مدير الإدارة من الجهة المختصة.'], ['التسجيل', 'إصدار رقم وتحديد نوع العمل والمهلة وصيغة التسليم.'], ['التوجيه', 'إحالة المعاملة إلى ضابط الاتصال وتحديد المنفّذ.'], ['التنفيذ', 'تنفيذ المطلوب وتوثيق الإجراءات ورفع الناتج.'], ['المراجعة', 'يراجع المدير الناتج ويعتمده أو يعيده بملاحظات.'], ['الإغلاق', 'تسجيل التسليم واحتساب الإنجاز في المهلة أو بعدها.'],
    ].map(([title, desc], i) => <div key={title}><span className="workflow-number">{i + 1}</span><h3>{title}</h3><p>{desc}</p></div>)}</div></Panel>
    {editing && editable && <Modal title="تعديل المنسوب وحساب الدخول" onClose={() => { if (!busy) setEditing(null); }}><form className="account-binding-form" onSubmit={async event => {
      event.preventDefault(); setBusy(true);
      const { password: newPassword, ...profile } = editing;
      const ok = await run(async () => { await repository.saveEmployee(userId, { ...profile, ...(newPassword ? { password: newPassword } : {}) }); return true; }, 'تم حفظ بيانات المنسوب والحساب');
      setBusy(false); if (ok) setEditing(null);
    }}><Field label="الاسم" required><input required value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })} maxLength={100} disabled={busy} /></Field><Field label="الدور" required><select value={editing.role} onChange={e => setEditing({ ...editing, role: e.target.value as Employee['role'] })} disabled={busy}>{ROLES.map(r => <option key={r}>{r}</option>)}</select></Field><Field label="بريد حساب الدخول"><input type="email" dir="ltr" value={editing.email} onChange={e => setEditing({ ...editing, email: e.target.value })} placeholder="name@thabat.sa" maxLength={254} required={!!editing.password || !!data!.employees.find(e => e.id === editing.id)?.authUserId} disabled={busy} /></Field><Field label="كلمة مرور جديدة"><input type="password" dir="ltr" autoComplete="new-password" value={editing.password} onChange={e => setEditing({ ...editing, password: e.target.value })} minLength={8} maxLength={128} disabled={busy} /><span className="field-help">اتركها فارغة للإبقاء على كلمة المرور الحالية.</span></Field><button className="primary" disabled={busy} type="submit"><Save size={16} />حفظ التعديلات</button></form></Modal>}
    {remove && <Confirm title="إزالة منسوب من الفريق" text={`سيُزال «${remove.name}» من المستخدمين النشطين، مع الاحتفاظ باسمه في المعاملات التاريخية. هل تريد المتابعة؟`} onClose={() => setRemove(null)} onConfirm={async () => { const ok = await run(async () => { await repository.removeEmployee(userId, remove.id); return true; }, 'تمت إزالة المنسوب من الفريق النشط'); if (ok) setRemove(null); }} />}
  </>;
}
