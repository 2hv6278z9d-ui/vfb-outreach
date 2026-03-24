import { config } from 'dotenv';
import { fileURLToPath as _ftu } from 'url';
import { dirname as _dn, join as _j } from 'path';
config({ path: _j(_dn(_ftu(import.meta.url)), '.env') });
import express from 'express';
import { createTransport } from 'nodemailer';
import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3001;

const {
  GMAIL_USER,
  GMAIL_APP_PASSWORD,
  SENDER_NAME = 'Regina',
  CALENDAR_LINK,
  AGENT_NOTIFY_EMAIL,
} = process.env;

// ── Setup dirs ───────────────────────────────────────────
mkdirSync(join(__dirname, 'data'), { recursive: true });
mkdirSync(join(__dirname, 'logs'), { recursive: true });

const LEADS_FILE    = join(__dirname, 'data', 'leads.json');
const CSV_FILE      = join(__dirname, 'data', 'leads-submitted.csv');
const BOOKINGS_FILE = join(__dirname, 'data', 'bookings.json');

if (!existsSync(LEADS_FILE))    writeFileSync(LEADS_FILE, '[]');
if (!existsSync(CSV_FILE))      writeFileSync(CSV_FILE, 'first_name,last_name,email,phone,branch,state,submitted_at\n');
if (!existsSync(BOOKINGS_FILE)) writeFileSync(BOOKINGS_FILE, '[]');

// ── Middleware ───────────────────────────────────────────
app.use(express.json());
app.use(express.static(join(__dirname, 'landing')));

// ── Zoho Transporter ─────────────────────────────────────
const transporter = createTransport({
  host: 'smtp.zoho.com',
  port: 465,
  secure: true,
  auth: { user: GMAIL_USER, pass: GMAIL_APP_PASSWORD },
});

// ── Helpers ──────────────────────────────────────────────
function saveToJSON(lead) {
  const leads = JSON.parse(readFileSync(LEADS_FILE, 'utf-8'));
  leads.push(lead);
  writeFileSync(LEADS_FILE, JSON.stringify(leads, null, 2));
}

function saveToCSV(lead) {
  const row = [
    lead.first_name, lead.last_name, lead.email,
    lead.phone, lead.branch, lead.state, lead.submitted_at,
  ].map(v => `"${(v || '').replace(/"/g, '""')}"`).join(',') + '\n';
  appendFileSync(CSV_FILE, row);
}

function logEntry(lead) {
  const logFile = join(__dirname, 'logs', `submissions-${new Date().toISOString().split('T')[0]}.log`);
  appendFileSync(logFile, `[${lead.submitted_at}] ${lead.first_name} ${lead.last_name} | ${lead.phone} | ${lead.email}\n`);
}

