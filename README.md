# Cold Email Outreach System

Local cold email sender for veteran family benefits enrollment.

## Setup

```bash
npm install
cp .env.example .env   # then fill in your Gmail credentials
```

### Gmail App Password (required)
1. Go to Google Account > Security > 2-Step Verification (enable if not already)
2. Go to App Passwords > create one for "Mail"
3. Paste the 16-character password into `.env`

## Usage

```bash
# Preview the email template in browser
npm run preview

# Dry run (shows what would be sent, no emails go out)
node send.js --dry-run

# Send to all unsent leads
npm run send

# Send to first 10 unsent leads only
node send.js --limit 10

# Serve the landing page locally
npm run serve
```

## Files

| File | Purpose |
|------|---------|
| `send.js` | Email sender — reads CSV, sends via Gmail SMTP |
| `preview.js` | Renders template with sample data, opens in browser |
| `leads.csv` | Your lead list (first_name, last_name, email, phone) |
| `templates/veteran-benefits.html` | The email template |
| `landing/index.html` | Scheduling landing page (replaces Typeform) |
| `logs/send-log.json` | Auto-generated send log (tracks who's been emailed) |
| `.env` | Your credentials (never committed) |

## Landing Page

The landing page at `landing/index.html` collects lead info and preferred call time.
Currently stores submissions in localStorage. To connect to Google Calendar or
Google Sheets, see the comments in the `handleSubmit()` function.

## Adding Leads

Edit `leads.csv` — columns: `first_name`, `last_name`, `email`, `phone`

The send log tracks who's already been emailed so you can safely re-run the script
after adding new leads without double-sending.
