import { createClient } from '@supabase/supabase-js';

const required = [
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'TEST_OPERATOR_EMAIL',
  'TEST_OPERATOR_PASSWORD',
  'TEST_DRIVER_EMAIL',
  'TEST_DRIVER_PASSWORD',
];
for (const name of required) {
  if (!process.env[name]) throw new Error(`${name} is required`);
}

const client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function findUser(email) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await client.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const user = data.users.find((candidate) => candidate.email?.toLowerCase() === email.toLowerCase());
    if (user) return user;
    if (data.users.length < 100) return null;
  }
  throw new Error(`Unable to find ${email} in the first 1000 auth users`);
}

async function ensureUser({ email, password, role, fullName }) {
  let user = await findUser(email);
  if (user) {
    const { data, error } = await client.auth.admin.updateUserById(user.id, {
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
    if (error) throw error;
    user = data.user;
  } else {
    const { data, error } = await client.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
    if (error) throw error;
    user = data.user;
  }

  const { error: profileError } = await client.from('profiles').upsert(
    {
      id: user.id,
      role,
      full_name: fullName,
      is_active: true,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'id' },
  );
  if (profileError) throw profileError;

  if (role === 'DRIVER') {
    const { error: stateError } = await client.from('driver_states').upsert(
      {
        driver_id: user.id,
        is_online: false,
        operational_status: 'OFFLINE',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'driver_id' },
    );
    if (stateError) throw stateError;
  }
  return { id: user.id, email, role };
}

const users = await Promise.all([
  ensureUser({
    email: process.env.TEST_OPERATOR_EMAIL,
    password: process.env.TEST_OPERATOR_PASSWORD,
    role: 'OPERATOR',
    fullName: 'GSM Test Operator',
  }),
  ensureUser({
    email: process.env.TEST_DRIVER_EMAIL,
    password: process.env.TEST_DRIVER_PASSWORD,
    role: 'DRIVER',
    fullName: 'GSM Test Driver',
  }),
]);

console.log(JSON.stringify({ ready: true, users }, null, 2));
