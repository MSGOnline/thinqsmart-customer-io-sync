export default function handler(req, res) {
  const names = ['DB_HOST','DB_USER','DB_PASSWORD','DB_NAME',
    'CUSTOMER_IO_ACCOUNT_ID','CUSTOMER_IO_API_KEY',
    'GEMEENTE_PLACES','EXCLUDE_EMAILS','WEBHOOK_SECRET',
    'KV_REST_API_URL','KV_REST_API_TOKEN'];
  const out = {};
  for (const n of names) {
    const v = process.env[n];
    out[n] = v ? `SET (${v.length} chars)` : 'MISSING';
  }
  out.DB_HOST_VALUE = process.env.DB_HOST || null;
  res.status(200).json(out);
}
