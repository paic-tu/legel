begin;

update public.legal_settings set demo = false where id;
alter table public.legal_settings add constraint legal_live_only check (not demo);
alter table public.legal_admin_events alter column actor drop not null;

create table public.legal_catalogs (
  id boolean primary key default true check (id),
  data jsonb not null
);
insert into public.legal_catalogs(data) values ('{
  "types":[
    {"code":"CAS","name":"قضية"},{"code":"EXE","name":"تنفيذ"},
    {"code":"CON","name":"عقد / مراجعة عقد"},{"code":"OPN","name":"استشارة / رأي قانوني"},
    {"code":"LTR","name":"خطاب / مراسلة"},{"code":"STD","name":"دراسة قانونية"},
    {"code":"INV","name":"شكوى / تحقيق"},{"code":"TSK","name":"مهمة إدارية"}
  ],
  "roles":["مدير الإدارة القانونية","ضابط الاتصال","مستشار قانوني","محامٍ","باحث قانوني","متدرب"],
  "deliveries":["مذكرة","لائحة","خطاب","رأي مكتوب","دراسة","تقرير","إجراء في منصة"]
}');
alter table public.legal_catalogs enable row level security;
create policy legal_catalog_read on public.legal_catalogs for select to authenticated
  using (legal_private.is_member());
revoke all on public.legal_catalogs from anon, authenticated;
grant select on public.legal_catalogs to authenticated;

create table public.legal_preferences (
  auth_user_id uuid primary key references auth.users(id) on delete cascade,
  dark boolean not null default false
);
alter table public.legal_preferences enable row level security;
create policy legal_preferences_read on public.legal_preferences for select to authenticated
  using (auth_user_id = auth.uid() and legal_private.is_member());
revoke all on public.legal_preferences from anon, authenticated;
grant select on public.legal_preferences to authenticated;
grant select on public.legal_employees,public.legal_preferences to service_role;

