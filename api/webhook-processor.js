// ============================================
// ThinQsmart → Customer.io Integration
// Vercel Serverless Function + Vercel KV
// Gemeente filter (Amsterdam) + Email filtering
// ============================================

import { kv } from '@vercel/kv';
import mysql from 'mysql2/promise';

// Parse gemeente cities from environment
function parseGemeentePlaces() {
  const placesStr = process.env.GEMEENTE_PLACES || '';
  return placesStr
    .split(',')
    .map(place => place.trim())
    .filter(place => place.length > 0);
}

// Parse excluded emails from environment
function parseExcludedEmails() {
  const excludedStr = process.env.EXCLUDE_EMAILS || '';
  return excludedStr
    .split(',')
    .map(email => email.trim().toLowerCase())
    .filter(email => email.length > 0);
}

const GEMEENTE_PLACES = parseGemeentePlaces();
const EXCLUDED_EMAILS = parseExcludedEmails();
const DRY_RUN = String(process.env.DRY_RUN).toLowerCase() === 'true';
const CUSTOMER_IO_SITE_ID = process.env.CUSTOMER_IO_SITE_ID;
const CUSTOMER_IO_TRACK_API_KEY = process.env.CUSTOMER_IO_TRACK_API_KEY;
// EU-workspaces gebruiken track-eu, US-workspaces track. Default EU.
const CUSTOMER_IO_BASE_URL =
  (process.env.CUSTOMER_IO_REGION || 'eu').toLowerCase() === 'us'
    ? 'https://track.customer.io/api/v1'
    : 'https://track-eu.customer.io/api/v1';

// MySQL configuration (replica, read-only)
const DB_CONFIG = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 1,
  queueLimit: 0,
};

let pool;

// Initialize connection pool
async function initPool() {
  if (!pool) {
    pool = await mysql.createPool(DB_CONFIG);
  }
  return pool;
}

