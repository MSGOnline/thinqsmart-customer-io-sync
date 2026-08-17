export default function handler(req, res) {
  const names = [
    'DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME',
    'CUSTOMER_IO_SITE_ID', 'CUSTOMER_IO_TRACK_API_KEY', 'CUSTOMER_IO_REGION',
    'GEMEENTE_PLACES', 'EXCLUDE_EMAILS', 'WEBHOOK_SECRET',
    'KV_REST_API_URL', 'KV_REST_API_TOKEN',
    'START_FROM_ORDER_ID', 'DRY_RUN',
  ];
  const out = {};
  for (const n of names) {
    const v = process.env[n];
    out[n] = v ? `SET (${v.length} chars)` : 'MISSING';
  }
  out.REGIO_EFFECTIEF = (process.env.CUSTOMER_IO_REGION || 'eu').toLowerCase();
  out.START_EFFECTIEF = Number.isFinite(parseInt(process.env.START_FROM_ORDER_ID, 10))
    ? parseInt(process.env.START_FROM_ORDER_ID, 10)
    : 0;
  out.DRY_RUN_EFFECTIEF = String(process.env.DRY_RUN).toLowerCase() === 'true';
  res.status(200).json(out);
}
