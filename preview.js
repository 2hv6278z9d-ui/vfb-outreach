#!/usr/bin/env node
/**
 * Preview an email template rendered with sample lead data.
 * Opens in default browser or prints HTML to stdout.
 *
 * Usage:
 *   node preview.js                    # writes preview.html and opens it
 *   node preview.js --template follow-up
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const args = process.argv.slice(2);
const templateIdx = args.indexOf("--template");
const templateName = templateIdx !== -1 ? args[templateIdx + 1] : "veteran-benefits";

const TEMPLATE_PATH = path.join(__dirname, "templates", `${templateName}.html`);
const OUTPUT_PATH = path.join(__dirname, "preview.html");

if (!fs.existsSync(TEMPLATE_PATH)) {
  console.error(`Template not found: ${TEMPLATE_PATH}`);
  process.exit(1);
}

let html = fs.readFileSync(TEMPLATE_PATH, "utf-8");

// Sample data for preview
const sample = {
  first_name: " John",
  last_name: "Smith",
  email: "john.smith@example.com",
  phone: "(555) 111-2222",
  SENDER_NAME: process.env.SENDER_NAME || "Regina",
  LANDING_URL: process.env.LANDING_URL || "https://veteranfamilybenefits.com",
};

for (const [key, value] of Object.entries(sample)) {
  const regex = new RegExp(`{{\\s*${key}\\s*}}`, "gi");
  html = html.replace(regex, value);
}

fs.writeFileSync(OUTPUT_PATH, html);
console.log(`Preview written to ${OUTPUT_PATH}`);

// Try to open in browser
try {
  if (process.platform === "darwin") {
    execSync(`open "${OUTPUT_PATH}"`);
  } else if (process.platform === "win32") {
    execSync(`start "${OUTPUT_PATH}"`);
  } else {
    execSync(`xdg-open "${OUTPUT_PATH}"`);
  }
  console.log("Opened in browser.");
} catch {
  console.log("Could not open browser. Open preview.html manually.");
}
