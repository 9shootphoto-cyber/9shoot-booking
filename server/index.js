/**
 * 九號攝影館預約系統 — 主伺服器
 */
import 'dotenv/config';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  isAuthorized,
  getAuthUrl,
  exchangeCode,
  createBookingEvent,
  deleteBookingEvent,
  CALENDAR_ID,
} from './calendar.js';
import {
  computeSlots,
  isBookableDate,
  dateRange,
  todayInTZ,
  slotToDate,
} from './slots.js';
import { notifyBooking, notifyCancellation } from './notify.js';
import { sendAutoReply } from './autoreply.js';
import {
  readConfig,
  updateConfig,
  listImages,
  deleteImage,
  renameImage,
  setImageOrder,
  getImageOrder,
  syncOrderAfterDelete,
  compressImage,
  IMG_DIR,
} from './content.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const BOOKINGS_PATH = path.join(DATA_DIR, 'bookings.json');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

const app = express();
const PORT = process.env.PORT || 3000;

// 確保 data 目錄存在（Railway / 首次啟動都可能冇）
fs.mkdirSync(DATA_DIR, { recursive: true });

app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(ROOT, 'public')));

// ===== 讀取設定 =====
function loadConfig() {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'config.json'), 'utf8'));
}

// ===== 預約記錄 (JSON 檔) =====
function readBookings() {
  if (!fs.existsSync(BOOKINGS_PATH)) return [];
  try {
    return JSON.parse(fs.readFileSync(BOOKINGS_PATH, 'utf8'));
  } catch {
    return [];
  }
}

function writeBookings(list) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(BOOKINGS_PATH, JSON.stringify(list, null, 2));
}

function saveBooking(booking) {
  const list = readBookings();
  list.push(booking);
  writeBookings(list);
  return booking;
}

// ===== API =====

/** 取得所有設定（前端載入） */
app.get('/api/config', (req, res) => {
  res.json(loadConfig());
});

/** 健康檢查 + 授權狀態 */
app.get('/api/status', (req, res) => {
  res.json({
    ok: true,
    calendarAuthorized: isAuthorized(),
    calendarId: CALENDAR_ID,
    today: todayInTZ(),
    bookings: readBookings().length,
  });
});

/** 可預約日期列表 */
app.get('/api/dates', (req, res) => {
  const config = loadConfig();
  const bh = config.booking_hours;
  const today = todayInTZ();
  const from = today;
  const to = new Date(new Date(from + 'T00:00:00Z').getTime() + bh.max_advance_days * 86400000)
    .toISOString()
    .slice(0, 10);

  const dates = dateRange(from, to).filter((d) => isBookableDate(d, bh, today));
  res.json({ dates, today });
});

/** 某日的可預約時段 */
app.get('/api/slots', async (req, res) => {
  try {
    const config = loadConfig();
    const bh = config.booking_hours;
    const date = String(req.query.date || '');
    const serviceId = String(req.query.service || '');

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: '日期格式錯誤' });
    }

    const today = todayInTZ();
    if (!isBookableDate(date, bh, today)) {
      return res.json({ date, slots: [], available: false, reason: 'not_bookable' });
    }

    const service = config.services.find((s) => s.id === serviceId) || config.services[0];
    const slots = await computeSlots(date, bh, service.duration_min);

    res.json({ date, slots, available: slots.some((s) => s.available) });
  } catch (e) {
    console.error('[api/slots] 錯誤：', e);
    res.status(500).json({ error: '讀取時段失敗', detail: e.message });
  }
});

