# ThinQsmart → Customer.io Real-Time Order Sync

Automatically sync orders from your ThinQsmart MySQL database to Customer.io in real-time using Vercel KV.

**✅ ZERO database changes — completely read-only!**  
**✅ Gemeente filter — only Amsterdam orders**  
**✅ Email filtering — exclude specific addresses**

## What This Does

✅ New order inserted in ThinQsmart  
↓ Vercel cron checks every 1 minute  
↓ Polls `msg_orders` since last processed ID (stored in Vercel KV)  
↓ Filter: Is plaats in Amsterdam gemeente? → YES: continue, NO: skip  
↓ Filter: Is email in excluded list? → YES: skip, NO: send  
↓ Sends customer data to Customer.io with location (`plaats`)  
✅ Customer.io email automation triggers  

## Architecture

```
MySQL Replica (read-only)
    ├─ msg_orders (read only)
    ├─ msg_customers (read only)
    ├─ msg_addresses (read only)
    ↓ [Vercel cron every 1 min]
Vercel Serverless Function
    ├─ Query: SELECT orders WHERE id > last_processed_id
    ├─ Filter 1: Is plaats in Amsterdam?
    ├─ Filter 2: Is email excluded?
    ├─ Send to Customer.io
    ├─ Update last_processed_id IN VERCEL KV
    ↓
Customer.io
    └─ Email automation triggers
```

## Key Features

- **Zero database changes:** Read-only on your database. Completely safe.
- **Gemeente filter:** Only sync orders from Amsterdam (Amsterdam, Weesp, Noord, West, Oost, Zuid, Zuidoost)
- **Email filtering:** Exclude specific addresses (e.g., admin emails)
- **Vercel KV state tracking:** No database tables needed
- **Real-time (1 min delay):** Cron-based polling
- **Reliable:** KV-based state prevents duplicates and handles gaps
- **Cost-effective:** Minimal Vercel credits, serverless scaling
- **Safe for others:** No impact on other database users
- **Easy to expand:** Change gemeente places or emails with just env vars

## Files Included

| File | Purpose |
|------|---------|
| `api/webhook-processor.js` | Main serverless function (gemeente + email filtering) |
| `package.json` | Node.js dependencies |
| `vercel.json` | Vercel deployment config with cron |
| `.env.example` | Environment variables template |
| `SETUP_GUIDE.md` | Complete step-by-step setup instructions |
| `README.md` | This file |

## Quick Start

1. **Get Customer.io credentials:**
   - Go to Settings → API Credentials
   - Copy Account ID and API Key

2. **Deploy to Vercel:**
   - Push code to GitHub
   - Import to Vercel
   - Create Vercel KV store
   - Add environment variables (Customer.io credentials + filters)
   - Deploy

3. **Set up email in Customer.io:**
   - Create automation triggered by `plaats` attribute
   - Test with a real order

See `SETUP_GUIDE.md` for detailed instructions.

## Configuration

### Environment Variables

```
# Database
DB_HOST                          # MySQL host
DB_USER                          # MySQL username
DB_PASSWORD                      # MySQL password
DB_NAME                          # ThinQsmart database name

# Customer.io
CUSTOMER_IO_ACCOUNT_ID           # From Customer.io settings
CUSTOMER_IO_API_KEY              # From Customer.io settings

# Gemeente filter (only these places sync)
GEMEENTE_PLACES=Amsterdam,Weesp,Amsterdam-Noord,Amsterdam-West,Amsterdam-Oost,Amsterdam-Zuid,Amsterdam-Zuidoost

# Email filtering (never send these)
EXCLUDE_EMAILS=planning@thcontainers.nl,planning@paridoncontainers.nl,info@milieuservice.nl

# Security
WEBHOOK_SECRET                   # Random token for webhook
KV_REST_API_URL                  # Auto-added by Vercel KV
KV_REST_API_TOKEN                # Auto-added by Vercel KV
```

### Cron Schedule

Default: Every 1 minute (`*/1 * * * *`)

Edit in `vercel.json` to change frequency. Note: Cron requires Vercel Pro plan.

## Data Synced to Customer.io

Each customer gets these custom fields:
- `plaats` — City/location of delivery
- `webshop` — Which webshop made the order
- `sync_date` — When the sync happened

## Changing Gemeente Filter

To change which places are included, edit Vercel environment:
```
GEMEENTE_PLACES=Amsterdam,Weesp,Amsterdam-Noord,Amsterdam-West,Amsterdam-Oost,Amsterdam-Zuid,Amsterdam-Zuidoost,Diemen
```

Then deploy.

## Excluding More Emails

```
EXCLUDE_EMAILS=planning@thcontainers.nl,admin@thcontainers.nl,support@company.nl
```

Then deploy.

## Monitoring

**Check sync status:**
```
Vercel Dashboard → Storage → KV → your-store
Key: thinqsmart:last_processed_order_id
```

**View Vercel logs:**
```
Vercel Dashboard → Deployments → Logs
```

**Manual test:**
```bash
curl "https://your-project.vercel.app/api/webhook-processor?secret=YOUR_SECRET"
```

**Response example:**
```json
{
  "success": true,
  "processed": 3,
  "skipped": 2,
  "failed": 0,
  "details": [
    {"order_id": 127941, "plaats": "Amsterdam", "status": "success"},
    {"order_id": 127940, "plaats": "Rotterdam", "status": "skipped", "reason": "plaats_not_in_gemeente"},
    {"order_id": 127940, "email": "planning@thcontainers.nl", "status": "skipped", "reason": "email_excluded"}
  ]
}
```

## Troubleshooting

- **No orders syncing?** Check Vercel logs and KV key status
- **"Plaats not in gemeente"?** The place is outside Amsterdam gemeente — add it to GEMEENTE_PLACES if needed
- **Email should be excluded but isn't?** Check EXCLUDE_EMAILS (case-insensitive)
- **API errors?** Verify Customer.io credentials in Vercel env vars
- **Connection timeout?** Ensure MySQL host is correct and accessible

See `SETUP_GUIDE.md` for more troubleshooting steps.

## Costs

| Service | Estimated Cost |
|---------|-----------------|
| Vercel (Hobby tier) | Free |
| Vercel KV (included) | Free |
| Vercel Pro (cron) | $20/month |
| Customer.io API calls | ~$0 (included in plan) |
| **Total** | Free or $20/month |

Alternative: Use free external cron service if staying on Vercel Hobby plan.

## Database Impact

✅ **ZERO changes to your database**

- No SQL tables created
- No triggers installed
- No schema modifications
- Completely read-only
- Safe for other database users
- No maintenance burden

## Support

- Vercel docs: https://vercel.com/docs
- Vercel KV docs: https://vercel.com/docs/storage/vercel-kv
- Customer.io docs: https://customer.io/docs/api/
- MySQL docs: https://dev.mysql.com/doc/

---

**Questions?** Check the SETUP_GUIDE.md or review the inline code comments in `api/webhook-processor.js`.
