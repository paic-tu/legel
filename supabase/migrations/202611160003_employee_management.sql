begin;

-- Account changes are orchestrated by a trusted Edge Function, never by the browser.
create function public.legal_manage_employee(actor_id uuid, payload jsonb, validate_only boolean default false)
returns jsonb language plpgsql security definer set search_path = ''
as $$
declare
  employee public.legal_employees%rowtype;
  employee_id text := coalesce(nullif(payload->>'id',''),gen_random_uuid()::text);
  employee_name text := btrim(coalesce(payload->>'name',''));
  employee_role text := payload->>'role';
  employee_email text := lower(nullif(btrim(payload->>'email'),''));
  creating boolean := coalesce((payload->>'create')::boolean,false);
  account_id uuid;
  previous_email text;
  previous jsonb;
begin
  perform 1 from public.legal_settings where id for update;
  if not exists(select 1 from public.legal_employees
    where auth_user_id=actor_id and not archived and role='مدير الإدارة القانونية') then
    raise exception 'إدارة الحسابات متاحة لمدير الإدارة فقط' using errcode='42501';
  end if;
  if length(employee_name) not between 1 and 100 then raise exception 'الاسم مطلوب وبحد أقصى 100 حرف'; end if;
  if not exists(select 1 from public.legal_catalogs c,jsonb_array_elements_text(c.data->'roles') r
    where c.id and r=employee_role) then raise exception 'الدور غير معتمد'; end if;
  if employee_email is not null and employee_email !~ '^[a-z0-9][a-z0-9._+-]*@thabat[.]sa$' then
    raise exception 'بريد حساب المكتب يجب أن ينتهي بـ @thabat.sa';
  end if;
  select * into employee from public.legal_employees where id=employee_id for update;
  if creating and employee.id is not null then raise exception 'المنسوب موجود بالفعل'; end if;
  if not creating and employee.id is null then raise exception 'المنسوب غير موجود'; end if;
  if employee.archived then raise exception 'المنسوب مؤرشف؛ لا يمكن تعديل حسابه'; end if;
  if exists(select 1 from public.legal_employees where name=employee_name and id<>employee_id) then
    raise exception 'يوجد منسوب بهذا الاسم';
  end if;
  if employee.role='مدير الإدارة القانونية' and employee_role<>'مدير الإدارة القانونية'
    and not exists(select 1 from public.legal_employees
      where id<>employee_id and not archived and role='مدير الإدارة القانونية' and auth_user_id is not null) then
    raise exception 'لا يمكن تغيير دور آخر مدير نشط';
  end if;
  if employee_role not in ('ضابط الاتصال','مدير الإدارة القانونية')
    and exists(select 1 from public.legal_matters where liaison_id=employee_id and stage<>'مغلقة') then
    raise exception 'أعد توجيه معاملات ضابط الاتصال المفتوحة قبل تغيير دوره';
  end if;
  previous := case when employee.id is null then 'null'::jsonb else
    jsonb_build_object('name',employee.name,'role',employee.role,'authUserId',employee.auth_user_id) end;
  if not validate_only and payload->'before' is distinct from previous then
    raise exception 'تغير سجل المنسوب أثناء الحفظ؛ أعد تحميل البيانات';
  end if;
  if employee.auth_user_id is not null then
    if employee_email is null then raise exception 'لا يمكن تفريغ بريد حساب مرتبط'; end if;
    account_id := employee.auth_user_id;
    select email into previous_email from auth.users where id=account_id;
    if exists(select 1 from auth.users where lower(email)=employee_email and id<>account_id) then
      raise exception 'البريد مرتبط بحساب آخر';
    end if;
  elsif employee_email is not null then
    select id into account_id from auth.users where lower(email)=employee_email;
  end if;
  if account_id is not null and exists(select 1 from public.legal_employees
    where auth_user_id=account_id and id<>employee_id) then raise exception 'الحساب مرتبط بمنسوب آخر'; end if;
  if validate_only then
    return jsonb_build_object('id',employee_id,'authUserId',account_id,'previousEmail',previous_email,'before',previous);
  end if;
  if employee_email is not null and (account_id is null or not exists(
    select 1 from auth.users where id=account_id and lower(email)=employee_email)) then
    raise exception 'تعذر تجهيز حساب الدخول؛ أعد المحاولة';
  end if;
  if creating then
    insert into public.legal_employees(id,name,role,auth_user_id)
      values(employee_id,employee_name,employee_role,account_id);
  else
    update public.legal_employees set name=employee_name,role=employee_role,auth_user_id=account_id where id=employee_id;
  end if;
  if account_id is not null then
    insert into public.legal_preferences(auth_user_id) values(account_id) on conflict do nothing;
  end if;
  insert into public.legal_admin_events(actor,action,details) values(actor_id,
    case when creating then 'إضافة منسوب وحسابه' else 'تعديل بيانات المنسوب' end,
    jsonb_build_object('employeeId',employee_id,'old',previous,
      'next',jsonb_build_object('name',employee_name,'role',employee_role,'email',employee_email,'authUserId',account_id)));
  return jsonb_build_object('id',employee_id,'authUserId',account_id);
end;
$$;
revoke all on function public.legal_manage_employee(uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.legal_manage_employee(uuid,jsonb,boolean) to service_role;

create function public.legal_record_account_change(actor_id uuid,employee_id text,password_changed boolean)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.legal_admin_events(actor,action,details) values(actor_id,
    case when password_changed then 'تعيين كلمة مرور الحساب' else 'تحديث حساب الدخول' end,
    jsonb_build_object('employeeId',employee_id,'passwordChanged',password_changed));
end;
$$;
revoke all on function public.legal_record_account_change(uuid,text,boolean) from public,anon,authenticated;
grant execute on function public.legal_record_account_change(uuid,text,boolean) to service_role;

-- Expose account email to managers only, while preserving the existing snapshot contract.
alter function public.legal_load() set schema legal_private;
revoke all on function legal_private.legal_load() from public,anon,authenticated;
create function public.legal_load() returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare result jsonb;
begin
  result := legal_private.legal_load();
  if legal_private.is_manager() then
    result := jsonb_set(result,'{employees}',(
      select coalesce(jsonb_agg(entry.value || jsonb_build_object('email',account.email) order by entry.ordinality),'[]')
      from jsonb_array_elements(result->'employees') with ordinality entry(value,ordinality)
      left join public.legal_employees employee on employee.id=entry.value->>'id'
      left join auth.users account on account.id=employee.auth_user_id
    ));
  end if;
  return result;
end;
$$;
revoke all on function public.legal_load() from public,anon;
grant execute on function public.legal_load() to authenticated;

commit;
