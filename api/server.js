const SUPABASE_URL = 'https://peqqtfvypljvgcorddbn.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { method, table, filter, body } = req.body;

  const allowedTables = ['orders', 'products', 'coupons', 'returns', 'reviews'];
  if (!allowedTables.includes(table)) {
    return res.status(400).json({ error: 'Invalid table' });
  }

  const allowedMethods = ['GET', 'POST', 'PATCH', 'DELETE'];
  if (!allowedMethods.includes(method)) {
    return res.status(400).json({ error: 'Invalid method' });
  }

  let url = `${SUPABASE_URL}/rest/v1/${table}`;
  if (filter) url += `?${filter}`;

  try {
    const response = await fetch(url, {
      method,
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': method === 'POST' ? 'return=representation' : ''
      },
      body: body ? JSON.stringify(body) : undefined
    });

    if (response.status === 204) return res.status(204).end();
    const data = await response.text();
    res.status(response.status).json(data ? JSON.parse(data) : []);
  } catch(e) {
    res.status(500).json({ error: e.message });
  }
}