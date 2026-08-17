export default function handler(req, res) {
  const names = [
    'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME',
    'CUSTOMER_IO_SITE_ID', 'CUSTOMER_IO_TRACK_API_KEY', 'CUSTOMER_IO_REGION',
    'GEMEENTE_PLACES', 'EXCLUDE_EMAILS', 'WEBHOOK_SECRET',
    'KV_REST_API_URL', 'KV_REST_API_TOKEN',
  ];
  const out = {};
  for (const n of names) {
    const v = process.env[n];
    out[n] = v ? `SET (${v.length} chars)` : 'MISSING';
  }
  out.DB_HOST_VALUE = process.env.DB_HOST || null;
  out.CUSTOMER_IO_REGION_EFFECTIEF =
    (process.env.CUSTOMER_IO_REGION || 'eu').toLowerCase();
  res.status(200).json(out);
}
