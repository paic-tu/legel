begin;

create schema if not exists legal_private;
revoke all on schema legal_private from public, anon, authenticated;

create table public.legal_employees (
  id text primary key default gen_random_uuid()::text,
  name text not null unique check (length(btrim(name)) between 1 and 100),
  role text not null check (role in ('مدير الإدارة القانونية','ضابط الاتصال','مستشار قانوني','محامٍ','باحث قانوني','متدرب')),
  archived boolean not null default false,
  auth_user_id uuid unique references auth.users(id) on delete set null
);

create table public.legal_settings (
  id boolean primary key default true check (id),
  demo boolean not null default false,
  deadlines jsonb not null
);
insert into public.legal_settings (deadlines)
values ('{"CAS":5,"EXE":7,"CON":3,"OPN":2,"LTR":1,"STD":7,"INV":5,"TSK":3}');

create table public.legal_matters (
  id text primary key check (id ~ '^(CAS|EXE|CON|OPN|LTR|STD|INV|TSK)-[0-9]{2}-[0-9]{4}$'),
  data jsonb not null check (
    jsonb_typeof(data) = 'object' and data->>'id' = id and jsonb_typeof(data->'audit') = 'array'
  ),
  liaison_id text generated always as (data->>'liaisonId') stored not null references public.legal_employees(id),
  assignee_id text generated always as (data->>'assigneeId') stored not null references public.legal_employees(id),
  stage text generated always as (data->>'stage') stored not null
    check (stage in ('مستلمة','لدى ضابط الاتصال','قيد التنفيذ','قيد المراجعة','مغلقة'))
);
create index legal_matters_liaison on public.legal_matters(liaison_id);
create index legal_matters_assignee on public.legal_matters(assignee_id);
create index legal_matters_stage on public.legal_matters(stage);
create index legal_matters_due on public.legal_matters ((data->>'due'));

create table public.legal_counters (
  type text not null,
  year text not null,
  value integer not null check (value between 0 and 9999),
  primary key (type, year)
);

create table public.legal_admin_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  actor uuid not null,
  action text not null,
  details jsonb not null default '{}'
);

alter table public.legal_employees enable row level security;
alter table public.legal_settings enable row level security;
alter table public.legal_matters enable row level security;
alter table public.legal_counters enable row level security;
alter table public.legal_admin_events enable row level security;

create function legal_private.is_member() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.legal_employees where auth_user_id = auth.uid() and not archived); $$;

create function legal_private.is_manager() returns boolean
language sql stable security definer set search_path = ''
as $$ select exists(select 1 from public.legal_employees where auth_user_id = auth.uid() and not archived and role = 'مدير الإدارة القانونية'); $$;

create function legal_private.can_read(liaison text, assignee text) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.legal_employees e
    where e.auth_user_id = auth.uid() and not e.archived
      and (e.role = 'مدير الإدارة القانونية' or e.id = assignee or (e.role = 'ضابط الاتصال' and e.id = liaison))
  );
$$;

create policy legal_employee_read on public.legal_employees for select to authenticated
using (legal_private.is_member());
create policy legal_settings_read on public.legal_settings for select to authenticated
using (legal_private.is_member());
create policy legal_matter_read on public.legal_matters for select to authenticated
using (legal_private.can_read(liaison_id, assignee_id));
create policy legal_admin_read on public.legal_admin_events for select to authenticated
using (legal_private.is_manager());

-- Clients cannot write tables. All mutations pass through the authenticated RPC.
revoke all on public.legal_employees, public.legal_settings, public.legal_matters,
  public.legal_counters, public.legal_admin_events from anon, authenticated;
grant select on public.legal_employees, public.legal_settings, public.legal_matters,
  public.legal_admin_events to authenticated;

