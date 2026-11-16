import { ArrowUpLeft, BriefcaseBusiness, CalendarClock, CircleCheck, Clock3, Files, Scale, Users, Wallet, Workflow } from 'lucide-react';
import { Badge, Bar, Kpi, Legend, MatterList, Panel } from './components';
import { isManager, metrics, n, overdue, PRIORITIES, priorityKey, STAGES, TYPES } from './domain';
import { useApp } from './store';
import type { Matter } from './domain';

export function Dashboard({ matters, now }: { matters: Matter[]; now: string }) {
  const { data, filterRegistry, setPage } = useApp();
  const stats = metrics(matters, now);
  const employees = data!.employees.filter(e => !isManager(e) && !e.archived);
  const types = TYPES.map(t => ({ ...t, total: stats.open.filter(m => m.type === t.code).length, late: stats.late.filter(m => m.type === t.code).length }));
  const workloads = employees.map(e => ({ ...e, total: stats.open.filter(m => m.assigneeId === e.id).length, late: stats.late.filter(m => m.assigneeId === e.id).length }));
  const stages = STAGES.map((s, index) => ({ name: index === 4 ? 'مغلقة هذا الشهر' : s, count: index === 4 ? stats.done.length : stats.open.filter(m => m.stage === s).length }));
  const largest = stats.open.filter(m => m.type === 'EXE').sort((a, b) => b.amount - a.amount).slice(0, 3);
  return <>
    <div className="page-heading"><div><div className="eyebrow"><span />قسم الإدارة القانونية</div><h1>الصورة الشاملة</h1><p>كل أعمال الإدارة القانونية، في رؤية واحدة واضحة.</p></div><div className="heading-meta"><Badge>البيانات محدّثة</Badge><span className="muted">المتابعة تبدأ من هنا</span></div></div>
    <div className="kpi-grid dashboard-kpis">
      <Kpi label="المعاملات المفتوحة" value={stats.open.length} icon={<Files size={17} />} hint="جميع الأعمال الجارية" onClick={() => filterRegistry({ status: 'open' })} />
      <Kpi label="متأخرة عن المهلة" value={stats.late.length} tone="red" icon={<Clock3 size={17} />} hint="تتطلب متابعة مباشرة" onClick={() => filterRegistry({ status: 'late' })} />
      <Kpi label="تستحق خلال 3 أيام" value={stats.soon.length} tone="amber" icon={<CalendarClock size={17} />} hint="استحقاقات قريبة" onClick={() => filterRegistry({ status: 'soon' })} />
      <Kpi label="قضايا قائمة" value={stats.open.filter(m => m.type === 'CAS').length} icon={<Scale size={17} />} hint="قضايا مفتوحة" onClick={() => filterRegistry({ status: 'open', type: 'CAS' })} />
      <Kpi label="دراسات جارية" value={stats.open.filter(m => m.type === 'STD').length} icon={<BriefcaseBusiness size={17} />} hint="دراسات قيد العمل" onClick={() => filterRegistry({ status: 'open', type: 'STD' })} />
      <Kpi label="الالتزام هذا الشهر" value={stats.adherence} suffix="%" tone={stats.adherence >= 85 ? 'green' : 'amber'} icon={<CircleCheck size={17} />} hint="المستهدف 85% فأكثر" onClick={() => setPage('reports')} />
      <Kpi label="مبالغ قيد التنفيذ" value={stats.executionMoney} suffix="ر.س" tone="amber" icon={<Wallet size={17} />} hint="ملفات التنفيذ المفتوحة" onClick={() => filterRegistry({ status: 'open', type: 'EXE' })} />
      <Kpi label="منسوبو الإدارة" value={employees.length} icon={<Users size={17} />} hint="الفريق القانوني" onClick={() => setPage('settings')} />
    </div>
    <div className="overview-grid">
      <Panel title="مصفوفة الأولوية" subtitle="ابدأ بالأهم، ووجّه جهد الفريق بوضوح" action={<span className="panel-symbol"><Scale size={19} /></span>}>
        <div className="matrix"><div className="matrix-axis"><span>الأهمية / الاستعجال</span><span>عاجل</span><span>غير عاجل</span></div><div className="matrix-body"><span className="axis-label">مهم</span>{PRIORITIES.slice(0, 2).map(p => <button key={p.key} className={`matrix-cell ${p.tone}`} onClick={() => filterRegistry({ priority: p.key, status: 'open' })}><div><span>{p.action}</span><ArrowUpLeft size={16} /></div><strong>{stats.open.filter(m => priorityKey(m) === p.key).length}</strong><small>{p.title}</small></button>)}<span className="axis-label">غير مهم</span>{PRIORITIES.slice(2).map(p => <button key={p.key} className={`matrix-cell ${p.tone}`} onClick={() => filterRegistry({ priority: p.key, status: 'open' })}><div><span>{p.action}</span><ArrowUpLeft size={16} /></div><strong>{stats.open.filter(m => priorityKey(m) === p.key).length}</strong><small>{p.title}</small></button>)}</div></div>
      </Panel>
      <Panel title="مراحل سير العمل" subtitle="رحلة المعاملة من الاستلام إلى الإغلاق" action={<span className="panel-symbol"><Workflow size={19} /></span>}>
        <div className="stage-grid">{stages.map((s, i) => <button key={s.name} onClick={() => filterRegistry({ stage: STAGES[i], ...(i === 4 ? { status: 'closedMonth' } : {}) })} className={`stage-card stage-${i}`}><span className="stage-step">{String(i + 1).padStart(2, '0')}</span><strong>{s.count}</strong><span>{s.name}</span><div className="stage-mini-bar" /></button>)}</div>
        <div className="workflow-strip"><span>الاستلام</span><span>التسجيل</span><span>التوجيه</span><span>التنفيذ</span><span>المراجعة</span><span>الإغلاق</span></div>
        <div className="policy-note"><CircleCheck size={16} /><span>لا إغلاق إلا بعد مراجعة المدير واعتماد الناتج.</span></div>
      </Panel>
    </div>
    <div className="analytics-grid">
      <Panel title="المعاملات المفتوحة حسب النوع" subtitle="حجم العمل ومواطن التأخر" action={<Legend />}>
        <div className="chart-list">{types.map(t => <button className="chart-row" key={t.code} onClick={() => filterRegistry({ type: t.code, status: 'open' })}><span className="chart-label">{t.name}</span><Bar total={t.total} late={t.late} max={Math.max(...types.map(t => t.total), 1)} /><span className="chart-number">{t.total}</span></button>)}</div>
      </Panel>
      <Panel title="حمل العمل على الفريق" subtitle="توزيع المعاملات على المكلّفين" action={<Legend />}>
        <div className="chart-list team-chart">{workloads.map(e => <button className="chart-row" key={e.id} onClick={() => filterRegistry({ assignee: e.id, status: 'open' })}><div className="team-name"><span className="avatar">{e.name[0]}</span><span>{e.name}<small>{e.role}</small></span></div><Bar total={e.total} late={e.late} max={Math.max(...workloads.map(e => e.total), 1)} /><span className="chart-number" dir="ltr">{e.late > 0 ? <><span className="red-text">{e.late}</span> · {e.total}</> : e.total}</span></button>)}</div>
        <p className="chart-footnote">الأرقام: المتأخر · الإجمالي</p>
      </Panel>
      <Panel title="المبالغ والمطالبات" subtitle="القيمة المالية للملفات المفتوحة" action={<Wallet size={18} className="amber-text" />}>
        <div className="money-summary">{[['مبالغ قيد التنفيذ', stats.executionMoney], ['مبالغ قضايا قائمة', stats.caseMoney], ['مطالبات أخرى مفتوحة', stats.otherMoney]].map(([label, value]) => <div key={label}><span>{label}</span><strong dir="ltr">{n(Number(value))} <small>ر.س</small></strong></div>)}</div>
        <h3 className="small-heading">أكبر ملفات التنفيذ</h3><div className="largest-files">{largest.map((m, i) => <button key={m.id} onClick={() => useApp.getState().open(m)}><span className="rank">{i + 1}</span><div><span className="mono">{m.id}</span><small>{m.subject}</small></div><strong>{n(m.amount)}</strong></button>)}</div>
      </Panel>
    </div>
    <div className="overview-grid bottom-lists">
      <Panel title="متأخرة عن المهلة" subtitle="مرتبة بدءاً من أقدم استحقاق" action={<Badge tone="red">{stats.late.length} معاملات</Badge>}><MatterList matters={[...stats.late].sort((a, b) => a.due.localeCompare(b.due))} now={now} /></Panel>
      <Panel title="تستحق خلال 3 أيام" subtitle="استبق الموعد، وأكمل الإجراء في وقته" action={<Badge tone="amber">{stats.soon.length} معاملات</Badge>}><MatterList matters={[...stats.soon].sort((a, b) => a.due.localeCompare(b.due))} now={now} /></Panel>
    </div>
    <div className="dashboard-bottom"><Scale size={16} /><span>لا عمل بلا رقم. لا معاملة بلا مسؤول ومهلة وصيغة تسليم.</span><span>سياسة تنظيم العمل</span></div>
  </>;
}