create or replace function legal_private.validate_matter(m jsonb) returns void
language plpgsql set search_path = ''
as $$
declare received_date date; due_date date; closed_date date;
begin
  if jsonb_typeof(m) is distinct from 'object' then raise exception 'بيانات المعاملة غير صالحة'; end if;
  if not exists(select 1 from public.legal_catalogs c,jsonb_array_elements(c.data->'types') t
    where c.id and t->>'code'=m->>'type') then raise exception 'نوع المعاملة غير معروف'; end if;
  if length(btrim(coalesce(m->>'subject',''))) not between 1 and 500 then raise exception 'الموضوع مطلوب، وبحد أقصى 500 حرف'; end if;
  if length(btrim(coalesce(m->>'source',''))) not between 1 and 200 then raise exception 'جهة الإحالة مطلوبة'; end if;
  if length(coalesce(m->>'description','')) > 5000 then raise exception 'التكليف يتجاوز 5000 حرف'; end if;
  if jsonb_typeof(m->'important') is distinct from 'boolean' or jsonb_typeof(m->'urgent') is distinct from 'boolean' then raise exception 'الأهمية والاستعجال مطلوبان'; end if;
  if coalesce(m->>'stage','') not in ('مستلمة','لدى ضابط الاتصال','قيد التنفيذ','قيد المراجعة','مغلقة') then raise exception 'مرحلة المعاملة غير معروفة'; end if;
  if not exists(select 1 from public.legal_employees where id=m->>'assigneeId' and (not archived or m->>'stage'='مغلقة')) then raise exception 'يجب تحديد مكلّف موجود ونشط'; end if;
  if not exists(select 1 from public.legal_employees where id=m->>'liaisonId' and role in ('ضابط الاتصال','مدير الإدارة القانونية') and (not archived or m->>'stage'='مغلقة')) then raise exception 'يجب تحديد ضابط اتصال مؤهل'; end if;
  if coalesce(m->>'received','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' or coalesce(m->>'due','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'تاريخ الاستلام وآخر موعد مطلوبان'; end if;
  begin
    received_date := (m->>'received')::date;
    due_date := (m->>'due')::date;
  exception when others then raise exception 'التاريخ غير صالح'; end;
  if due_date<received_date then raise exception 'آخر موعد لا يسبق تاريخ الاستلام'; end if;
  if coalesce(m->>'id','') !~ ('^'||(m->>'type')||'-'||to_char(received_date,'YY')||'-[0-9]{4}$') then raise exception 'رقم المعاملة لا يطابق النوع وسنة الاستلام'; end if;
  if not exists(select 1 from public.legal_catalogs c,jsonb_array_elements_text(c.data->'deliveries') d
    where c.id and d=m->>'delivery') then raise exception 'صيغة التسليم مطلوبة ومعتمدة'; end if;
  if jsonb_typeof(m->'amount') is distinct from 'number' then raise exception 'المبلغ يجب أن يكون رقماً'; end if;
  if (m->>'amount')::numeric<0 or (m->>'amount')::numeric>1000000000000000 then raise exception 'المبلغ غير صالح أو يتجاوز الحد المسموح'; end if;
  if coalesce(m->>'standardDays','') !~ '^[0-9]+$' then raise exception 'المهلة المعيارية يجب أن تكون عدداً صحيحاً'; end if;
  if (m->>'standardDays')::integer not between 1 and 365 then raise exception 'المهلة المعيارية يجب أن تكون بين 1 و365 يوم عمل'; end if;
  if m->>'stage'='مغلقة' then
    if coalesce(m->>'closed','') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'تاريخ الإغلاق مطلوب للمعاملة المغلقة'; end if;
    begin closed_date := (m->>'closed')::date;
    exception when others then raise exception 'تاريخ الإغلاق غير صالح'; end;
    if closed_date<received_date then raise exception 'تاريخ الإغلاق لا يسبق الاستلام'; end if;
  elsif nullif(m->>'closed','') is not null then raise exception 'المعاملة المفتوحة لا تحمل تاريخ إغلاق';
  end if;
end;
$$;

-- The roster is office configuration, not fabricated transaction history.
insert into public.legal_employees(id,name,role) values
  ('manager','مدير الإدارة القانونية','مدير الإدارة القانونية'),
  ('omar','عمر المرغلاني','مستشار قانوني'),
  ('dima','ديما','ضابط الاتصال'),
  ('layan','ليان','ضابط الاتصال'),
  ('othman','عثمان','محامٍ'),
  ('dhay','ضي','باحث قانوني'),
  ('mohammed','محمد','متدرب')
on conflict (id) do nothing;

create or replace function public.legal_load() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  if not legal_private.is_member() then raise exception 'الحساب غير مرتبط بمنسوب نشط؛ تواصل مع مدير الإدارة' using errcode='42501'; end if;
  insert into public.legal_preferences(auth_user_id) values(auth.uid()) on conflict do nothing;
  select jsonb_build_object(
    'employees',(select coalesce(jsonb_agg(jsonb_build_object(
      'id',e.id,'name',e.name,'role',e.role,'archived',e.archived,
      'authUserId',case when e.auth_user_id=auth.uid() or legal_private.is_manager() then e.auth_user_id else null end
    ) order by e.name),'[]') from public.legal_employees e),
    'matters',(select coalesce(jsonb_agg(m.data order by m.id),'[]') from public.legal_matters m where legal_private.can_read(m.liaison_id,m.assignee_id)),
    'settings',(select jsonb_build_object('demo',false,'deadlines',s.deadlines,
      'serverToday',((current_timestamp at time zone 'Asia/Riyadh')::date)::text) from public.legal_settings s where id),
    'catalogs',(select c.data || jsonb_build_object('types',(
      select jsonb_agg(t.value || jsonb_build_object('days',(s.deadlines->>(t.value->>'code'))::integer) order by t.ordinality)
      from jsonb_array_elements(c.data->'types') with ordinality as t(value,ordinality)
    )) from public.legal_catalogs c cross join public.legal_settings s where c.id and s.id),
    'preferences',(select jsonb_build_object('dark',p.dark) from public.legal_preferences p where auth_user_id=auth.uid())
  ) into result;
  return result;
end;
$$;

-- Keep the validated transaction engine private; only this production gate is exposed.
alter function public.legal_execute(text,jsonb) set schema legal_private;
revoke execute on function legal_private.legal_execute(text,jsonb) from public,anon,authenticated;
create function public.legal_execute(operation text,payload jsonb default '{}') returns jsonb
language plpgsql security definer set search_path = ''
as $$
begin
  if not legal_private.is_member() then raise exception 'الحساب غير مرتبط بمنسوب نشط' using errcode='42501'; end if;
  if jsonb_typeof(payload) is distinct from 'object' then raise exception 'طلب غير صالح'; end if;
  if operation='preferences' then
    if jsonb_typeof(payload->'dark') is distinct from 'boolean' then raise exception 'تفضيل العرض غير صالح'; end if;
    insert into public.legal_preferences(auth_user_id,dark) values(auth.uid(),(payload->>'dark')::boolean)
      on conflict(auth_user_id) do update set dark=excluded.dark;
    return 'true'::jsonb;
  end if;
  if operation='settings' and payload->'demo' is distinct from 'false'::jsonb then
    raise exception 'وضع العرض التجريبي غير متاح في النظام الفعلي';
  end if;
  if operation in ('addEmployee','bindAccount') and nullif(btrim(payload->>'email'),'') is not null
    and lower(btrim(payload->>'email')) !~ '^[a-z0-9][a-z0-9._+-]*@thabat[.]sa$' then
    raise exception 'بريد حساب المكتب يجب أن ينتهي بـ @thabat.sa';
  end if;
  return legal_private.legal_execute(operation,payload);
end;
$$;
revoke execute on function public.legal_execute(text,jsonb) from public,anon;
grant execute on function public.legal_execute(text,jsonb) to authenticated;

-- Only a trusted provisioning process may perform the first account binding.
create function public.legal_provision_employee(employee_id text,employee_name text,employee_role text,account_email text)
returns void language plpgsql security definer set search_path = ''
as $$
declare account uuid; existing public.legal_employees%rowtype;
begin
  if lower(account_email) !~ '^[a-z0-9][a-z0-9._+-]*@thabat[.]sa$' then raise exception 'نطاق البريد غير معتمد'; end if;
  select id into account from auth.users where lower(email)=lower(account_email);
  if not found then raise exception 'حساب Authentication غير موجود'; end if;
  perform 1 from public.legal_settings where id for update;
  select * into existing from public.legal_employees where id=employee_id for update;
  if found then
    if existing.name<>employee_name or existing.role<>employee_role or existing.archived
      or (existing.auth_user_id is not null and existing.auth_user_id<>account) then
      raise exception 'تعارض في سجل المنسوب؛ لن يتم استبدال ربط قائم';
    end if;
    update public.legal_employees set auth_user_id=account where id=employee_id;
  else
    insert into public.legal_employees(id,name,role,auth_user_id) values(employee_id,employee_name,employee_role,account);
  end if;
  insert into public.legal_preferences(auth_user_id) values(account) on conflict do nothing;
  insert into public.legal_admin_events(actor,action,details)
    values(null,'تهيئة حساب المكتب',jsonb_build_object('employeeId',employee_id,'authUserId',account,'provisionedBy','service_role'));
end;
$$;
revoke execute on function public.legal_provision_employee(text,text,text,text) from public,anon,authenticated;
grant execute on function public.legal_provision_employee(text,text,text,text) to service_role;

commit;