create function legal_private.workday_due(received date, days integer) returns date
language plpgsql immutable set search_path = ''
as $$
declare cursor_date date := received; remaining integer := days;
begin
  if days < 0 or days > 365 then raise exception 'عدد أيام العمل غير صالح'; end if;
  while remaining > 0 loop
    cursor_date := cursor_date + 1;
    if extract(dow from cursor_date) not in (5,6) then remaining := remaining - 1; end if;
  end loop;
  return cursor_date;
end;
$$;

create function legal_private.validate_matter(m jsonb) returns void
language plpgsql set search_path = ''
as $$
declare received_date date; due_date date; closed_date date;
begin
  if jsonb_typeof(m) is distinct from 'object' then raise exception 'بيانات المعاملة غير صالحة'; end if;
  if coalesce(m->>'type','') not in ('CAS','EXE','CON','OPN','LTR','STD','INV','TSK') then raise exception 'نوع المعاملة غير معروف'; end if;
  if length(btrim(coalesce(m->>'subject',''))) not between 1 and 500 then raise exception 'الموضوع مطلوب، وبحد أقصى 500 حرف'; end if;
  if length(btrim(coalesce(m->>'source',''))) not between 1 and 200 then raise exception 'جهة الإحالة مطلوبة'; end if;
  if length(coalesce(m->>'description','')) > 5000 then raise exception 'التكليف يتجاوز 5000 حرف'; end if;
  if jsonb_typeof(m->'important') is distinct from 'boolean' or jsonb_typeof(m->'urgent') is distinct from 'boolean' then raise exception 'الأهمية والاستعجال مطلوبان'; end if;
  if coalesce(m->>'stage','') not in ('مستلمة','لدى ضابط الاتصال','قيد التنفيذ','قيد المراجعة','مغلقة') then raise exception 'مرحلة المعاملة غير معروفة'; end if;
  if not exists (select 1 from public.legal_employees where id = m->>'assigneeId' and (not archived or m->>'stage' = 'مغلقة')) then raise exception 'يجب تحديد مكلّف موجود ونشط'; end if;
  if not exists (select 1 from public.legal_employees where id = m->>'liaisonId' and role in ('ضابط الاتصال','مدير الإدارة القانونية') and (not archived or m->>'stage' = 'مغلقة')) then raise exception 'يجب تحديد ضابط اتصال مؤهل'; end if;
  if coalesce(m->>'received','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(m->>'due','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'تاريخ الاستلام وآخر موعد مطلوبان'; end if;
  begin
    received_date := (m->>'received')::date;
    due_date := (m->>'due')::date;
  exception when others then raise exception 'التاريخ غير صالح'; end;
  if due_date < received_date then raise exception 'آخر موعد لا يسبق تاريخ الاستلام'; end if;
  if coalesce(m->>'id','') !~ ('^' || (m->>'type') || '-' || to_char(received_date,'YY') || '-[0-9]{4}$') then raise exception 'رقم المعاملة لا يطابق النوع وسنة الاستلام'; end if;
  if coalesce(m->>'delivery','') not in ('مذكرة','لائحة','خطاب','رأي مكتوب','دراسة','تقرير','إجراء في منصة') then raise exception 'صيغة التسليم مطلوبة ومعتمدة'; end if;
  if jsonb_typeof(m->'amount') is distinct from 'number' then raise exception 'المبلغ يجب أن يكون رقماً'; end if;
  if (m->>'amount')::numeric < 0 or (m->>'amount')::numeric > 1000000000000000 then raise exception 'المبلغ غير صالح أو يتجاوز الحد المسموح'; end if;
  if coalesce(m->>'standardDays','') !~ '^[0-9]+$' then raise exception 'المهلة المعيارية يجب أن تكون عدداً صحيحاً'; end if;
  if (m->>'standardDays')::integer not between 1 and 365 then raise exception 'المهلة المعيارية يجب أن تكون بين 1 و365 يوم عمل'; end if;
  if m->>'stage' = 'مغلقة' then
    if coalesce(m->>'closed','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'تاريخ الإغلاق مطلوب للمعاملة المغلقة'; end if;
    begin closed_date := (m->>'closed')::date;
    exception when others then raise exception 'تاريخ الإغلاق غير صالح'; end;
    if closed_date < received_date then raise exception 'تاريخ الإغلاق لا يسبق الاستلام'; end if;
  elsif nullif(m->>'closed','') is not null then raise exception 'المعاملة المفتوحة لا تحمل تاريخ إغلاق';
  end if;
end;
$$;

create function legal_private.append_audit(m jsonb, actor_name text, action_text text, old_value text default null, new_value text default null)
returns jsonb language sql volatile set search_path = ''
as $$
  select jsonb_set(m, '{audit}', coalesce(m->'audit','[]'::jsonb) || jsonb_build_array(
    jsonb_strip_nulls(jsonb_build_object(
      'id', gen_random_uuid()::text, 'at', to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
      'actor', actor_name, 'action', action_text, 'old', old_value, 'next', new_value
    ))
  ));
$$;

create function public.legal_load() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  if not legal_private.is_member() then raise exception 'الحساب غير مرتبط بمنسوب نشط؛ تواصل مع مدير الإدارة' using errcode = '42501'; end if;
  select jsonb_build_object(
    'employees', (select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id, 'name', e.name, 'role', e.role, 'archived', e.archived,
      'authUserId', case when e.auth_user_id = auth.uid() or legal_private.is_manager() then e.auth_user_id else null end
    ) order by e.name), '[]') from public.legal_employees e),
    'matters', (select coalesce(jsonb_agg(m.data order by m.id), '[]') from public.legal_matters m where legal_private.can_read(m.liaison_id,m.assignee_id)),
    'settings', (select jsonb_build_object('demo',s.demo,'deadlines',s.deadlines,
      'serverToday',case when s.demo then '2026-10-25' else ((current_timestamp at time zone 'Asia/Riyadh')::date)::text end
    ) from public.legal_settings s where id)
  ) into result;
  return result;
