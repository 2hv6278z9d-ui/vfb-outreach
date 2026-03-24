import 'dotenv/config';
import { createTransport } from 'nodemailer';
import { parse } from 'csv-parse/sync';
import { readFileSync, appendFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

const {
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  LANDING_PAGE_URL,
  CALENDAR_LINK,
  SENDER_NAME,
  DELAY_BETWEEN_EMAILS_MS = 15000,
  DAILY_LIMIT = 100,
} = process.env;

const BASE_URL = LANDING_PAGE_URL || CALENDAR_LINK;
const IS_TEST  = process.argv.includes('--test');

const LOG_FILE         = join(__dirname, 'logs', `followup-${new Date().toISOString().split('T')[0]}.log`);
const SENT_TRACKER     = join(__dirname, 'logs', 'sent-emails.txt');
const FOLLOWUP_TRACKER = join(__dirname, 'logs', 'followup-sent.txt');
const BOOKINGS_FILE    = join(__dirname, 'data', 'bookings.json');
const LEADS_CSV        = join(__dirname, 'leads.csv');

// ── Transporter ──────────────────────────────────────────
const transporter = createTransport({
  host: 'smtp.zoho.com',
  port: 465,
  secure: true,
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
});

// ── Helpers ──────────────────────────────────────────────
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  process.stdout.write(line);
  appendFileSync(LOG_FILE, line);
}

function loadSet(file) {
  if (!existsSync(file)) return new Set();
  return new Set(readFileSync(file, 'utf-8').split('\n').map(e => e.trim().toLowerCase()).filter(Boolean));
}

function buildCTA(lead) {
  const params = new URLSearchParams();
  if (lead.first_name) params.set('first',  lead.first_name);
  if (lead.last_name)  params.set('last',   lead.last_name);
  if (lead.email)      params.set('email',  lead.email);
  if (lead.phone)      params.set('phone',  lead.phone);
  if (lead.branch)     params.set('branch', lead.branch);
  if (lead.state)      params.set('state',  lead.state);
  return `${BASE_URL}?${params.toString()}`;
}

// ── Email Template ───────────────────────────────────────
function buildFollowUp(lead) {
  const firstName = lead.first_name || '';
  const CTA_URL   = buildCTA(lead);
  const hour      = new Date().getHours();
  const timeOfDay = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  const greeting  = firstName ? `Good ${timeOfDay} ${firstName},` : `Good ${timeOfDay},`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; color: #1a1a1a; line-height: 1.7; margin: 0; padding: 0; background: #f9f9f9; }
    .container { max-width: 600px; margin: 0 auto; background: #ffffff; padding: 40px 35px; }
    .greeting { font-size: 16px; margin-bottom: 20px; }
    .body-text { font-size: 15px; margin-bottom: 18px; }
    .cta-wrapper { text-align: center; margin: 30px 0; }
    .cta-btn { display: inline-block; background: #1B3A5C; color: #ffffff !important; text-decoration: none; padding: 14px 40px; border-radius: 6px; font-size: 16px; font-weight: bold; letter-spacing: 0.5px; }
    .divider { border: none; border-top: 1px solid #e0e0e0; margin: 30px 0; }
    .signature { font-size: 15px; margin-top: 30px; color: #333; }
  </style>
</head>
<body>
  <div class="container">
    <p class="greeting">${greeting}</p>

    <p class="body-text">I wanted to quickly follow up regarding the Veteran Family Benefits you requested.</p>

    <p class="body-text">We're still available to walk you through what you qualify for — it only takes a few minutes, and there's no cost or obligation.</p>

    <p class="body-text">If you haven't scheduled yet, you can grab a time here:</p>

    <div class="cta-wrapper">
      <a href="${CTA_URL}" class="cta-btn">Review Your Requested Benefits</a>
    </div>

    <p class="body-text">Let me know if you have any questions — happy to help.</p>

    <hr class="divider">

    <p class="signature">— <strong>${SENDER_NAME}</strong></p>
  </div>
</body>
</html>`;

  const text = `${greeting}

I wanted to quickly follow up regarding the Veteran Family Benefits you requested.

We're still available to walk you through what you qualify for — it only takes a few minutes, and there's no cost or obligation.

If you haven't scheduled yet, you can grab a time here:
${CTA_URL}

Let me know if you have any questions — happy to help.

— ${SENDER_NAME}`;

  return {
    from: `"${SENDER_NAME}" <${GMAIL_USER}>`,
    to: lead.email,
    subject: `${firstName ? firstName + ' — ' : ''}Following Up on Your Veteran Family Benefits`,
    html,
    text,
  };
}

// ── Main ─────────────────────────────────────────────────
async function main() {
  console.log('\n📧  Follow-Up Email System');
  console.log('─'.repeat(40));

  await transporter.verify();
  console.log('✅  Zoho SMTP connected\n');

  // Load all leads from CSV
  const csvData = readFileSync(LEADS_CSV, 'utf-8');
  const allLeads = parse(csvData, { columns: true, skip_empty_lines: true, trim: true });

  // Load tracking sets
  const sentEmails     = loadSet(SENT_TRACKER);     // got the first email
  const followupSent   = loadSet(FOLLOWUP_TRACKER);  // already got follow-up
  const bookedEmails   = existsSync(BOOKINGS_FILE)
    ? new Set(JSON.parse(readFileSync(BOOKINGS_FILE, 'utf-8')).map(b => b.email?.toLowerCase()).filter(Boolean))
    : new Set();

  // Eligible: received first email, not booked, not already followed up
  const eligible = allLeads.filter(l => {
    if (!l.email) return false;
    const e = l.email.toLowerCase();
    return sentEmails.has(e) && !bookedEmails.has(e) && !followupSent.has(e);
  });

  console.log(`📋  Total leads: ${allLeads.length}`);
  console.log(`📨  Received initial email: ${sentEmails.size}`);
  console.log(`📅  Already booked: ${bookedEmails.size}`);
  console.log(`✉️   Already followed up: ${followupSent.size}`);
  console.log(`🎯  Eligible for follow-up: ${eligible.length}\n`);

  if (eligible.length === 0) {
    console.log('✅  No follow-ups needed right now.');
    return;
  }

  if (IS_TEST) console.log('🧪  TEST MODE — sending to first eligible lead only\n');

  const toSend = IS_TEST ? eligible.slice(0, 1) : eligible.slice(0, Number(DAILY_LIMIT));
  let sent = 0, failed = 0;

  for (let i = 0; i < toSend.length; i++) {
    const lead = toSend[i];
    try {
      await transporter.sendMail(buildFollowUp(lead));
      sent++;
      appendFileSync(FOLLOWUP_TRACKER, lead.email.toLowerCase() + '\n');
      log(`SENT [${sent}/${toSend.length}] → ${lead.email}`);
    } catch (err) {
      failed++;
      log(`FAIL → ${lead.email}: ${err.message}`);
    }
    if (i < toSend.length - 1) await sleep(Number(DELAY_BETWEEN_EMAILS_MS));
  }

  console.log('\n' + '─'.repeat(40));
  console.log(`✅  Done! Sent: ${sent} | Failed: ${failed}\n`);
}

main().catch(console.error);
