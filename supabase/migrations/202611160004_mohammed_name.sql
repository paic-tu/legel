begin;

-- Keep fresh installations aligned with the approved roster without replacing later edits.
with renamed as (
  update public.legal_employees set name='محمد بناني'
  where id='mohammed' and name='محمد'
  returning id
)
insert into public.legal_admin_events(actor,action,details)
select null,'اعتماد اسم المنسوب',jsonb_build_object(
  'employeeId',id,'oldName','محمد','newName','محمد بناني','source','migration')
from renamed;

commit;
