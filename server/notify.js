/**
 * Telegram 預約通知
 * 預約成功後即時推送到 Chan 嘅 Telegram，確保唔會漏單
 * 讀取 Mavis 現有 Telegram 憑證，唔使另外配置
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CREDS_PATH = path.join(
  os.homedir(),
  '.minimax',
  'credentials',
  'mavis',
  'telegram.json'
);

// Chan 嘅 Telegram chat ID（環境變數優先，預設來自 channel-owner.yaml）
const CHAT_ID = process.env.TELEGRAM_CHAT_ID || '6687684829';

/**
 * 讀取 bot token
 * 優先用環境變數（部署環境用），本機先 fallback 去 Mavis 憑證
 */
function getBotToken() {
  // 部署環境（Render / Railway）用環境變數
  if (process.env.TELEGRAM_BOT_TOKEN) return process.env.TELEGRAM_BOT_TOKEN;

  // 本機開發：讀 Mavis 現有憑證
  try {
    if (fs.existsSync(CREDS_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CREDS_PATH, 'utf8'));
      const token = raw?.credentials?.botToken || raw?.botToken;
      if (token) return token;
    }
  } catch (e) {
    console.error('[telegram] 讀取憑證失敗：', e.message);
  }
  return null;
}

/**
 * 發送 Telegram 訊息
 */
async function sendTelegram(text) {
  const token = getBotToken();
  if (!token) {
    console.warn('[telegram] 未設定 bot token，跳過通知');
    return { ok: false, reason: 'no_token' };
  }

  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = await res.json();
    if (!res.ok || !data.ok) {
      console.error('[telegram] 發送失敗：', data.description || res.status);
      return { ok: false, reason: data.description || `http_${res.status}` };
    }

    console.log('[telegram] 預約通知已發送');
    return { ok: true };
  } catch (e) {
    console.error('[telegram] 發送例外：', e.message);
    return { ok: false, reason: e.message };
  }
}

/**
 * 預約通知格式
 */
export async function notifyBooking(booking, service) {
  const lines = [
    '📸 <b>新預約 — 9Shoot Photo Studio</b>',
    '',
    `<b>服務：</b>${service.name_zh}（${service.duration_min} 分鐘）`,
    `<b>日期時間：</b>${booking.date} ${booking.time}`,
    `<b>客人：</b>${booking.name}`,
    `<b>電話：</b>${booking.phone}`,
  ];

  if (booking.email) lines.push(`<b>Email：</b>${booking.email}`);
  if (booking.preferredContact && booking.preferredContact !== 'phone') {
    const labels = { whatsapp: 'WhatsApp', email: 'Email' };
    lines.push(`<b>偏好聯絡：</b>${labels[booking.preferredContact] || booking.preferredContact}`);
  }
  if (booking.note) lines.push(`<b>備註：</b>${booking.note}`);

  lines.push(
    '',
    `<b>起價：</b>MOP ${booking.priceFrom.toLocaleString()}`,
    `<b>編號：</b>${booking.id}`,
    '',
    '💡 回覆客人確認時間後，可手動加落 Google 日曆。'
  );

  return sendTelegram(lines.join('\n'));
}

/**
 * 取消預約通知
 */
export async function notifyCancellation(booking) {
  const lines = [
    '❌ <b>預約已取消 — 9Shoot</b>',
    '',
    `<b>服務：</b>${booking.serviceNameZh}`,
    `<b>原定時間：</b>${booking.date} ${booking.time}`,
    `<b>客人：</b>${booking.name}（${booking.phone}）`,
    `<b>編號：</b>${booking.id}`,
  ];
  return sendTelegram(lines.join('\n'));
}
