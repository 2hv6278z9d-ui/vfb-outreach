import 'dotenv/config';
import { parse } from 'csv-parse/sync';
import { stringify } from 'csv-stringify/sync';
import { readFileSync, writeFileSync, existsSync } from 'fs';

// ── US state name → abbreviation ─────────────────────────
const STATE_MAP = {
  'alabama':'AL','alaska':'AK','arizona':'AZ','arkansas':'AR','california':'CA',
  'colorado':'CO','connecticut':'CT','delaware':'DE','florida':'FL','georgia':'GA',
  'hawaii':'HI','idaho':'ID','illinois':'IL','indiana':'IN','iowa':'IA',
  'kansas':'KS','kentucky':'KY','louisiana':'LA','maine':'ME','maryland':'MD',
  'massachusetts':'MA','michigan':'MI','minnesota':'MN','mississippi':'MS','missouri':'MO',
  'montana':'MT','nebraska':'NE','nevada':'NV','new hampshire':'NH','new jersey':'NJ',
  'new mexico':'NM','new york':'NY','north carolina':'NC','north dakota':'ND','ohio':'OH',
  'oklahoma':'OK','oregon':'OR','pennsylvania':'PA','rhode island':'RI','south carolina':'SC',
  'south dakota':'SD','tennessee':'TN','texas':'TX','utah':'UT','vermont':'VT',
  'virginia':'VA','washington':'WA','west virginia':'WV','wisconsin':'WI','wyoming':'WY',
  'district of columbia':'DC','washington dc':'DC','washington d.c.':'DC',
};
const STATE_ABBREVS = new Set(Object.values(STATE_MAP));

function extractState(address) {
  if (!address) return '';
  // Try matching 2-letter state abbreviation before zip or at end
  const abbrevMatch = address.match(/,\s*([A-Z]{2})\s*(?:\d{5})?(?:\s*$|,)/);
  if (abbrevMatch && STATE_ABBREVS.has(abbrevMatch[1])) return abbrevMatch[1];
  // Try full state name
  const lower = address.toLowerCase();
  for (const [name, abbrev] of Object.entries(STATE_MAP)) {
    if (lower.includes(name)) return abbrev;
  }
  return '';
}

function parseName(raw) {
  if (!raw) return { first: '', last: '' };
  raw = raw.trim();
  if (raw.includes(',')) {
    // "Last, First" format
    const [last, ...rest] = raw.split(',');
    return { first: rest.join(' ').trim(), last: last.trim() };
  }
  // "First Last" format
  const parts = raw.trim().split(/\s+/);
  return { first: parts[0] || '', last: parts.slice(1).join(' ') || '' };
}

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

// ── EXCLUDE LIST ──────────────────────────────────────────
const EXCLUDE = ['rebecca dasher'];

function isExcluded(first, last) {
  const full = `${first} ${last}`.toLowerCase().trim();
  return EXCLUDE.some(name => full.includes(name));
}

// ── Load & normalize leads ────────────────────────────────
const files = [
  '/Users/princejsfsr/Desktop/WORK/Leads/master_leads_final.csv',
  '/Users/princejsfsr/Desktop/WORK/Leads/G/G.csv',
  '/Users/princejsfsr/Desktop/WORK/Leads/G/G1.csv',
];

const seen = new Set();
const leads = [];
let skipped = 0;
let excluded = 0;

for (const file of files) {
  if (!existsSync(file)) { console.warn(`⚠️  Not found: ${file}`); continue; }
  const raw = readFileSync(file, 'utf-8');
  const rows = parse(raw, { columns: true, skip_empty_lines: true, trim: true, relaxColumnCount: true });

  for (const row of rows) {
    // Normalize columns across different file formats
    const nameRaw  = row['Name'] || row['NAME'] || '';
    const emailRaw = row['Email'] || row['E-MAIL'] || row['email_normalized'] || '';
    const phoneRaw = row['Phone Number'] || row['Number'] || row['NUMBER'] || '';
    const addrRaw  = row['State'] || row['Address'] || row['ADDRESS'] || '';

    const email = normalizeEmail(emailRaw);
    if (!email || !email.includes('@')) { skipped++; continue; }
    if (seen.has(email)) { skipped++; continue; }

    const { first, last } = parseName(nameRaw);
    if (!first && !last) { skipped++; continue; }

    if (isExcluded(first, last)) { excluded++; console.log(`🚫  Excluded: ${first} ${last}`); continue; }

    const state = extractState(addrRaw);
    const phone = phoneRaw.replace(/[^\d]/g, '').slice(0, 10);

    seen.add(email);
    leads.push({ first_name: first, last_name: last, email, phone, branch: '', state });
  }
}

// ── Write output ──────────────────────────────────────────
const out = stringify(leads, { header: true });
writeFileSync('/Volumes/RECHARGE/GRINGOTTS/Random/cold-email-outreach/leads.csv', out);

console.log(`\n✅  Done!`);
console.log(`📋  Total leads ready: ${leads.length}`);
console.log(`🚫  Excluded: ${excluded}`);
console.log(`⏭️   Skipped (no email / duplicate): ${skipped}`);
console.log(`📄  Saved to: leads.csv`);
console.log(`⏱️   At 100/day → ~${Math.ceil(leads.length / 100)} days to complete\n`);