/** 提交預約 */
app.post('/api/book', async (req, res) => {
  try {
    const config = loadConfig();
    const bh = config.booking_hours;
    const {
      serviceId,
      date,
      time,
      name,
      phone,
      email,
      note,
      preferredContact,
    } = req.body || {};

    // --- 驗證 ---
    if (!name || !String(name).trim()) return res.status(400).json({ error: '請填寫姓名' });
    // 電話同 Email 都係選填，但至少要有一個，否則無法回覆客人
    const hasPhone = !!(phone && String(phone).trim());
    const hasEmail = !!(email && String(email).trim());
    if (!hasPhone && !hasEmail) {
      return res.status(400).json({
        error: '請填寫聯絡電話或 Email 其中一項，方便我們確認預約',
      });
    }
    if (hasEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
      return res.status(400).json({ error: 'Email 格式唔啱，請檢查' });
    }
    if (!date || !time) return res.status(400).json({ error: '請選擇日期同時間' });

    const service = config.services.find((s) => s.id === serviceId);
    if (!service) return res.status(400).json({ error: '無效的服務項目' });

    const today = todayInTZ();
    if (!isBookableDate(date, bh, today)) {
      return res.status(400).json({ error: '該日期不在可預約範圍內' });
    }

    // 檢查時段衝突
    const slots = await computeSlots(date, bh, service.duration_min);
    const slot = slots.find((s) => s.time === time);
    if (!slot) return res.status(400).json({ error: '無效的時間' });
    if (!slot.available) {
      return res.status(409).json({ error: '該時段剛剛被預約，請重新選擇' });
    }

    const start = slotToDate(date, time);
    const end = new Date(start.getTime() + service.duration_min * 60000);

    // --- 建立日曆 event ---
    let eventId = null;
    let calendarSynced = false;
    if (isAuthorized()) {
      try {
        const event = await createBookingEvent({
          summary: `${service.name_zh} 預約`,
          description: note || '',
          start,
          end,
          attendeeName: name,
          attendeePhone: phone,
          attendeeEmail: email || '',
          serviceName: service.name_zh,
          durationMin: service.duration_min,
          priceFrom: service.price_from,
        });
        eventId = event.id;
        calendarSynced = true;
      } catch (e) {
        console.error('[api/book] 日曆寫入失敗：', e.message);
      }
    }

    // --- 儲存記錄 ---
    const booking = {
      id: `BK-${Date.now().toString(36).toUpperCase()}`,
      createdAt: new Date().toISOString(),
      serviceId: service.id,
      serviceNameZh: service.name_zh,
      serviceNameEn: service.name_en,
      durationMin: service.duration_min,
      priceFrom: service.price_from,
      date,
      time,
      startISO: start.toISOString(),
      endISO: end.toISOString(),
      name: String(name).trim(),
      phone: hasPhone ? String(phone).trim() : '',
      email: hasEmail ? String(email).trim() : '',
      note: note ? String(note).trim() : '',
      preferredContact: preferredContact || (hasPhone ? 'phone' : 'email'),
      calendarEventId: eventId,
      calendarSynced,
      status: 'pending',
    };

    saveBooking(booking);

    // --- Telegram 通知（確保唔會漏單） ---
    let notified = false;
    try {
      const result = await notifyBooking(booking, service);
      notified = result.ok;
    } catch (e) {
      console.error('[api/book] Telegram 通知失敗：', e.message);
    }

    // --- 自動回覆客人 ---
    let autoReply = { channel: 'none', sent: false, link: null };
    try {
      autoReply = await sendAutoReply(booking, service, config);
    } catch (e) {
      console.error('[api/book] 自動回覆失敗：', e.message);
    }

    res.json({
      ok: true,
      booking: {
        id: booking.id,
        serviceId: booking.serviceId,
        service: service.name_zh,
        date,
        time,
        durationMin: service.duration_min,
        priceFrom: service.price_from,
        name: booking.name,
        phone: booking.phone,
      },
      calendarSynced,
      notified,
      autoReply: {
        channel: autoReply.channel,
        sent: autoReply.sent,
        link: autoReply.link,
        text: autoReply.text,
        error: autoReply.error,
      },
    });
  } catch (e) {
    console.error('[api/book] 錯誤：', e);
    res.status(500).json({ error: '預約提交失敗，請稍後再試', detail: e.message });
  }
});

/** 取消預約 */
app.post('/api/cancel', async (req, res) => {
  try {
    const { bookingId } = req.body || {};
    const list = readBookings();
    const idx = list.findIndex((b) => b.id === bookingId);
    if (idx === -1) return res.status(404).json({ error: '搵唔到呢個預約' });

    const booking = list[idx];
    if (booking.calendarEventId && isAuthorized()) {
      try {
        await deleteBookingEvent(booking.calendarEventId);
      } catch (e) {
        console.error('[api/cancel] 日曆刪除失敗：', e.message);
      }
    }

    list[idx] = { ...booking, status: 'cancelled', cancelledAt: new Date().toISOString() };
    writeBookings(list);
    try {
      await notifyCancellation(list[idx]);
    } catch (e) {
      console.error('[api/cancel] Telegram 通知失敗：', e.message);
    }
    res.json({ ok: true });
  } catch (e) {
    console.error('[api/cancel] 錯誤：', e);
    res.status(500).json({ error: '取消失敗' });
  }
});

/** 預約列表 (後台用) */
app.get('/api/bookings', (req, res) => {
  const list = readBookings();
  const sorted = list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ bookings: sorted });
});

// ============================================================
// 內容管理 API（後台）
// ============================================================

/** 讀取全部可編輯內容 */
app.get('/api/admin/content', (req, res) => {
  try {
    res.json({
      config: readConfig(),
      images: listImages(),
      order: getImageOrder(),
    });
  } catch (e) {
    console.error('[api/admin/content] 錯誤：', e);
    res.status(500).json({ error: e.message });
  }
});

/** 儲存內容（價目、服務、營業時間、評價、品牌資料） */
app.post('/api/admin/content', (req, res) => {
  try {
    const patch = req.body || {};
    const config = updateConfig(patch);
    res.json({ ok: true, config });
  } catch (e) {
    console.error('[api/admin/content] 儲存失敗：', e);
    res.status(500).json({ error: e.message });
  }
});

/** 圖片列表 */
app.get('/api/admin/images', (req, res) => {
  res.json({ images: listImages(), order: getImageOrder() });
});