async function notifyAgentNewLead(lead) {
  if (!AGENT_NOTIFY_EMAIL || !GMAIL_USER) return;
  await transporter.sendMail({
    from: `"VFB System" <${GMAIL_USER}>`,
    to: AGENT_NOTIFY_EMAIL,
    subject: `New Lead: ${lead.first_name} ${lead.last_name} — ${lead.phone}`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:540px;margin:0 auto;background:#fff;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
        <div style="background:#0D1F3C;padding:24px 28px;">
          <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#C49A3C;margin-bottom:6px;">New Form Submission</div>
          <div style="font-size:24px;font-weight:700;color:#fff;">${lead.first_name} ${lead.last_name}</div>
        </div>
        <div style="padding:24px 28px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:10px 0;color:#888;border-bottom:1px solid #f0f0f0;width:100px;">Phone</td>
                <td style="padding:10px 0;font-weight:600;border-bottom:1px solid #f0f0f0;">${lead.phone}</td></tr>
            <tr><td style="padding:10px 0;color:#888;border-bottom:1px solid #f0f0f0;">Email</td>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">${lead.email}</td></tr>
            <tr><td style="padding:10px 0;color:#888;border-bottom:1px solid #f0f0f0;">Branch</td>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">${lead.branch || '—'}</td></tr>
            <tr><td style="padding:10px 0;color:#888;">State</td>
                <td style="padding:10px 0;">${lead.state || '—'}</td></tr>
          </table>
        </div>
        <div style="padding:0 28px 24px;font-size:12px;color:#aaa;">
          Submitted on ${new Date().toLocaleString()} via Veteran Family Benefits
        </div>
      </div>
    `,
  });
}

async function notifyAgentBooking(lead, date, time) {
  if (!AGENT_NOTIFY_EMAIL || !GMAIL_USER) return;
  await transporter.sendMail({
    from: `"VFB System" <${GMAIL_USER}>`,
    to: AGENT_NOTIFY_EMAIL,
    subject: `New Appointment: ${lead.first_name} ${lead.last_name} — ${date} at ${time}`,
    html: `
      <div style="font-family:'Segoe UI',sans-serif;max-width:540px;margin:0 auto;background:#fff;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden;">
        <div style="background:#0D1F3C;padding:24px 28px;">
          <div style="font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#C49A3C;margin-bottom:6px;">New Appointment Booked</div>
          <div style="font-size:24px;font-weight:700;color:#fff;">${lead.first_name} ${lead.last_name}</div>
        </div>
        <div style="background:#C49A3C;padding:14px 28px;display:flex;gap:30px;">
          <div>
            <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(0,0,0,0.5);margin-bottom:2px;">Date</div>
            <div style="font-size:16px;font-weight:700;color:#0D1F3C;">${date}</div>
          </div>
          <div>
            <div style="font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:rgba(0,0,0,0.5);margin-bottom:2px;">Time</div>
            <div style="font-size:16px;font-weight:700;color:#0D1F3C;">${time}</div>
          </div>
        </div>
        <div style="padding:24px 28px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;">
            <tr><td style="padding:10px 0;color:#888;border-bottom:1px solid #f0f0f0;width:100px;">Phone</td>
                <td style="padding:10px 0;font-weight:600;border-bottom:1px solid #f0f0f0;">${lead.phone}</td></tr>
            <tr><td style="padding:10px 0;color:#888;border-bottom:1px solid #f0f0f0;">Email</td>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">${lead.email}</td></tr>
            <tr><td style="padding:10px 0;color:#888;border-bottom:1px solid #f0f0f0;">Branch</td>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">${lead.branch || '—'}</td></tr>
            <tr><td style="padding:10px 0;color:#888;border-bottom:1px solid #f0f0f0;">State</td>
                <td style="padding:10px 0;border-bottom:1px solid #f0f0f0;">${lead.state || '—'}</td></tr>
            <tr><td style="padding:10px 0;color:#888;">Spouse / Partner</td>
                <td style="padding:10px 0;font-weight:600;color:#0D1F3C;">${lead.spouse_name || '—'}</td></tr>
          </table>
        </div>
        <div style="padding:0 28px 24px;font-size:12px;color:#aaa;">
          Booked on ${new Date().toLocaleString()} via Veteran Family Benefits
        </div>
      </div>
    `,
  });
}

// ── POST /api/lead — save form info ──────────────────────
app.post('/api/lead', async (req, res) => {
  try {
    const { first_name, last_name, email, phone, branch, state } = req.body;
    if (!first_name || !email || !phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const lead = { first_name, last_name, email, phone, branch, state, submitted_at: new Date().toISOString() };

    saveToJSON(lead);
    saveToCSV(lead);
    logEntry(lead);
    await notifyAgentNewLead(lead);

    console.log(`New lead: ${lead.first_name} ${lead.last_name} | ${lead.phone} | ${lead.email}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Lead save error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── POST /api/book — send booking email to Regina ────────
app.post('/api/book', async (req, res) => {
  try {
    const { lead, date, time } = req.body;
    if (!lead || !date || !time) {
      return res.status(400).json({ error: 'Missing booking info' });
    }

    await notifyAgentBooking(lead, date, time);

    // Save booking so follow-up script can skip this person
    const bookings = JSON.parse(readFileSync(BOOKINGS_FILE, 'utf-8'));
    bookings.push({ ...lead, date, time, booked_at: new Date().toISOString() });
    writeFileSync(BOOKINGS_FILE, JSON.stringify(bookings, null, 2));

    console.log(`Booking: ${lead.first_name} ${lead.last_name} | ${date} at ${time}`);
    res.json({ ok: true });
  } catch (err) {
    console.error('Booking error:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── GET /api/leads — view all leads ──────────────────────
app.get('/api/leads', (req, res) => {
  const leads = JSON.parse(readFileSync(LEADS_FILE, 'utf-8'));
  res.json({ count: leads.length, leads });
});

// ── Serve landing for all other routes ───────────────────
app.get('*', (req, res) => {
  res.sendFile(join(__dirname, 'landing', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`\n  VFB Landing Server`);
  console.log(`  http://localhost:${PORT}`);
  console.log(`  Leads: http://localhost:${PORT}/api/leads`);
  console.log(`  Agent notifications: ${AGENT_NOTIFY_EMAIL || 'not set (add AGENT_NOTIFY_EMAIL to .env)'}\n`);
});
