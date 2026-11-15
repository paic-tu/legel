import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ArrowUpLeft, Check, CircleCheck, FileSearch, X } from 'lucide-react';
import { n, status, type Matter } from './domain';
import { useApp } from './store';

export function Badge({ tone = 'green', children }: { tone?: string; children: ReactNode }) { return <span className={`badge ${tone}`}><span className="badge-dot" />{children}</span>; }
export function StatusBadge({ matter, now }: { matter: Matter; now: string }) { const s = status(matter, now); return <Badge tone={s.tone}>{s.text}</Badge>; }
export function Panel({ title, subtitle, children, action, className = '' }: { title: string; subtitle?: string; children: ReactNode; action?: ReactNode; className?: string }) {
  return <section className={`panel ${className}`}><div className="panel-heading"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>;
}
export function Empty({ text = 'لا توجد معاملات تطابق هذه القائمة', action }: { text?: string; action?: ReactNode }) { return <div className="empty"><FileSearch size={32} /><h3>{text}</h3><p>يمكنك تغيير التصفية أو العودة إلى السجل الكامل.</p>{action}</div>; }
function AnimatedNumber({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const previous = useRef(0);
  useEffect(() => {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setDisplay(value); previous.current = value; return; }
    const from = previous.current;
    const start = performance.now();
    let frame: number;
    const tick = (time: number) => { const fraction = Math.min(1, (time - start) / 450); const next = fraction === 1 ? value : Math.round(from + (value - from) * fraction); previous.current = next; setDisplay(next); if (fraction < 1) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{n(display)}</>;
}
export function Kpi({ label, value, tone = 'green', hint, icon, suffix, onClick }: { label: string; value: number; tone?: string; hint?: string; icon?: ReactNode; suffix?: string; onClick?: () => void }) {
  const content = <><div className="kpi-top"><span>{label}</span>{icon && <span className={`kpi-icon ${tone}`}>{icon}</span>}</div><div className={`kpi-value ${tone}`}><AnimatedNumber value={value} />{suffix && <small>{suffix}</small>}</div><div className="kpi-hint">{hint || 'وفق البيانات المسجلة'}{onClick && <ArrowUpLeft size={13} />}</div></>;
  return onClick ? <button type="button" className="kpi" onClick={onClick}>{content}</button> : <div className="kpi">{content}</div>;
}
export function Bar({ total, late, max }: { total: number; late: number; max: number }) {
  return <div className="bar-track" role="img" aria-label={`${total} إجمالي، منها ${late} متأخرة`}><div className="bar-fill" style={{ width: `${max ? total / max * 100 : 0}%` }}><span className="bar-late" style={{ width: `${total ? late / total * 100 : 0}%` }} /></div></div>;
}
export function Legend() { return <div className="legend"><span><i className="green-dot" />في المهلة</span><span><i className="red-dot" />متأخرة</span></div>; }
export function Modal({ title, children, onClose, wide = false, drawer = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean; drawer?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const handler = (e: KeyboardEvent) => {
      const dialogs = document.querySelectorAll('[role="dialog"]');
      if (dialogs[dialogs.length - 1] !== ref.current) return;
      if (e.key === 'Escape') { e.stopPropagation(); closeRef.current(); }
      if (e.key !== 'Tab') return;
      const focusable = Array.from(ref.current?.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') || []);
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (!first) { e.preventDefault(); return; }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === ref.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', handler);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', handler); previous?.focus(); };
  }, []);
  return <div className={`overlay ${drawer ? 'drawer-overlay' : ''}`} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}><div ref={ref} className={`modal ${wide ? 'wide' : ''} ${drawer ? 'drawer' : ''}`} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="إغلاق النافذة" onClick={onClose}><X size={20} /></button></div>{children}</div></div>;
}
export function Confirm({ title, text, onClose, onConfirm }: { title: string; text: string; onClose: () => void; onConfirm: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return <Modal title={title} onClose={onClose}><div className="confirmation"><CircleCheck size={36} /><p>{text}</p><div className="actions"><button className="primary" disabled={busy} onClick={async () => { setBusy(true); try { await onConfirm(); } finally { setBusy(false); } }}><Check size={16} />{busy ? 'جارٍ التنفيذ...' : 'تأكيد الإجراء'}</button><button className="secondary" onClick={onClose} disabled={busy}>إلغاء</button></div></div></Modal>;
}
export function MatterList({ matters, now }: { matters: Matter[]; now: string }) {
  const { data, open } = useApp();
  if (!matters.length) return <Empty text="لا توجد معاملات في هذه القائمة" />;
  return <div className="matter-list">{matters.map(m => <button className="matter-row" key={m.id} onClick={() => open(m)}><div className="matter-summary"><span className="mono">{m.id}</span><strong>{m.subject}</strong><small>{data?.employees.find(e => e.id === m.assigneeId)?.name} <span>·</span> {m.due}</small></div><StatusBadge matter={m} now={now} /><ArrowUpLeft size={17} className="muted" /></button>)}</div>;
}
