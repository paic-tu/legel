import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';

const configuredTeam = JSON.parse(await readFile(new URL('./team.json', import.meta.url), 'utf8'));
const targetEmail = process.argv.find(arg => arg.startsWith('--email='))?.slice('--email='.length).trim().toLowerCase();
if (targetEmail !== undefined && !configuredTeam.some(member => member.email === targetEmail)) {
  throw new Error('Requested email is not in the office account configuration.');
}
const team = targetEmail === undefined ? configuredTeam : configuredTeam.filter(member => member.email === targetEmail);
const apply = process.argv.includes('--apply');
const sharedPasswordMode = process.argv.includes('--shared-password');
const expectedUrl = 'https://auldwneywwfktztatwja.supabase.co';

if (new Set(configuredTeam.map(member => member.email)).size !== configuredTeam.length ||
    new Set(configuredTeam.map(member => member.id)).size !== configuredTeam.length ||
    configuredTeam.some(member => !/^[a-z0-9][a-z0-9._+-]*@thabat\.sa$/.test(member.email))) {
  throw new Error('Invalid or duplicate office account configuration.');
}
console.table(team.map(({ id, name, role, email }) => ({ id, name, role, email })));
if (!apply) {
  console.log('Preview only. No accounts were created and no invitations were sent.');
  console.log(sharedPasswordMode
    ? 'Shared-password preview. Use --apply with SUPABASE_SECRET_KEY and LEGAL_INITIAL_PASSWORD in the administrator environment.'
    : 'Use --apply with SUPABASE_SECRET_KEY and LEGAL_APP_URL in the administrator environment.');
  process.exit(0);
}

const key = process.env.SUPABASE_SECRET_KEY;
const url = process.env.SUPABASE_URL || expectedUrl;
const redirectTo = process.env.LEGAL_APP_URL;
const initialPassword = sharedPasswordMode ? process.env.LEGAL_INITIAL_PASSWORD : null;
if (!key) throw new Error('Missing administrator credentials. No accounts or passwords were changed. Never put the secret in VITE_* variables.');
if (sharedPasswordMode && (!initialPassword || initialPassword.length < 8)) throw new Error('LEGAL_INITIAL_PASSWORD must contain at least 8 characters.');
if (!sharedPasswordMode && !redirectTo) throw new Error('Missing application URL for invitations.');
if (url !== expectedUrl) throw new Error('Unexpected project URL. Provisioning stopped.');
const redirect = redirectTo ? new URL(redirectTo) : null;
if (redirect && redirect.protocol !== 'https:' && !(redirect.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(redirect.hostname))) {
  throw new Error('Application URL must use HTTPS, except for localhost testing.');
}

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const accounts = new Map();
for (let page = 1; ; page++) {
  const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
  if (error) throw new Error('Administrator authentication failed. No credentials will be printed.');
  for (const user of data.users) if (user.email) accounts.set(user.email.toLowerCase(), user);
  if (data.users.length < 100) break;
}

// Check schema and account collisions before changing accounts or passwords.
const { data: employees, error: schemaError } = await client.from('legal_employees').select('id,name,role,archived,auth_user_id');
const { error: preferencesError } = await client.from('legal_preferences').select('auth_user_id').limit(1);
if (schemaError || preferencesError) throw new Error('Publish both office migrations before provisioning.');
for (const member of team) {
  const employee = employees.find(e => e.id === member.id);
  const account = accounts.get(member.email);
  if (employee && (employee.name !== member.name || employee.role !== member.role || employee.archived ||
      (employee.auth_user_id && employee.auth_user_id !== account?.id))) {
    throw new Error(`Existing employee binding conflicts with ${member.email}. No invitations were sent.`);
  }
  if (employees.some(e => e.id !== member.id && (e.name === member.name || (account && e.auth_user_id === account.id)))) {
    throw new Error(`Another employee owns the name or account for ${member.email}. No invitations were sent.`);
  }
}

for (const member of team) {
  let account = accounts.get(member.email);
  let invited = false;
  if (!account) {
    const { data, error } = sharedPasswordMode
      ? await client.auth.admin.createUser({
          email: member.email,
          password: initialPassword,
          email_confirm: true,
          user_metadata: { display_name: member.name },
        })
      : await client.auth.admin.inviteUserByEmail(member.email, {
          redirectTo: redirect.href,
          data: { display_name: member.name },
        });
    if (error || !data.user) throw new Error(`Account creation failed for ${member.email}. Check administrator permissions and retry; existing accounts are not replaced.`);
    account = data.user;
    accounts.set(member.email, account);
    invited = true;
  }
  const { error } = await client.rpc('legal_provision_employee', {
    employee_id: member.id,
    employee_name: member.name,
    employee_role: member.role,
    account_email: member.email,
  });
  if (error) throw new Error(`Account binding failed for ${member.email}. The account may already exist; retry safely after checking the database.`);
  if (sharedPasswordMode) {
    const { error: passwordError } = await client.auth.admin.updateUserById(account.id, { password: initialPassword });
    if (passwordError) throw new Error(`Password update failed for ${member.email}. Previous accounts in the batch may already be updated; retry safely.`);
    console.log(`${member.email}: linked; requested password applied`);
  } else console.log(`${member.email}: ${invited ? 'invited and linked' : 'existing account linked'}`);
}
console.log(sharedPasswordMode
  ? 'Provisioning complete. Shared passwords applied by explicit administrator request; password values were not printed or saved.'
  : 'Provisioning complete. Users set their own passwords through email; no shared passwords were generated.');
