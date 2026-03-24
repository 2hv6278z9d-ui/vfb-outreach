import 'dotenv/config';
import { createTransport } from 'nodemailer';
import { parse } from 'csv-parse/sync';
import { readFileSync, appendFileSync, existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ──────────────────────────────────────────────
const {
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  CALENDAR_LINK,
  LANDING_PAGE_URL,
  SENDER_NAME,
  DELAY_BETWEEN_EMAILS_MS = 15000,
  DAILY_LIMIT = 100,
} = process.env;

// CTA goes to landing page (form + video) — falls back to direct calendar
const BASE_URL = LANDING_PAGE_URL || CALENDAR_LINK;

function buildCTA(lead) {
  const params = new URLSearchParams();
  if (lead.first_name) params.set('first', lead.first_name);
  if (lead.last_name)  params.set('last',  lead.last_name);
  if (lead.email)      params.set('email', lead.email);
  if (lead.phone)      params.set('phone', lead.phone);
  if (lead.branch)     params.set('branch', lead.branch);
  if (lead.state)      params.set('state',  lead.state);
  return `${BASE_URL}?${params.toString()}`;
}

const IS_TEST = process.argv.includes('--test');
const CSV_FILE = process.argv.filter(a => !a.startsWith('--'))[2] || 'leads.csv';
const LOG_FILE = join(__dirname, 'logs', `sent-${new Date().toISOString().split('T')[0]}.log`);
const SENT_TRACKER = join(__dirname, 'logs', 'sent-emails.txt');

// Load already-sent emails to avoid duplicates
function loadSentEmails() {
  if (!existsSync(SENT_TRACKER)) return new Set();
  return new Set(readFileSync(SENT_TRACKER, 'utf-8').split('\n').map(e => e.trim().toLowerCase()).filter(Boolean));
}

function markSent(email) {
  appendFileSync(SENT_TRACKER, email.toLowerCase() + '\n');
}

// ── Gmail Transporter ───────────────────────────────────
const transporter = createTransport({
  host: 'smtp.zoho.com',
  port: 465,
  secure: true,
  auth: {
    user: GMAIL_USER,
    pass: GMAIL_APP_PASSWORD,
  },
});

// ── Email Template ──────────────────────────────────────
function buildEmail(lead) {
  const firstName = lead.first_name || lead.name?.split(' ')[0] || '';
  const hour = new Date().getHours();
  const timeOfDay = hour < 12 ? 'Morning' : hour < 17 ? 'Afternoon' : 'Evening';
  const greeting = firstName ? `Good ${timeOfDay} ${firstName},` : `Good ${timeOfDay},`;
  const CTA_URL = buildCTA(lead);

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
    .cta-btn:hover { background: #244a73; }
    .signature { font-size: 15px; margin-top: 30px; color: #333; }
    .closing { font-size: 15px; color: #555; margin-top: 25px; font-style: italic; }
    .divider { border: none; border-top: 1px solid #e0e0e0; margin: 30px 0; }
    .footer { font-size: 12px; color: #999; text-align: center; margin-top: 20px; }
  </style>
</head>
<body>
  <div class="container">
    <p class="greeting">${greeting}</p>

    <p class="body-text">My name is ${SENDER_NAME} — I'm reaching out to follow up on the Veteran Family Benefits you requested.</p>

    <p class="body-text">I'd like to schedule a quick virtual consultation to walk you through what you're eligible for and answer any questions. There's no cost and no obligation — just a simple review so you can see exactly what's available to you and your family.</p>

    <div class="cta-wrapper">
      <a href="${CTA_URL}" class="cta-btn">Review Your Requested Benefits</a>
    </div>

    <p class="body-text">The call can be done by phone or computer at whatever time works best for you.</p>

    <p class="body-text">If you have any questions before booking, feel free to reply — happy to help.</p>

    <hr class="divider">

    <p class="signature">— <strong>${SENDER_NAME}</strong></p>
  </div>
</body>
</html>`;

  const text = `${greeting}

My name is ${SENDER_NAME} — I'm reaching out to follow up on the Veteran Family Benefits you requested.

I'd like to schedule a quick virtual consultation to walk you through what you're eligible for and answer any questions. There's no cost and no obligation — just a simple review so you can see exactly what's available to you and your family.

${CTA_URL}

The call can be done by phone or computer at whatever time works best for you.

If you have any questions before booking, feel free to reply — happy to help.

— ${SENDER_NAME}`;

  return {
    from: `"${SENDER_NAME}" <${GMAIL_USER}>`,
    to: lead.email,
    subject: `${firstName ? firstName + ' — ' : ''}A Message Regarding Your Veteran Family Benefits`,
    html,
    text,
  };
}

// ── Logging ─────────────────────────────────────────────
function log(message) {
  const timestamp = new Date().toISOString();
  const line = `[${timestamp}] ${message}\n`;
  process.stdout.write(line);
  appendFileSync(LOG_FILE, line);
}

// ── Sleep ───────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Main ────────────────────────────────────────────────
async function main() {
  console.log('\n📧  Cold Email Outreach System');
  console.log('─'.repeat(40));

  // Verify connection
  try {
    await transporter.verify();
    console.log('✅  Gmail SMTP connected\n');
  } catch (err) {
    console.error('❌  Gmail connection failed:', err.message);
    console.error('   Check your GMAIL_USER and GMAIL_APP_PASSWORD in .env');
    process.exit(1);
  }

  // Load CSV
  const csvPath = join(__dirname, CSV_FILE);
  if (!existsSync(csvPath)) {
    console.error(`❌  CSV file not found: ${csvPath}`);
    console.error('   Create a leads.csv with columns: first_name, email');
    process.exit(1);
  }

  const csvData = readFileSync(csvPath, 'utf-8');
  const leads = parse(csvData, { columns: true, skip_empty_lines: true, trim: true });

  const sentEmails = loadSentEmails();
  const unsent = leads.filter(l => l.email && !sentEmails.has(l.email.toLowerCase()));

  console.log(`📋  Loaded ${leads.length} leads from ${CSV_FILE}`);
  console.log(`✅  Already sent: ${sentEmails.size} | Remaining: ${unsent.length}`);
  console.log(`⏱   Delay between emails: ${DELAY_BETWEEN_EMAILS_MS / 1000}s`);
  console.log(`📊  Daily limit: ${DAILY_LIMIT}\n`);

  if (IS_TEST) {
    console.log('🧪  TEST MODE — sending to first unsent lead only\n');
  }

  if (unsent.length === 0) {
    console.log('🎉  All leads have been contacted. Campaign complete!');
    return;
  }

  const toSend = IS_TEST ? unsent.slice(0, 1) : unsent.slice(0, Number(DAILY_LIMIT));
  let sent = 0;
  let failed = 0;

  for (let i = 0; i < toSend.length; i++) {
    const lead = toSend[i];
    if (!lead.email) {
      log(`SKIP - No email for: ${lead.first_name || 'unknown'}`);
      continue;
    }

    try {
      const mailOptions = buildEmail(lead);
      const info = await transporter.sendMail(mailOptions);
      sent++;
      markSent(lead.email);
      log(`SENT [${sent}/${toSend.length}] → ${lead.email} (${info.messageId})`);
    } catch (err) {
      failed++;
      log(`FAIL → ${lead.email}: ${err.message}`);
    }

    // Rate limit (skip delay on last email)
    if (i < toSend.length - 1) {
      await sleep(Number(DELAY_BETWEEN_EMAILS_MS));
    }
  }

  console.log('\n' + '─'.repeat(40));
  console.log(`✅  Done! Sent: ${sent} | Failed: ${failed}`);
  console.log(`📄  Log: ${LOG_FILE}\n`);
}

main().catch(console.error);
