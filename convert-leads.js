/**
 * convert-leads.js
 * Merges G.csv, G1.csv, and master_leads_final.csv into leads.csv
 * - Parses "Last, First" name format
 * - Normalizes phone numbers
 * - Extracts state from address
 * - Removes duplicates by email
 * - Excludes specific contacts
 */

import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────
const EXCLUDE_EMAILS = [
  'rshdasher@gmail.com', // Rebecca Dasher
];

const INPUT_FILES = [
  { path: '/Users/princejsfsr/Desktop/WORK/Leads/master_leads_final.csv', format: 'master' },
  { path: '/Users/princejsfsr/Desktop/WORK/Leads/G/G.csv',                format: 'g'      },
  { path: '/Users/princejsfsr/Desktop/WORK/Leads/G/G1.csv',               format: 'g'      },
];

const OUTPUT = join(__dirname, 'leads.csv');

// ── Helpers ───────────────────────────────────────────────
function parseName(raw = '') {
  raw = raw.trim();
  if (!raw) return { first_name: '', last_name: '' };

  // "Last, First" → split on first comma
  if (raw.includes(',')) {
    const [last, ...rest] = raw.split(',');
    const first = rest.join(' ').trim();
    return {
      first_name: toTitleCase(first.split(' ')[0]),
      last_name:  toTitleCase(last.trim()),
    };
  }

  // "First Last"
  const parts = raw.split(' ');
  return {
    first_name: toTitleCase(parts[0]),
    last_name:  toTitleCase(parts.slice(1).join(' ')),
  };
}

function toTitleCase(str = '') {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function extractState(address = '') {
  // Try ", State" or "State 12345" patterns at end
  const stateAbbr = address.match(/,\s*([A-Z]{2})\s*(\d{5})?(\s*-\s*\d{4})?$/);
  if (stateAbbr) return stateAbbr[1];
  // Full state name
  const states = {
    'Alabama':'AL','Alaska':'AK','Arizona':'AZ','Arkansas':'AR','California':'CA',
    'Colorado':'CO','Connecticut':'CT','Delaware':'DE','Florida':'FL','Georgia':'GA',
    'Hawaii':'HI','Idaho':'ID','Illinois':'IL','Indiana':'IN','Iowa':'IA','Kansas':'KS',
    'Kentucky':'KY','Louisiana':'LA','Maine':'ME','Maryland':'MD','Massachusetts':'MA',
    'Michigan':'MI','Minnesota':'MN','Mississippi':'MS','Missouri':'MO','Montana':'MT',
    'Nebraska':'NE','Nevada':'NV','New Hampshire':'NH','New Jersey':'NJ','New Mexico':'NM',
    'New York':'NY','North Carolina':'NC','North Dakota':'ND','Ohio':'OH','Oklahoma':'OK',
    'Oregon':'OR','Pennsylvania':'PA','Rhode Island':'RI','South Carolina':'SC',
    'South Dakota':'SD','Tennessee':'TN','Texas':'TX','Utah':'UT','Vermont':'VT',
    'Virginia':'VA','Washington':'WA','West Virginia':'WV','Wisconsin':'WI','Wyoming':'WY',
    'Washington D.C.':'DC',
  };
  for (const [name, abbr] of Object.entries(states)) {
    if (address.includes(name)) return abbr;
  }
  return '';
}

function normalizePhone(raw = '') {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0,3)}) ${digits.slice(3,6)}-${digits.slice(6)}`;
  if (digits.length === 11 && digits[0] === '1') return `(${digits.slice(1,4)}) ${digits.slice(4,7)}-${digits.slice(7)}`;
  return raw.trim();
}

// ── Parse files ───────────────────────────────────────────
const seen = new Set();
const leads = [];

for (const { path, format } of INPUT_FILES) {
  let raw;
  try { raw = readFileSync(path, 'utf-8'); }
  catch { console.error(`Could not read: ${path}`); continue; }

  const rows = parse(raw, { columns: true, skip_empty_lines: true, relax_quotes: true });

  for (const row of rows) {
    let first_name, last_name, email, phone, address;

    if (format === 'master') {
      const name = row['Name'] || row['NAME'] || '';
      const parsed = parseName(name);
      first_name = parsed.first_name;
      last_name  = parsed.last_name;
      email      = (row['Email'] || row['E-MAIL'] || row['email_normalized'] || '').trim().toLowerCase();
      phone      = normalizePhone(row['Phone Number'] || row['NUMBER'] || '');
      address    = row['State'] || row['ADDRESS'] || '';
    } else {
      const parsed = parseName(row['NAME'] || '');
      first_name = parsed.first_name;
      last_name  = parsed.last_name;
      email      = (row['E-MAIL'] || '').trim().toLowerCase();
      phone      = normalizePhone(row['NUMBER'] || '');
      address    = row['ADDRESS'] || '';
    }

    // Skip if no email or phone
    if (!email || !phone) continue;

    // Skip excluded contacts
    if (EXCLUDE_EMAILS.includes(email.toLowerCase())) {
      console.log(`  Excluded: ${first_name} ${last_name} (${email})`);
      continue;
    }

    // Skip duplicates
    if (seen.has(email)) continue;
    seen.add(email);

    // Skip rows that look like date entries (Vermont data had DOB in email column)
    if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(email)) continue;

    const state = extractState(address);

    leads.push({ first_name, last_name, email, phone, branch: '', state });
  }
}

// ── Write output ──────────────────────────────────────────
const header = 'first_name,last_name,email,phone,branch,state\n';
const rows = leads.map(l =>
  [l.first_name, l.last_name, l.email, l.phone, l.branch, l.state]
    .map(v => `"${(v||'').replace(/"/g,'""')}"`)
    .join(',')
).join('\n');

writeFileSync(OUTPUT, header + rows + '\n');

console.log(`\n✓ Done — ${leads.length} leads written to leads.csv`);
console.log(`  Rebecca Dasher excluded ✓`);
