// Sends a text file as one Telegram message (U8, FR-17). Without TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID it only prints the text and exits 0.
// Usage: node pipeline/telegram.mjs <message file>
import { existsSync, readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file || !existsSync(file)) { console.log('telegram: no message file, nothing to send'); process.exit(0); }
const text = readFileSync(file, 'utf8').trim();
const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_CHAT_ID: chat } = process.env;
if (!token || !chat) {
  console.log('telegram: TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID is not set, printing instead of sending:\n\n' + text);
  process.exit(0);
}
const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
});
if (!r.ok) { console.error(`telegram: send failed with status ${r.status}`); process.exit(1); } // never print the response: it can echo the token URL
console.log('telegram: sent');
