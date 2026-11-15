import { useState, type FormEvent } from 'react';
import { ArrowRight, LockKeyhole, LogIn, LogOut, Mail } from 'lucide-react';
import { supabase, configurationError } from './supabase';
import { useApp } from './store';
import { BrandLogo } from './BrandLogo';

export async function signOut() {
  const result = await supabase?.auth.signOut();
  if (result?.error) useApp.getState().notify('تعذر تسجيل الخروج. تحقق من الاتصال ثم أعد المحاولة.', true);
}
export function AuthScreen() {
  const { error, sessionUserId, sessionEmail, passwordRecovery } = useApp();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [reset, setReset] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!supabase || busy) return;
    setBusy(true); setMessage(''); setFailed(false);
    try {
      if (passwordRecovery) {
        if (password !== confirm) throw new Error('كلمتا المرور غير متطابقتين.');
        const result = await supabase.auth.updateUser({ password });
        if (result.error) throw new Error('تعذر تغيير كلمة المرور. استخدم كلمة قوية من 8 أحرف على الأقل، أو اطلب رابطًا جديدًا.');
        useApp.setState({ passwordRecovery: false });
      } else if (reset) {
        const result = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
        if (result.error) throw new Error('تعذر إرسال رابط الاستعادة. تحقق من إعداد البريد وحدود الإرسال.');
        setMessage('إذا كان البريد مرتبطًا بحساب، ستصلك رسالة لاستعادة كلمة المرور.');
      } else {
        const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (result.error) {
          if (result.error.code === 'email_not_confirmed') throw new Error('يجب تأكيد البريد الإلكتروني قبل تسجيل الدخول.');
          if (result.error.status === 429) throw new Error('محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.');
          throw new Error('تعذر تسجيل الدخول. تحقق من البريد وكلمة المرور والاتصال.');
        }
        setPassword('');
      }
    } catch (cause) { setFailed(true); setMessage(cause instanceof Error ? cause.message : 'تعذر إتمام الطلب.'); }
    finally { setBusy(false); }
  };
  const pendingAccount = !!sessionUserId && !passwordRecovery;
  return <main className="auth-page"><section className="auth-intro"><div className="auth-brand"><BrandLogo /><strong>مكتب متابعة الإدارة القانونية</strong></div><div><h1>مكتب متابعة<br />الإدارة القانونية</h1><p>الاستلام، التسجيل، التوجيه، التنفيذ، المراجعة، الإغلاق.</p></div></section>
    <section className="auth-card"><div className="auth-icon"><LockKeyhole size={27} /></div><h2>{passwordRecovery ? 'تعيين كلمة مرور جديدة' : pendingAccount ? 'تهيئة الوصول إلى مكتب المتابعة' : reset ? 'استعادة كلمة المرور' : 'تسجيل الدخول'}</h2><p>{pendingAccount ? `تم تسجيل الدخول بالبريد ${sessionEmail}.` : 'استخدم حسابك المعتمد لدى الإدارة القانونية.'}</p>
      {error && <div className="error-message" role="alert">{error}</div>}
      {pendingAccount ? <><div className="actions"><button className="primary" onClick={() => location.reload()}>إعادة تحميل البيانات</button><button className="secondary" onClick={() => void signOut()}><LogOut size={16} />تسجيل الخروج</button></div></> : <form onSubmit={submit}>
        {!passwordRecovery && <label className="field"><span><Mail size={14} />البريد الإلكتروني</span><input type="email" required autoComplete="username" dir="ltr" value={email} onChange={e => setEmail(e.target.value)} disabled={busy || !!configurationError} /></label>}
        {(!reset || passwordRecovery) && <label className="field"><span>كلمة المرور{passwordRecovery ? ' الجديدة' : ''}</span><input type="password" required minLength={passwordRecovery ? 8 : 1} autoComplete={passwordRecovery ? 'new-password' : 'current-password'} dir="ltr" value={password} onChange={e => setPassword(e.target.value)} disabled={busy || !!configurationError} /></label>}
        {passwordRecovery && <label className="field"><span>تأكيد كلمة المرور</span><input type="password" required minLength={8} autoComplete="new-password" dir="ltr" value={confirm} onChange={e => setConfirm(e.target.value)} disabled={busy} /></label>}
        {message && <p className={failed ? 'error-message' : 'info-banner'} role={failed ? 'alert' : 'status'}>{message}</p>}
        <button className="primary auth-submit" type="submit" disabled={busy || !!configurationError}><LogIn size={17} />{busy ? 'جارٍ تنفيذ الطلب...' : passwordRecovery ? 'حفظ كلمة المرور' : reset ? 'إرسال رابط الاستعادة' : 'الدخول إلى مكتب المتابعة'}</button>
        {!passwordRecovery && <button className="text-button" type="button" disabled={busy} onClick={() => { setReset(!reset); setMessage(''); setPassword(''); }}><ArrowRight size={14} />{reset ? 'العودة إلى تسجيل الدخول' : 'نسيت كلمة المرور؟'}</button>}
      </form>}
    </section>
  </main>;
}
