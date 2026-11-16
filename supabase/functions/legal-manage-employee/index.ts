import { createClient } from 'npm:@supabase/supabase-js@2.89.0';

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
  'Cache-Control': 'no-store',
};
const respond = (status: number, error?: string) =>
  new Response(JSON.stringify(error ? { error } : { success: true }), { status, headers });
const safeError = (message: string) => /[\u0600-\u06ff]/.test(message)
  ? message : 'تعذر حفظ الحساب؛ تحقق من البيانات وأعد المحاولة.';

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') return respond(405, 'الطلب غير مسموح.');
  const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) return respond(401, 'سجّل الدخول أولاً.');
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  try {
    const { data: identity, error: identityError } = await admin.auth.getUser(token);
    if (identityError) {
      const status = identityError.status;
      if (identityError.name === 'AuthRetryableFetchError' || status === 0 || status === 429 || (status && status >= 500)) {
        return respond(503, 'تعذر التحقق من جلسة الدخول حالياً؛ أعد المحاولة.');
      }
      return respond(401, 'انتهت جلسة الدخول؛ سجّل الدخول مجدداً.');
    }
    if (!identity.user) return respond(401, 'انتهت جلسة الدخول؛ سجّل الدخول مجدداً.');
    const text = await request.text();
    if (text.length > 16000) return respond(413, 'بيانات الطلب أكبر من المسموح.');
    let input: Record<string, unknown>;
    try { input = JSON.parse(text); } catch { return respond(400, 'بيانات الطلب غير صالحة.'); }
    if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['id', 'name', 'role', 'email', 'password'].includes(key)) ||
      typeof input.name !== 'string' || typeof input.role !== 'string' ||
      (input.id !== undefined && (typeof input.id !== 'string' || !input.id || input.id.length > 100)) ||
      (input.email !== undefined && typeof input.email !== 'string') ||
      (input.password !== undefined && typeof input.password !== 'string')) return respond(400, 'بيانات المنسوب غير صالحة.');
    const password = input.password as string | undefined;
    if (password && (password.length < 8 || password.length > 128 ||
      !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password))) {
      return respond(400, 'كلمة المرور من 8 إلى 128 حرفاً وتشمل حرفاً كبيراً وصغيراً ورقماً ورمزاً.');
    }
    const payload = {
      id: input.id,
      name: input.name.trim(),
      role: input.role,
      email: (input.email as string | undefined)?.trim().toLowerCase() || null,
      create: !input.id,
    };
    if (password && !payload.email) return respond(400, 'أدخل البريد عند تعيين كلمة المرور.');
    // The database rechecks the signed-in actor, role constraints, and account ownership.
    const { data: plan, error: validationError } = await admin.rpc('legal_manage_employee', {
      actor_id: identity.user.id, payload, validate_only: true,
    });
    if (validationError) return respond(validationError.code === '42501' ? 403 : 400, safeError(validationError.message));
    let accountId: string | null = plan.authUserId;
    let created = false;
    let emailChanged = false;
    if (payload.email && !accountId) {
      if (!password) return respond(400, 'أدخل كلمة مرور لإنشاء حساب الدخول الجديد.');
      const { data, error } = await admin.auth.admin.createUser({
        email: payload.email, password, email_confirm: true,
        user_metadata: { display_name: payload.name },
      });
      if (error || !data.user) return respond(400, 'تعذر إنشاء الحساب؛ تحقق من البريد وكلمة المرور.');
      accountId = data.user.id;
      created = true;
    } else if (accountId && plan.previousEmail && plan.previousEmail.toLowerCase() !== payload.email) {
      const { error } = await admin.auth.admin.updateUserById(accountId, { email: payload.email!, email_confirm: true });
      if (error) return respond(400, 'تعذر تغيير البريد؛ قد يكون مستخدماً لحساب آخر.');
      emailChanged = true;
    }
    const { error: saveError } = await admin.rpc('legal_manage_employee', {
      actor_id: identity.user.id,
      payload: { ...payload, id: plan.id, before: plan.before },
      validate_only: false,
    });
    if (saveError) {
      // Compensate Authentication changes if the profile transaction was rejected.
      let compensationFailed = false;
      if (created && accountId) {
        const { data: owners, error: ownerError } = await admin.from('legal_employees')
          .select('id').eq('auth_user_id', accountId);
        if (ownerError || owners?.length) compensationFailed = true;
        else {
          const { error } = await admin.auth.admin.deleteUser(accountId);
          compensationFailed = !!error;
        }
      } else if (emailChanged && accountId) {
        const { data, error: readError } = await admin.auth.admin.getUserById(accountId);
        if (readError || data.user?.email !== payload.email) compensationFailed = true;
        else {
          const { error } = await admin.auth.admin.updateUserById(accountId, {
            email: plan.previousEmail, email_confirm: true,
          });
          compensationFailed = !!error;
        }
      }
      return respond(409, compensationFailed
        ? 'تعذر حفظ بيانات المنسوب واستعادة حالة حسابه؛ راجع الحساب قبل إعادة المحاولة.'
        : safeError(saveError.message));
    }
    if (accountId) {
      const { data: account, error: readError } = await admin.auth.admin.getUserById(accountId);
      if (readError || !account.user) return respond(409, 'حُفظت بيانات المنسوب، لكن تعذر تحديث حساب الدخول.');
      const { error } = await admin.auth.admin.updateUserById(accountId, {
        user_metadata: { ...account.user.user_metadata, display_name: payload.name },
        ...(!created && password ? { password } : {}),
      });
      if (error) return respond(409, 'حُفظت بيانات المنسوب، لكن تعذر تحديث كلمة المرور أو بيانات حساب الدخول.');
      const { error: auditError } = await admin.rpc('legal_record_account_change', {
        actor_id: identity.user.id, employee_id: plan.id, password_changed: !!password,
      });
      if (auditError) return respond(409, 'حُفظت بيانات الحساب، لكن تعذر توثيق إجراء الحساب؛ راجع سجل الإدارة.');
    }
    return respond(200);
  } catch {
    return respond(500, 'تعذر إتمام العملية؛ أعد تحميل بيانات المنسوب قبل المحاولة مجدداً.');
  }
});