/**
 * 上傳圖片
 * 支援兩種方式：
 *  1. multipart/form-data（瀏覽器表單上傳）
 *  2. JSON { filename, dataUrl }（拖放 / 剪貼簿貼上）
 */
app.post('/api/admin/upload', async (req, res) => {
  try {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });

    let buffer = null;
    let originalName = null;

    const ct = req.headers['content-type'] || '';

    if (ct.includes('application/json')) {
      const { filename, dataUrl } = req.body || {};
      if (!dataUrl) return res.status(400).json({ error: '缺少圖片資料' });
      const match = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(dataUrl);
      if (!match) return res.status(400).json({ error: '唔支援嘅格式' });
      buffer = Buffer.from(match[2], 'base64');
      originalName = filename || 'pasted';
    } else if (ct.includes('multipart/form-data')) {
      // 冇 multer，用原生解析（簡單檔案通常細過 20MB）
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks);
      const text = raw.toString('latin1');
      const nameMatch = /filename="([^"]+)"/i.exec(text);
      const b64Match = /\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/.exec(text);
      if (!b64Match) return res.status(400).json({ error: '解析檔案失敗' });
      buffer = Buffer.from(b64Match[1].replace(/\s/g, ''), 'base64');
      originalName = nameMatch ? nameMatch[1] : 'upload';
    } else {
      return res.status(400).json({ error: '不支援嘅上傳格式' });
    }

    if (!buffer || buffer.length === 0) {
      return res.status(400).json({ error: '檔案係空嘅' });
    }
    if (buffer.length > 25 * 1024 * 1024) {
      return res.status(413).json({ error: '檔案太大（上限 25MB）' });
    }

    // 產生安全檔名：sample-<slug>.jpg
    let slug = path
      .basename(originalName, path.extname(originalName))
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
    if (!slug) slug = 'photo';
    if (!slug.startsWith('sample-')) slug = `sample-${slug}`;

    const tmpPath = path.join(UPLOAD_DIR, `${slug}-${Date.now()}.tmp`);
    fs.writeFileSync(tmpPath, buffer);

    const finalName = `${slug}.jpg`;
    const finalPath = path.join(IMG_DIR, finalName);
    fs.mkdirSync(IMG_DIR, { recursive: true });

    try {
      const dims = await compressImage(tmpPath, finalPath);
      fs.unlinkSync(tmpPath);
      console.log(`[admin/upload] ${finalName} (${dims})`);
      res.json({ ok: true, filename: finalName, url: `/img/${finalName}`, dims });
    } catch (e) {
      fs.unlinkSync(tmpPath);
      throw e;
    }
  } catch (e) {
    console.error('[api/admin/upload] 錯誤：', e);
    res.status(500).json({ error: e.message });
  }
});

/** 刪除圖片 */
app.delete('/api/admin/images/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const ok = deleteImage(filename);
    if (!ok) return res.status(404).json({ error: '搵唔到呢張相' });
    syncOrderAfterDelete(filename);
    res.json({ ok: true });
  } catch (e) {
    console.error('[api/admin/images] 錯誤：', e);
    res.status(500).json({ error: e.message });
  }
});

/** 重新命名圖片 */
app.put('/api/admin/images/:filename', (req, res) => {
  try {
    const filename = path.basename(req.params.filename);
    const { newName } = req.body || {};
    if (!newName) return res.status(400).json({ error: '缺少新檔名' });
    const ok = renameImage(filename, newName);
    if (!ok) return res.status(404).json({ error: '搵唔到呢張相' });
    res.json({ ok: true, filename: path.basename(newName) });
  } catch (e) {
    console.error('[api/admin/images] 錯誤：', e);
    res.status(400).json({ error: e.message });
  }
});

/** 儲存相片排序 */
app.post('/api/admin/images/order', (req, res) => {
  try {
    const { filenames } = req.body || {};
    if (!Array.isArray(filenames)) return res.status(400).json({ error: '缺少 filenames' });
    const order = setImageOrder(filenames);
    res.json({ ok: true, order });
  } catch (e) {
    console.error('[api/admin/order] 錯誤：', e);
    res.status(500).json({ error: e.message });
  }
});

// ===== OAuth 流程 =====
app.get('/oauth2callback', async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send('缺少 code');
  try {
    await exchangeCode(code);
    res.send('<h2>✅ Google Calendar 授權成功！可以關閉此頁。</h2>');
  } catch (e) {
    res.status(500).send(`❌ 授權失敗：${e.message}`);
  }
});

app.get('/api/auth-url', (req, res) => {
  const url = getAuthUrl();
  if (!url) {
    return res.status(503).json({
      error: 'Google OAuth 未設定',
      hint: '請在 .env 填入 GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET',
    });
  }
  res.json({ url });
});

// ===== 啟動 =====
app.listen(PORT, () => {
  console.log(`\n  九號攝影館預約系統`);
  console.log(`  → http://localhost:${PORT}`);
  console.log(`  日曆授權：${isAuthorized() ? '✅ 已授權' : '⚠️  未授權（訪客預約仍可用，但唔會自動寫入日曆）'}\n`);
});