end;
$$;

create function public.legal_execute(operation text, payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  actor public.legal_employees%rowtype;
  config public.legal_settings%rowtype;
  m jsonb; candidate jsonb; item jsonb; changes jsonb; entry jsonb;
  target text; key_name text; label_text text; old_value text; new_value text;
  next_stage text; kind text; year_part text; next_value integer; imported integer := 0;
  now_date date; received_date date; days integer; account uuid; employee_id text;
begin
  if auth.uid() is null then raise exception 'تسجيل الدخول مطلوب' using errcode = '42501'; end if;
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'طلب غير صالح'; end if;
  -- One office-wide lock serializes numbering and role/assignment changes.
  select * into config from public.legal_settings where id for update;
  select * into actor from public.legal_employees where auth_user_id = auth.uid() and not archived;
  if not found then raise exception 'الحساب غير مرتبط بمنسوب نشط' using errcode = '42501'; end if;
  now_date := case when config.demo then date '2026-10-25' else (current_timestamp at time zone 'Asia/Riyadh')::date end;
  if operation in ('register','addEmployee','bindAccount','removeEmployee','settings','import')
    and actor.role <> 'مدير الإدارة القانونية' then raise exception 'هذه العملية متاحة لمدير الإدارة فقط' using errcode = '42501'; end if;

  if operation = 'register' then
    kind := payload->>'type';
    if kind is null or not config.deadlines ? kind then raise exception 'نوع المعاملة غير معروف'; end if;
    if jsonb_typeof(payload->'urgent') is distinct from 'boolean' then raise exception 'الاستعجال مطلوب'; end if;
    received_date := now_date;
    days := (config.deadlines->>kind)::integer;
    if (payload->>'urgent')::boolean then days := least(days,2); end if;
    year_part := to_char(received_date,'YY');
    insert into public.legal_counters(type,year,value)
      values(kind,year_part,1)
      on conflict (type,year) do update set value = public.legal_counters.value + 1
      returning value into next_value;
    if next_value > 9999 then raise exception 'اكتمل نطاق الترقيم لهذا النوع والسنة'; end if;
    target := kind || '-' || year_part || '-' || lpad(next_value::text,4,'0');
    candidate := jsonb_build_object(
      'id', target, 'type', kind, 'subject', btrim(payload->>'subject'), 'source', btrim(payload->>'source'),
      'party', coalesce(payload->>'party',''), 'liaisonId', payload->>'liaisonId', 'assigneeId', payload->>'assigneeId',
      'important', payload->'important', 'urgent', payload->'urgent',
      'received', received_date::text,
      'due', coalesce(nullif(payload->>'due',''), legal_private.workday_due(received_date,days)::text),
      'stage', 'لدى ضابط الاتصال', 'amount', coalesce(payload->'amount','0'::jsonb),
      'delivery', payload->>'delivery', 'description', coalesce(payload->>'description',''), 'standardDays', days, 'audit', '[]'::jsonb
    );
    perform legal_private.validate_matter(candidate);
    candidate := legal_private.append_audit(candidate,actor.name,'تسجيل المعاملة وإصدار الرقم',null,target);
    candidate := legal_private.append_audit(candidate,actor.name,'تحديد المكلّف وضابط الاتصال والمهلة',null,
      (select name from public.legal_employees where id=candidate->>'assigneeId') || '؛ ' ||
      (select name from public.legal_employees where id=candidate->>'liaisonId') || '؛ ' || (candidate->>'due'));
    insert into public.legal_matters(id,data) values(target,candidate);
    return candidate;

  elsif operation in ('update','transition','note') then
    target := payload->>'id';
    select data into m from public.legal_matters where id = target for update;
    if not found or not legal_private.can_read(m->>'liaisonId',m->>'assigneeId') then raise exception 'المعاملة غير موجودة أو غير متاحة لدورك' using errcode = '42501'; end if;
    if m->>'stage' = 'مغلقة' then raise exception 'المعاملة مغلقة ولا يمكن تعديلها'; end if;
    candidate := m;
    if operation = 'update' then
      changes := payload->'changes';
      if jsonb_typeof(changes) is distinct from 'object' then raise exception 'التعديلات غير صالحة'; end if;
      for key_name in select jsonb_object_keys(changes) loop
        if key_name not in ('liaisonId','assigneeId','due','amount') then raise exception 'حقل غير مسموح بتعديله'; end if;
        if actor.role <> 'مدير الإدارة القانونية'
          and not (key_name='assigneeId' and actor.role='ضابط الاتصال' and actor.id=m->>'liaisonId') then
          raise exception 'لا تملك صلاحية هذا التعديل' using errcode = '42501';
        end if;
        if changes->key_name is distinct from m->key_name then
          label_text := case key_name when 'liaisonId' then 'ضابط الاتصال' when 'assigneeId' then 'المكلّف' when 'due' then 'آخر موعد' else 'المبلغ' end;
          old_value := m->>key_name; new_value := changes->>key_name;
          if key_name in ('liaisonId','assigneeId') then
            select name into old_value from public.legal_employees where id=m->>key_name;
            select name into new_value from public.legal_employees where id=changes->>key_name;
          end if;
          candidate := legal_private.append_audit(candidate,actor.name,'تعديل ' || label_text,old_value,new_value);
        end if;
      end loop;
      candidate := candidate || changes;
    elsif operation = 'transition' then
      next_stage := payload->>'stage';
      if next_stage is null or next_stage not in ('مستلمة','لدى ضابط الاتصال','قيد التنفيذ','قيد المراجعة','مغلقة') then raise exception 'مرحلة غير معروفة'; end if;
      if next_stage = m->>'stage' then return m; end if;
      if next_stage = 'مغلقة' then
        if actor.role <> 'مدير الإدارة القانونية' or m->>'stage' <> 'قيد المراجعة' then
          raise exception 'الإغلاق للمدير فقط بعد رفع المعاملة للمراجعة' using errcode = '42501';
        end if;
        candidate := candidate || jsonb_build_object('closed',now_date::text);
      elsif actor.role <> 'مدير الإدارة القانونية' then
        if not (
          (next_stage='قيد المراجعة' and m->>'stage'='قيد التنفيذ') or
          (actor.role='ضابط الاتصال' and actor.id=m->>'liaisonId' and next_stage='قيد التنفيذ' and m->>'stage'='لدى ضابط الاتصال')
        ) then raise exception 'هذا الانتقال غير مسموح لدورك أو للمرحلة الحالية' using errcode = '42501'; end if;
      end if;
      candidate := candidate || jsonb_build_object('stage',next_stage);
      candidate := legal_private.append_audit(candidate,actor.name,
        case when next_stage='مغلقة' then 'اعتماد الناتج وإغلاق المعاملة' else 'تغيير المرحلة' end,m->>'stage',next_stage);
    else
      if length(btrim(coalesce(payload->>'text',''))) not between 1 and 5000 then raise exception 'نص الإجراء مطلوب وبحد أقصى 5000 حرف'; end if;
      candidate := legal_private.append_audit(candidate,actor.name,btrim(payload->>'text'));
    end if;
    perform legal_private.validate_matter(candidate);
    update public.legal_matters set data = candidate where id = target;
    return candidate;

  elsif operation = 'addEmployee' then
    if nullif(btrim(payload->>'email'),'') is not null then
      select id into account from auth.users where lower(email)=lower(btrim(payload->>'email'));
      if not found then raise exception 'أنشئ حساب الموظف أو ادعه من Supabase أولاً، ثم اربطه بالبريد نفسه'; end if;
    end if;
    insert into public.legal_employees(name,role,auth_user_id)
      values(btrim(payload->>'name'),payload->>'role',account) returning id into employee_id;
    insert into public.legal_admin_events(actor,action,details)
      values(auth.uid(),'إضافة منسوب',jsonb_build_object('employeeId',employee_id,'name',payload->>'name','role',payload->>'role'));
    return jsonb_build_object('id',employee_id);

  elsif operation = 'bindAccount' then
    select id into account from auth.users where lower(email)=lower(btrim(payload->>'email'));
    if not found then raise exception 'الحساب غير موجود في Supabase؛ أنشئه أو ادعه أولاً'; end if;
    select id into employee_id from public.legal_employees where id=payload->>'employeeId' and not archived;
    if not found then raise exception 'المنسوب غير موجود أو غير نشط'; end if;
    -- Account binding is intentionally one-time; changing it needs an administrator review.
    if exists(select 1 from public.legal_employees where id=employee_id and auth_user_id is not null) then raise exception 'هذا المنسوب مرتبط بحساب بالفعل؛ تغيير الربط يحتاج مراجعة مسؤول النظام'; end if;
    update public.legal_employees set auth_user_id=account where id=employee_id;
    insert into public.legal_admin_events(actor,action,details)
      values(auth.uid(),'ربط حساب بمنسوب',jsonb_build_object('employeeId',employee_id,'authUserId',account));
    return 'true'::jsonb;

  elsif operation = 'removeEmployee' then
    target := payload->>'id';
    if not exists(select 1 from public.legal_employees where id=target and not archived) then raise exception 'المنسوب غير موجود أو غير نشط'; end if;
    if exists(select 1 from public.legal_employees where id=target and (role='مدير الإدارة القانونية' or auth_user_id=auth.uid())) then raise exception 'لا يمكن إزالة المدير أو المستخدم الحالي'; end if;
    if exists(select 1 from public.legal_matters where stage<>'مغلقة' and (assignee_id=target or liaison_id=target)) then raise exception 'يجب إعادة إسناد المعاملات المفتوحة ومهام التوجيه قبل إزالة المنسوب'; end if;
    update public.legal_employees set archived=true where id=target;
    insert into public.legal_admin_events(actor,action,details) values(auth.uid(),'أرشفة منسوب',jsonb_build_object('employeeId',target));
    return 'true'::jsonb;

  elsif operation = 'settings' then
    if jsonb_typeof(payload->'demo') is distinct from 'boolean' or jsonb_typeof(payload->'deadlines') is distinct from 'object'
      or (select count(*) from jsonb_object_keys(payload->'deadlines')) <> 8 then raise exception 'إعدادات المهل غير صالحة'; end if;
    foreach kind in array array['CAS','EXE','CON','OPN','LTR','STD','INV','TSK'] loop
      if coalesce(payload->'deadlines'->>kind,'') !~ '^[0-9]+$' then raise exception 'المهلة يجب أن تكون عدداً صحيحاً'; end if;
      if (payload->'deadlines'->>kind)::integer not between 1 and 365 then raise exception 'المهلة يجب أن تكون بين 1 و365 يوم عمل'; end if;
    end loop;
    update public.legal_settings set demo=(payload->>'demo')::boolean,deadlines=payload->'deadlines' where id;
    insert into public.legal_admin_events(actor,action,details)
      values(auth.uid(),'تعديل الإعدادات',jsonb_build_object('old',jsonb_build_object('demo',config.demo,'deadlines',config.deadlines),'next',payload));
    return 'true'::jsonb;

  elsif operation = 'import' then
    if jsonb_typeof(payload->'matters') is distinct from 'array' then raise exception 'قائمة الاستيراد غير صالحة'; end if;
    if jsonb_array_length(payload->'matters') > 10000 or octet_length(payload::text) > 10485760 then raise exception 'حجم الاستيراد يتجاوز الحد المسموح'; end if;
    for item in select value from jsonb_array_elements(payload->'matters') loop
      if exists(select 1 from public.legal_matters where id=item->>'id') then continue; end if;
      perform legal_private.validate_matter(item);
      if jsonb_typeof(item->'audit') is distinct from 'array' then raise exception 'سجل الإجراءات المستورد غير صالح'; end if;
      for entry in select value from jsonb_array_elements(item->'audit') loop
        if jsonb_typeof(entry) is distinct from 'object' or jsonb_typeof(entry->'id') is distinct from 'string'
          or jsonb_typeof(entry->'at') is distinct from 'string' or jsonb_typeof(entry->'actor') is distinct from 'string'
          or jsonb_typeof(entry->'action') is distinct from 'string' then raise exception 'سجل الإجراءات المستورد غير صالح'; end if;
      end loop;
      candidate := legal_private.append_audit(item,actor.name,'استيراد معاملة وسجل تاريخي من Excel',null,item->>'id');
      insert into public.legal_matters(id,data) values(item->>'id',candidate);
      insert into public.legal_counters(type,year,value)
        values(item->>'type',substring(item->>'id' from 5 for 2),right(item->>'id',4)::integer)
        on conflict(type,year) do update set value=greatest(public.legal_counters.value,excluded.value);
      imported := imported + 1;
    end loop;
    insert into public.legal_admin_events(actor,action,details) values(auth.uid(),'استيراد معاملات',jsonb_build_object('count',imported));
    return to_jsonb(imported);
  end if;
  raise exception 'عملية غير معروفة';
end;
$$;

revoke execute on all functions in schema legal_private from public, anon, authenticated;
grant usage on schema legal_private to authenticated;
grant execute on function legal_private.is_member(), legal_private.is_manager(), legal_private.can_read(text,text) to authenticated;
revoke execute on function public.legal_load(), public.legal_execute(text,jsonb) from public, anon;
grant execute on function public.legal_load(), public.legal_execute(text,jsonb) to authenticated;

commit;
