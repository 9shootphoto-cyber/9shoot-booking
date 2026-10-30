/**
 * 預約槽位計算
 * - 根據營業時間生成可預約時段
 * - 扣除 Google Calendar 上已被佔用的時段
 */
import { listBusy } from './calendar.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, '..', 'data');
const BOOKINGS_PATH = path.join(DATA_DIR, 'bookings.json');

const TZ = 'Asia/Macau';

/**
 * 讀取本機預約記錄（即使冇 Google 日曆，都唔會重複被約）
 */
function readLocalBookings() {
  if (!fs.existsSync(BOOKINGS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(BOOKINGS_PATH, 'utf8'));
  } catch {
    return [];
  }
}

/**
 * 取出指定日期已經被預約（未取消）嘅時段
 */
function localBookingsForDate(dateStr) {
  return readLocalBookings().filter(
    (b) => b.date === dateStr && b.status !== 'cancelled'
  );
}

/**
 * 在指定時區取得某日的 Y-M-D
 */
function dateKeyInTZ(date, tz = TZ) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date);
}

/**
 * 把「今天」在指定時區的日期字串
 */
export function todayInTZ(tz = TZ) {
  return dateKeyInTZ(new Date(), tz);
}

/**
 * 建立某日某時間的 Date (以澳門時間為準)
 */
function makeDate(dateStr, timeStr) {
  // 澳門 UTC+8，無日光節約
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(Date.UTC(y, m - 1, d, hh - 8, mm, 0));
}

/**
 * 取得 [fromDate, toDate] 之間的日期字串陣列
 */
export function dateRange(fromDate, toDate) {
  const out = [];
  const cur = new Date(fromDate + 'T00:00:00Z');
  const end = new Date(toDate + 'T00:00:00Z');
  while (cur <= end) {
    out.push(cur.toISOString().slice(0, 10));
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/**
 * 判斷某日是否在可預約範圍內
 */
export function isBookableDate(dateStr, bookingHours, today = todayInTZ()) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const dow = dt.getUTCDay(); // 0=Sun

  if (!bookingHours.days.includes(dow)) return false;

  const diffDays = Math.round((dt - new Date(today + 'T00:00:00Z')) / 86400000);
  if (diffDays < bookingHours.lead_time_days) return false;
  if (diffDays > bookingHours.max_advance_days) return false;

  return true;
}

/**
 * 計算某日的可預約時段
 * @param {string} dateStr  YYYY-MM-DD
 * @param {object} bookingHours
 * @param {number} durationMin 服務時長（分鐘），決定連續可用性
 * @returns {Promise<Array<{time: string, label: string, available: boolean}>>}
 */
export async function computeSlots(dateStr, bookingHours, durationMin = 30) {
  const start = makeDate(dateStr, bookingHours.start);
  const end = makeDate(dateStr, bookingHours.end);

  // 本機已預約時段（無論有無 Google 日曆都要避開）
  const local = localBookingsForDate(dateStr).map((b) => ({
    start: new Date(b.startISO),
    end: new Date(b.endISO),
  }));

  let busy = [];
  let calendarOk = true;
  try {
    busy = await listBusy(start, end);
  } catch (e) {
    calendarOk = false;
    console.error('[slots] 無法讀取日曆忙碌時段：', e.message);
  }

  const allBusy = [...busy, ...local];

  const slots = [];
  const step = bookingHours.slot_minutes;
  const now = Date.now();

  for (let t = start.getTime(); t + durationMin * 60000 <= end.getTime(); t += step * 60000) {
    const slotStart = new Date(t);
    const slotEnd = new Date(t + durationMin * 60000);

    const conflict = allBusy.some((b) => slotStart < b.end && slotEnd > b.start);
    const inPast = slotStart.getTime() < now;

    slots.push({
      time: formatTime(t),
      label: formatTime(t),
      available: !conflict && !inPast,
      reason: conflict ? 'busy' : inPast ? 'past' : null,
      // 冇日曆時，前端可顯示「需人工確認」提示
      unverified: !calendarOk,
    });
  }

  return slots;
}

/**
 * 時間格式化成 HH:MM
 */
function formatTime(ms) {
  const d = new Date(ms);
  const hh = String(d.getUTCHours() + 8).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/**
 * 把 HH:MM 轉成 Date（澳門時間）
 */
export function slotToDate(dateStr, timeStr) {
  return makeDate(dateStr, timeStr);
}
