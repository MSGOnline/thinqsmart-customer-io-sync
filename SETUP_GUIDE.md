# ThinQsmart → Customer.io Integration Setup Guide

Complete step-by-step guide to deploy the real-time order sync system with gemeente filtering.

**Design:** Zero database changes. Uses Vercel KV to track sync state. Gemeente-based filtering for Amsterdam.

---

## Phase 0: What You DON'T Need to Do

✅ No SQL setup needed  
✅ No database tables to create  
✅ No triggers to install  
✅ No modifications to existing tables  
✅ **Your database stays completely untouched**

---

## Phase 1: Customer.io Setup

### 1.1 Get your API credentials

1. Log in to [Customer.io](https://app.customer.io)
2. Go to **Settings** → **API Credentials**
3. Copy:
   - **Account ID** (looks like: b823ba13d9c56b0f9d23)
   - **API Key** (long token)

### 1.2 Create custom attribute "plaats"

1. In Customer.io, go to **Settings** → **Attributes**
2. Click **+ New Attribute**
3. Name: `plaats`
4. Type: `Text`
5. Save

### 1.3 Create automated email trigger

We'll set this up after deployment. For now, just note that:
- Trigger: "When customer is created or updated"
- Condition: `plaats` is not empty
- Action: Send email to customer

---

## Phase 2: Vercel Setup

### 2.1 Prepare your repository

```bash
# Create a new git repo
mkdir thinqsmart-customer-io-sync
cd thinqsmart-customer-io-sync
git init

# Copy the files
# - api/webhook-processor.js
# - package.json
# - vercel.json
# - .env.example
```

Your structure should look like:
```
.
├── api/
│   └── webhook-processor.js
├── package.json
├── vercel.json
├── .env.example
└── SETUP_GUIDE.md
```

### 2.2 Push to GitHub

```bash
git add .
git commit -m "Initial ThinQsmart Customer.io integration"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/thinqsmart-customer-io-sync.git
git push -u origin main
```

### 2.3 Connect to Vercel

1. Go to [vercel.com](https://vercel.com)
2. Click **Add New** → **Project**
3. Select your GitHub repository
4. Click **Import**

### 2.4 Set up Vercel KV

In Vercel project settings:

1. Go to **Storage** → **Create** → **KV**
2. Name: `thinqsmart-kv` (or your choice)
3. Click **Create**
4. This automatically adds `KV_*` environment variables

### 2.5 Set environment variables in Vercel

In Vercel project settings → **Environment Variables**, add:

```
DB_HOST=r2-db1-replica.cyv75atac9eg.eu-central-1.rds.amazonaws.com
DB_USER=msn_tom
DB_PASSWORD=your_password
DB_NAME=r2_production
CUSTOMER_IO_ACCOUNT_ID=b823ba13d9c56b0f9d23
CUSTOMER_IO_API_KEY=65361205292527ddb7ac
GEMEENTE_PLACES=Amsterdam,Weesp,Amsterdam-Noord,Amsterdam-West,Amsterdam-Oost,Amsterdam-Zuid,Amsterdam-Zuidoost
EXCLUDE_EMAILS=planning@thcontainers.nl,planning@paridoncontainers.nl,info@milieuservice.nl
WEBHOOK_SECRET=your_random_secret_token_here
```

To generate a secure token:
```bash
openssl rand -hex 32
```

**Note:** The `KV_*` variables are auto-added when you create the KV store above.

Click **Deploy** after setting all variables.

---

## Phase 3: Testing

### 3.1 Manual test via HTTP

After deployment, test the webhook manually:

```bash
curl "https://your-vercel-project.vercel.app/api/webhook-processor?secret=YOUR_WEBHOOK_SECRET"
```

Expected response (no new orders):
```json
{
  "success": true,
  "processed": 0,
  "skipped": 0,
  "failed": 0,
  "message": "No new orders to process",
  "last_processed_id": 0
}
```

With orders (some skipped, some processed):
```json
{
  "success": true,
  "processed": 2,
  "skipped": 3,
  "failed": 0,
  "total": 5,
  "last_processed_id": 127945,
  "details": [
    {
      "order_id": 127941,
      "email": "contact@email.nl",
      "plaats": "Amsterdam",
      "status": "success"
    },
    {
      "order_id": 127940,
      "email": "planning@thcontainers.nl",
      "plaats": "Amsterdam",
      "status": "skipped",
      "reason": "email_excluded"
    },
    {
      "order_id": 127939,
      "email": "info@email.nl",
      "plaats": "Rotterdam",
      "status": "skipped",
      "reason": "plaats_not_in_gemeente"
    }
  ]
}
```

### 3.2 Check Vercel KV status

In Vercel dashboard:
- Go to **Storage** → **KV** → your store
- You should see a key: `thinqsmart:last_processed_order_id`
- The value updates after each successful run

### 3.3 Check Vercel logs

In Vercel dashboard:
- Go to **Deployments** → your latest deploy
- Click **Logs** to see real-time execution logs

---

## Phase 4: Production Setup

### 4.1 Enable cron job in Vercel

The `vercel.json` includes a cron that runs every 1 minute:

```json
"crons": [
  {
    "path": "/api/webhook-processor?secret=YOUR_WEBHOOK_SECRET",
    "schedule": "*/1 * * * *"
  }
]
```

**Note:** Cron is only available on Vercel's **Pro** plan or higher. If you're on free tier:
- Use the manual HTTP trigger above, or
- Set up an external cron service (e.g., easycron.com)

### 4.2 Upgrade Vercel plan (if needed)

If you want automatic cron scheduling:
1. Go to Vercel dashboard → **Settings** → **Billing**
2. Upgrade to **Pro** ($20/month)
3. Cron will automatically start

### 4.3 Set up external cron (free alternative)

If staying on free Vercel:
1. Go to [easycron.com](https://www.easycron.com)
2. Create a cron job that hits:
   ```
   https://your-vercel-project.vercel.app/api/webhook-processor?secret=YOUR_WEBHOOK_SECRET
   ```
3. Schedule it to run every 1-2 minutes

---

## Phase 5: Changing Filters

### 5.1 Add/remove places from gemeente

If you want to include more places (e.g., Diemen):

1. In Vercel → Settings → Environment Variables
2. Edit `GEMEENTE_PLACES`:
   ```
   Amsterdam,Weesp,Amsterdam-Noord,Amsterdam-West,Amsterdam-Oost,Amsterdam-Zuid,Amsterdam-Zuidoost,Diemen
   ```
3. Click **Deploy** or **Redeploy**

### 5.2 Add more excluded emails

1. In Vercel → Settings → Environment Variables
2. Edit `EXCLUDE_EMAILS`:
   ```
   planning@thcontainers.nl,admin@thcontainers.nl,support@company.nl
   ```
3. Click **Deploy** or **Redeploy**

---

## Phase 6: Monitor & Troubleshoot

### 6.1 Check sync status

**View in Vercel KV:**
```
Vercel Dashboard → Storage → KV → your-store
Key: thinqsmart:last_processed_order_id
```

**Check which orders were processed:**
```sql
-- Get last few orders synced
SELECT o.id, c.email, a.city, o.created_at
FROM msg_orders o
LEFT JOIN msg_customers c ON o.customer_id = c.id
LEFT JOIN msg_addresses a ON a.id = o.delivery_address_id
WHERE a.city IN ('Amsterdam', 'Weesp', 'Amsterdam-Noord', 'Amsterdam-West', 'Amsterdam-Oost', 'Amsterdam-Zuid', 'Amsterdam-Zuidoost')
AND c.email != 'planning@thcontainers.nl'
AND o.company_id = 1
AND o.deleted_at IS NULL
ORDER BY o.id DESC
LIMIT 20;
```

**Check pending orders:**
```sql
-- Orders not yet synced (from Amsterdam gemeente)
SELECT COUNT(*) as pending 
FROM msg_orders o
LEFT JOIN msg_addresses a ON a.id = o.delivery_address_id
WHERE o.id > [LAST_PROCESSED_ID from KV]
AND a.city IN ('Amsterdam', 'Weesp', 'Amsterdam-Noord', 'Amsterdam-West', 'Amsterdam-Oost', 'Amsterdam-Zuid', 'Amsterdam-Zuidoost')
AND o.company_id = 1 
AND o.deleted_at IS NULL;
```

**Check Vercel logs:**
```
Vercel Dashboard → Deployments → Logs
```

### 6.2 Common issues

**Issue: "Plaats not in gemeente" but should be included**
- Add the place to GEMEENTE_PLACES env var
- Check spelling (case-insensitive but must match exactly)

**Issue: "Email excluded" but shouldn't be**
- Check EXCLUDE_EMAILS env var
- Make sure email address matches exactly (case-insensitive)

**Issue: "Customer.io API error: 401"**
- Double-check Account ID and API Key
- Regenerate API key in Customer.io settings
- Verify you copied them correctly

**Issue: "Orders not appearing in Customer.io"**
- Check Vercel logs for errors
- Verify orders are from Amsterdam gemeente (check plaats in database)
- Verify `email` field is not NULL in msg_customers
- Check that `company_id = 1` in the orders
- Try manual test: `curl "https://your-project.vercel.app/api/webhook-processor?secret=YOUR_SECRET"`

**Issue: "KV key not updating"**
- Check if function is actually running (Vercel logs)
- Verify KV store is connected (Storage → KV)
- Try manual test

**Issue: "Database connection failed"**
- Check DB credentials in Vercel env vars
- Ensure replica host is correct: `r2-db1-replica.cyv75atac9eg.eu-central-1.rds.amazonaws.com`
- Test connection locally: `/opt/homebrew/opt/mysql-client/bin/mysql -h your-host -u user -p`

---

## Phase 7: Customer.io Email Automation

Now that orders are syncing to Customer.io with `plaats` attribute:

### 7.1 Create workflow in Customer.io

1. Go to **Campaigns** → **Automations**
2. Click **+ New Automation**
3. **Trigger:** "When a customer is added or updated"
4. **Condition:** `plaats` exists
5. **Action:** Send email
6. Choose your email template
7. Click **Activate**

### 7.2 Test the flow

1. Create a test order in ThinQsmart from Amsterdam
2. Run the webhook manually or wait for cron
3. Check Customer.io: customer should appear with `plaats`
4. Email should trigger automatically

---

## Support & Debugging

### Get help

- **Vercel docs:** https://vercel.com/docs/functions/serverless-functions
- **Vercel KV docs:** https://vercel.com/docs/storage/vercel-kv
- **Customer.io API:** https://customer.io/docs/api/
- **MySQL docs:** https://dev.mysql.com/doc/

---

## Final Checklist

- [ ] Customer.io Account ID + API Key obtained
- [ ] Custom attribute `plaats` created in Customer.io
- [ ] Code pushed to GitHub
- [ ] Project created in Vercel
- [ ] Vercel KV store created
- [ ] Environment variables set in Vercel
- [ ] Manual webhook test successful
- [ ] KV key showing in Vercel Storage dashboard
- [ ] Test order from Amsterdam showing in Customer.io
- [ ] Test order from outside Amsterdam being skipped
- [ ] Email automation configured in Customer.io
- [ ] Cron job enabled (Pro plan) or external cron set up
- [ ] Logs monitored and no errors

---

## Zero Database Changes Verified

✅ No SQL tables created  
✅ No SQL triggers installed  
✅ No modifications to existing tables  
✅ No schema changes  
✅ Completely read-only on database  
✅ Your database is safe!

---

**You're all set!** Orders from Amsterdam will now automatically sync to Customer.io in real-time. 🚀
