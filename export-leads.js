import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const LEADS_FILE = join(__dirname, 'data', 'leads.json');
const OUTPUT = join(__dirname, 'data', `leads-export-${new Date().toISOString().split('T')[0]}.csv`);

if (!existsSync(LEADS_FILE)) {
  console.log('❌ No leads file found. Run the landing page server first.');
  process.exit(1);
}

const leads = JSON.parse(readFileSync(LEADS_FILE, 'utf-8'));

if (leads.length === 0) {
  console.log('📭 No leads yet.');
  process.exit(0);
}

const headers = ['first_name', 'last_name', 'email', 'phone', 'branch', 'state', 'submitted_at'];
const csv = [
  headers.join(','),
  ...leads.map(l => headers.map(h => `"${(l[h] || '').replace(/"/g, '""')}"`).join(','))
].join('\n');

writeFileSync(OUTPUT, csv);
console.log(`✅ Exported ${leads.length} leads to ${OUTPUT}`);
