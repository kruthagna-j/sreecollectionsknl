const SUPABASE_URL = 'https://peqqtfvypljvgcorddbn.supabase.co';
const SUPABASE_SERVICE_KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlcXF0ZnZ5cGxqdmdjb3JkZGJuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkyNDU1OTAsImV4cCI6MjA5NDgyMTU5MH0.J364P7n9HazV0F8Bd9o_OKBsfKbfLAbW1vCRjIflLtEprocess.env.eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlcXF0ZnZ5cGxqdmdjb3JkZGJuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTI0NTU5MCwiZXhwIjoyMDk0ODIxNTkwfQ.iIpZHj4BuXf4u06isC-Km_tEtSKbdhtc-d-raM3kPfk;
const ADMIN_SECRET = process.env.ADMIN_SECRET;

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check admin secret
  if (req.headers['x-admin-secret'] !== ADMIN_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const { method, table, filter, body } = req.body;

  // Only allow specific tables
  const allowedTables = ['orders', 'products', 'coupons', 'returns', 'reviews'];
  if (!allowedTables.includes(table)) {
    return res.status(400).json({ error: 'Invalid table' });
  }

  // Only allow specific methods
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
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
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