// Startpunt als de KV-store nog leeg is.
// ZONDER dit begint de sync bij order-ID 0 en mailt hij je hele orderhistorie.
function getStartFromOrderId() {
  const raw = process.env.START_FROM_ORDER_ID;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

// Get last processed order ID from Vercel KV
async function getLastProcessedOrderId() {
  try {
    const lastId = await kv.get('thinqsmart:last_processed_order_id');
    if (lastId === null || lastId === undefined) return getStartFromOrderId();
    const parsed = parseInt(lastId, 10);
    return Number.isFinite(parsed) ? parsed : getStartFromOrderId();
  } catch (error) {
    console.error('Error getting last processed ID from KV:', error.message);
    throw error;
  }
}

// Fetch unprocessed orders from replica
async function getUnprocessedOrders(lastProcessedId) {
  const connection = await initPool();
  const conn = await connection.getConnection();

  try {
    const query = `
      SELECT
        o.id AS order_id,
        w.name AS webshop_name,
        a.city AS plaats,
        c.email AS email
      FROM msg_orders o
      LEFT JOIN msg_webshops w ON o.webshop_id = w.id
      LEFT JOIN msg_addresses a ON a.id = o.delivery_address_id
      LEFT JOIN msg_customers c ON o.customer_id = c.id
      WHERE o.id > ?
      AND o.company_id = 1
      AND o.deleted_at IS NULL
      ORDER BY o.id ASC
      LIMIT 50;
    `;

    const [rows] = await conn.execute(query, [lastProcessedId]);
    return rows;
  } finally {
    conn.release();
  }
}

// Check if plaats is in gemeente
function isInGemeente(plaats) {
  if (!plaats) return false;
  return GEMEENTE_PLACES.some(
    place => place.toLowerCase() === plaats.toLowerCase()
  );
}

// Check if email should be excluded
function isEmailExcluded(email) {
  if (!email) return true;
  return EXCLUDED_EMAILS.includes(email.toLowerCase());
}

// Send customer data to Customer.io
async function sendToCustomerIO(order) {
  const { email, plaats, webshop_name } = order;

  const auth = Buffer.from(
    `${CUSTOMER_IO_SITE_ID}:${CUSTOMER_IO_TRACK_API_KEY}`
  ).toString('base64');

  // Track API v1: attributen staan op top-level, niet in custom_fields
  const payload = {
    email,
    plaats: plaats || 'Onbekend',
    webshop: webshop_name || 'Onbekend',
    sync_date: new Date().toISOString(),
  };

  try {
    const url = `${CUSTOMER_IO_BASE_URL}/customers/${encodeURIComponent(email)}`;
    const response = await fetch(url, {
      method: 'PUT',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Customer.io API error: ${response.status} - ${errorText}`
      );
    }

    return { success: true, status: response.status };
  } catch (error) {
    console.error(`Failed to send to Customer.io:`, error.message);
    throw error;
  }
}

// Update last processed order ID in Vercel KV
async function updateLastProcessedOrderId(orderId) {
  try {
    await kv.set('thinqsmart:last_processed_order_id', orderId.toString());
  } catch (error) {
    console.error('Error updating KV:', error.message);
    throw error;
  }
}

// Main handler
export default async function handler(req, res) {
  // Only allow GET requests (for cron/scheduled triggers)
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Optional: Add security token validation
  if (process.env.WEBHOOK_SECRET && req.query.secret !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('Starting sync...');
    console.log(`Gemeente places:`, GEMEENTE_PLACES);
    console.log(`Excluded emails:`, EXCLUDED_EMAILS);

    // Get last processed order ID from Vercel KV
    const lastProcessedId = await getLastProcessedOrderId();
    console.log(`Last processed order ID: ${lastProcessedId}`);

    // Fetch unprocessed orders
    const orders = await getUnprocessedOrders(lastProcessedId);

    if (orders.length === 0) {
      return res.status(200).json({
        success: true,
        processed: 0,
        message: 'No new orders to process',
        last_processed_id: lastProcessedId,
      });
    }

    console.log(`Processing ${orders.length} new orders...`);
    const results = [];
    let maxOrderId = lastProcessedId;

    for (const order of orders) {
      try {
        const { order_id, plaats, email } = order;

        // Check if plaats is in gemeente
        if (!isInGemeente(plaats)) {
          console.log(`⊘ Order ${order_id}: Plaats "${plaats}" not in gemeente`);
          results.push({
            order_id,
            email,
            plaats,
            status: 'skipped',
            reason: 'plaats_not_in_gemeente',
          });
          if (order_id > maxOrderId) maxOrderId = order_id;
          continue;
        }

        // Check if email is excluded
        if (isEmailExcluded(email)) {
          console.log(`⊘ Order ${order_id}: Email excluded (${email})`);
          results.push({
            order_id,
            email,
            plaats,
            status: 'skipped',
            reason: 'email_excluded',
          });
          if (order_id > maxOrderId) maxOrderId = order_id;
          continue;
        }

        console.log(`Processing order ${order_id}: ${email} (${plaats})`);

        // DRY_RUN=true: alles doorlopen en filteren, maar niets versturen
        if (DRY_RUN) {
          results.push({ order_id, email, plaats, status: 'dry_run' });
          if (order_id > maxOrderId) maxOrderId = order_id;
          continue;
        }

        // Send to Customer.io
        await sendToCustomerIO(order);

        results.push({
          order_id,
          email,
          plaats,
          status: 'success',
        });

        if (order_id > maxOrderId) maxOrderId = order_id;
        console.log(`✓ Order ${order_id} processed successfully`);
      } catch (error) {
        console.error(`✗ Order ${order.order_id} failed:`, error.message);
        results.push({
          order_id: order.order_id,
          email: order.email,
          plaats: order.plaats,
          status: 'error',
          error: error.message,
        });
        if (order.order_id > maxOrderId) maxOrderId = order.order_id;
      }
    }

    // Update Vercel KV with highest processed order ID
    if (maxOrderId > lastProcessedId) {
      await updateLastProcessedOrderId(maxOrderId);
      console.log(`Updated KV to order ID: ${maxOrderId}`);
    }

    const successCount = results.filter(r => r.status === 'success').length;
    const dryRunCount = results.filter(r => r.status === 'dry_run').length;
    const skippedCount = results.filter(r => r.status === 'skipped').length;
    const errorCount = results.filter(r => r.status === 'error').length;

    res.status(200).json({
      success: true,
      dry_run: DRY_RUN,
      processed: successCount,
      would_send: dryRunCount,
      skipped: skippedCount,
      failed: errorCount,
      total: results.length,
      last_processed_id: maxOrderId,
      details: results,
    });
  } catch (error) {
    console.error('Fatal error:', error.message);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
}
