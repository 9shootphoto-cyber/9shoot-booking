/**
 * Google Calendar 整合模組
 * - 讀取指定日期範圍內的忙碌時段
 * - 建立預約 event
 * - OAuth2 token 持久化到 data/token.json
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const TOKEN_PATH = path.join(DATA_DIR, 'token.json');

export const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

let authClient = null;

/**
 * 建立 OAuth2 client
 * Token 存在 data/token.json，可以自動 refresh
 */
export function getAuthClient() {
  if (authClient) return authClient;

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3000/oauth2callback';

  if (!clientId || !clientSecret) {
    return null;
  }

  authClient = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      authClient.setCredentials(token);
    } catch (e) {
      console.error('[calendar] token.json 讀取失敗：', e.message);
    }
  }

  return authClient;
}

/**
 * 儲存 / 更新 token
 */
export function saveToken(token) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(token, null, 2));
  console.log('[calendar] token 已儲存');
}

/**
 * 檢查是否已授權
 */
export function isAuthorized() {
  const client = getAuthClient();
  if (!client) return false;
  if (fs.existsSync(TOKEN_PATH)) {
    try {
      const token = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8'));
      return !!(token.access_token || token.refresh_token);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * 取得 OAuth2 授權 URL
 */
export function getAuthUrl() {
  const client = getAuthClient();
  if (!client) return null;
  return client.generateAuthUrl({
    access_type: 'offline',
    scope: ['https://www.googleapis.com/auth/calendar'],
    prompt: 'consent',
  });
}

/**
 * 用 code 換 token
 */
export async function exchangeCode(code) {
  const client = getAuthClient();
  if (!client) throw new Error('Google OAuth 未設定 (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)');
  const { tokens } = await client.getToken(code);
  client.setCredentials(tokens);
  saveToken(tokens);
  return tokens;
}

/**
 * 列出某段時間內的忙碌時段
 * @returns {Promise<Array<{start: Date, end: Date}>>}
 */
export async function listBusy(startDate, endDate) {
  const client = getAuthClient();
  if (!client) throw new Error('Google OAuth 未設定');
  const calendar = google.calendar({ version: 'v3', auth: client });

  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: startDate.toISOString(),
      timeMax: endDate.toISOString(),
      timeZone: 'Asia/Macau',
      items: [{ id: CALENDAR_ID }],
    },
  });

  const calendars = res.data.calendars || {};
  const entry = calendars[CALENDAR_ID];
  const busy = entry?.busy || [];

  return busy.map((b) => ({
    start: new Date(b.start),
    end: new Date(b.end),
  }));
}

/**
 * 建立預約 event
 */
export async function createBookingEvent({
  summary,
  description,
  start,
  end,
  attendeeName,
  attendeePhone,
  attendeeEmail,
  serviceName,
  durationMin,
  priceFrom,
}) {
  const client = getAuthClient();
  if (!client) throw new Error('Google OAuth 未設定');
  const calendar = google.calendar({ version: 'v3', auth: client });

  const lines = [
    `【${serviceName}】預約`,
    ``,
    `客人：${attendeeName}`,
    `電話：${attendeePhone}`,
  ];
  if (attendeeEmail) lines.push(`Email：${attendeeEmail}`);
  lines.push(
    `時長：${durationMin} 分鐘`,
    `起價：MOP ${priceFrom}`,
    `狀態：待確認 / Pending confirmation`,
    ``,
    `— 9Shoot Photo Studio`,
  );

  const res = await calendar.events.insert({
    calendarId: CALENDAR_ID,
    requestBody: {
      summary: `${serviceName} 預約 — ${attendeeName}`,
      description: lines.join('\n'),
      start: { dateTime: start.toISOString(), timeZone: 'Asia/Macau' },
      end: { dateTime: end.toISOString(), timeZone: 'Asia/Macau' },
      attendees: attendeeEmail ? [{ email: attendeeEmail }] : undefined,
      reminders: {
        useDefault: false,
        overrides: [
          { method: 'popup', minutes: 30 },
          { method: 'email', minutes: 1440 },
        ],
      },
    },
  });

  return res.data;
}

/**
 * 刪除 event (取消預約)
 */
export async function deleteBookingEvent(eventId) {
  const client = getAuthClient();
  if (!client) throw new Error('Google OAuth 未設定');
  const calendar = google.calendar({ version: 'v3', auth: client });
  await calendar.events.delete({ calendarId: CALENDAR_ID, eventId, sendUpdates: 'none' });
}
