import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowUpLeft, BarChart3, CircleHelp, Files, LayoutDashboard, LogOut, Moon, Plus, Search, Settings2, ShieldCheck, Sun, X } from 'lucide-react';
import { Badge, Empty, Modal } from './components';
import { canRegister, canSee, fullDate, isManager, today } from './domain';
import { Dashboard } from './Dashboard';
import { Details } from './Details';
import { Register } from './Register';
import { Settings } from './Settings';
import { useApp, type Page } from './store';
import { AuthScreen, signOut } from './AuthScreen';
import { BrandLogo } from './BrandLogo';

const Registry = lazy(() => import('./Registry').then(module => ({ default: module.Registry })));
const Reports = lazy(() => import('./Reports').then(module => ({ default: module.Reports })));
const navigation: { page: Page; label: string; icon: typeof Files }[] = [
  { page: 'dashboard', label: 'لوحة المتابعة', icon: LayoutDashboard },
  { page: 'registry', label: 'سجل المعاملات', icon: Files },
  { page: 'register', label: 'تسجيل معاملة', icon: Plus },
  { page: 'reports', label: 'التقارير', icon: BarChart3 },
  { page: 'settings', label: 'الإدارة والإعدادات', icon: Settings2 },
];
export default function App() {
  const { data, error, dark, toggleDark, userId, page, setPage, selectedId, toast, authStatus, passwordRecovery } = useApp();
  const [quick, setQuick] = useState(false);
  const [help, setHelp] = useState(false);
  const [, tick] = useState(0);
  useEffect(() => { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; }, [dark]);
  useEffect(() => {
    const timer = setInterval(() => tick(t => t + 1), 60000);
    const keyboard = (e: KeyboardEvent) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setQuick(q => !q); } };
    window.addEventListener('keydown', keyboard);
    return () => { clearInterval(timer); window.removeEventListener('keydown', keyboard); };
  }, []);
  if (passwordRecovery || authStatus === 'signedOut' || (authStatus === 'ready' && (!data || error))) return <AuthScreen />;
  if (error) return <div className="boot-error"><ShieldCheck size={40} /><h1>تعذر تشغيل مكتب المتابعة</h1><p>{error}</p><button className="primary" onClick={() => location.reload()}>إعادة المحاولة</button></div>;
  if (!data) return <div className="loading-page" aria-busy="true" aria-label="جارٍ تحميل مكتب المتابعة"><div className="skeleton skeleton-header" /><div className="skeleton skeleton-title" /><div className="loading-grid">{Array.from({ length: 8 }, (_, i) => <div key={i} className="skeleton skeleton-kpi" />)}</div><div className="skeleton skeleton-main" /></div>;
  const user = data.employees.find(e => e.id === userId && !e.archived);
  if (!user) return <AuthScreen />;
  const now = today(data.settings);
  const matters = data.matters.filter(m => canSee(user, m));
  const selected = matters.find(m => m.id === selectedId);
  const visibleNav = navigation.filter(item => (item.page !== 'register' || canRegister(user)) && (item.page !== 'reports' || isManager(user)));
  return <>
    <a href="#main" className="skip-link">انتقل إلى المحتوى</a>
    <header className="site-header"><div className="header-content"><button className="brand" onClick={() => setPage('dashboard')} aria-label="العودة إلى لوحة المتابعة"><BrandLogo /><span><strong>مكتب متابعة الإدارة القانونية</strong><small>{fullDate(now)}</small></span></button><div className="header-actions"><button className="quick-search-button" onClick={() => setQuick(true)}><Search size={17} /><span>بحث سريع</span><kbd dir="ltr">Ctrl K</kbd></button><button className="icon-button theme-button" aria-label={dark ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'} onClick={toggleDark}>{dark ? <Sun size={20} /> : <Moon size={20} />}</button><div className="header-divider" /><div className="user-switcher"><span className="user-avatar">{user.name[0]}</span><div className="signed-in-user"><strong>{user.name}</strong><small>{user.role}</small></div></div><button className="icon-button" aria-label="تسجيل الخروج" onClick={() => void signOut()}><LogOut size={18} /></button></div></div>
      <div className="navigation-bar"><nav aria-label="القائمة الرئيسية">{visibleNav.map(item => <button key={item.page} aria-current={page === item.page ? 'page' : undefined} className={page === item.page ? 'active' : ''} onClick={() => setPage(item.page)}><item.icon size={18} /><span>{item.label}</span></button>)}</nav><div className="nav-status"><span className="connection-dot" /><span>التاريخ الفعلي</span></div></div>
    </header>
    <main id="main" className="main-content"><Suspense fallback={<div className="skeleton skeleton-main" aria-busy="true" aria-label="جارٍ تحميل الصفحة" />}>
      {page === 'dashboard' && <Dashboard matters={matters} now={now} />}
      {page === 'registry' && <Registry matters={matters} now={now} />}
      {page === 'register' && <Register now={now} />}
      {page === 'reports' && isManager(user) && <Reports matters={matters} now={now} />}
      {page === 'settings' && <Settings matters={matters} />}
    </Suspense></main>
    <footer className="site-footer"><div><BrandLogo compact />مكتب متابعة الإدارة القانونية<span className="footer-separator">·</span>نظام تنظيم العمل والمتابعة</div><button className="text-button" onClick={() => setHelp(true)}><CircleHelp size={16} />عن النظام ودليل الاستخدام</button><span>الإصدار 1.0</span></footer>
    {toast && <div className={`toast ${toast.error ? 'error' : ''}`} role={toast.error ? 'alert' : 'status'}><ShieldCheck size={19} /><span>{toast.message}</span><button className="icon-button" aria-label="إخفاء الإشعار" onClick={() => useApp.setState({ toast: null })}><X size={16} /></button></div>}
    {selected && <Details key={selected.id} matter={selected} now={now} />}
    {quick && <QuickSearch onClose={() => setQuick(false)} />}
    {help && <Modal title="عن مكتب المتابعة" onClose={() => setHelp(false)}><div className="help-body"><p>نظام عربي لتنظيم أعمال الإدارة القانونية، من الاستلام إلى المراجعة والإغلاق.</p><h3>ابدأ بخطوات واضحة</h3><ol><li>يسجّل المدير المعاملة ويحدد المكلّف وضابط الاتصال والمهلة وصيغة التسليم.</li><li>يتابع ضابط الاتصال التنفيذ، ويوثّق المكلّف الإجراءات في تفاصيل المعاملة.</li><li>يُرفع الناتج للمراجعة، ثم يعتمد المدير الإغلاق.</li><li>استخدم التقارير للتصدير والطباعة ومتابعة التأخر والأداء.</li></ol><p>البحث السريع متاح عبر Ctrl+K، والوضع الداكن من الترويسة.</p><Badge>المهل تستثني الجمعة والسبت</Badge></div></Modal>}
  </>;
}
function QuickSearch({ onClose }: { onClose: () => void }) {
  const { data, userId, open, filterRegistry } = useApp();
  const [query, setQuery] = useState('');
  const user = data!.employees.find(e => e.id === userId)!;
  const results = data!.matters.filter(m => canSee(user, m) && [m.id, m.subject, m.party].some(v => v.toLowerCase().includes(query.trim().toLowerCase()))).slice(0, 8);
  return <Modal title="البحث السريع" onClose={onClose}><div className="quick-search-content"><div className="search-field"><Search size={19} /><input autoFocus value={query} onChange={e => setQuery(e.target.value)} aria-label="البحث السريع بالرقم أو الموضوع" placeholder="رقم المعاملة أو الموضوع أو الطرف" /></div><p className="field-help">ابحث ضمن المعاملات المتاحة لدورك الحالي</p><div className="quick-results">{results.map(m => <button key={m.id} onClick={() => { onClose(); open(m); }}><Files size={18} /><div><span className="mono">{m.id}</span><strong>{m.subject}</strong></div><ArrowUpLeft size={17} /></button>)}</div>{!results.length && <Empty text="لم يُعثر على معاملات مطابقة" />}<button className="secondary" onClick={() => { filterRegistry({ query }); onClose(); }}>عرض النتائج في السجل</button></div></Modal>;
}
