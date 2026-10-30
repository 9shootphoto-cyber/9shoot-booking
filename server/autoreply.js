/**
 * 自動回覆
 *  - WhatsApp：wa.me 免費連結（零 API、零審批）
 *  - Email：SMTP（需設定）
 *  - SMS：Twilio（需設定）
 *
 * 策略：按客人填寫嘅資料 + 選擇嘅偏好聯絡方式自動判斷
 *  - 有 email → 發 email（真正自動，客人收到）
 *  - 有電話 → 開 WhatsApp 連結（帶住完整預約資料，客人一撳就send）
 *  - 兩個都冇 → 只顯示訊息 + 聯絡電話
 */

/**
 * 格式化預約資料成易讀文字
 */
export function formatBookingText(booking, service, brand) {
  const dateLabel = formatDate(booking.date, booking.lang || 'zh');
  const lines = [
    `你好 ${booking.name}，`,
    '',
    `已收到你嘅${service?.name_zh || '攝影'}預約：`,
    '',
    `📅 日期：${dateLabel}`,
    `🕐 時間：${booking.time}（${service?.duration_min || ''} 分鐘）`,
    `📷 服務：${service?.name_zh || ''}`,
  ];

  if (booking.note) {
    lines.push(`📝 備註：${booking.note}`);
  }

  lines.push(
    '',
    `參考編號：${booking.id}`,
    `${brand?.address || ''}`,
    '',
    '我們會盡快同你確認時間及細節。',
    '如需改時間或有其它安排，隨時同我哋講。'
  );

  return lines.join('\n');
}

function formatDate(dateStr, lang) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  const dowZh = ['日', '一', '二', '三', '四', '五', '六'];
  if (lang === 'en') {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${d} ${months[m-1]} ${y} (${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dow]})`;
  }
  return `${y}年${m}月${d}日 週${dowZh[dow]}`;
}

/**
 * 產生 WhatsApp 連結（wa.me 免費方案）
 * @returns {string|null}
 */
export function buildWhatsAppLink(booking, service, brand) {
  const number = (brand?.whatsapp || '').replace(/\D/g, '');
  if (!number) return null;

  const text = formatBookingText(booking, service, brand);
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}

/**
 * 決定用邊個渠道
 */
export function pickChannel(booking, config) {
  const pref = booking.preferredContact || 'phone';

  // 明確偏好 email，而且有 email → email
  if (pref === 'email' && booking.email) return 'email';

  // 明確偏好 whatsapp，而且有電話 → whatsapp
  if (pref === 'whatsapp' && booking.phone) return 'whatsapp';

  // 偏好電話但冇電話，有 email → 退回 email
  if (pref === 'phone' && !booking.phone && booking.email) return 'email';

  // 有電話 → whatsapp（電話渠道都用 WhatsApp，因為可以直接傾）
  if (booking.phone) return 'whatsapp';

  // 淨係有 email → email
  if (booking.email) return 'email';

  return 'none';
}

/**
 * Email 自動發送（SMTP）
 * 需要 .env 設定 SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS
 */
async function sendEmail(to, subject, body, config) {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM || user;

  if (!host || !user || !pass) {
    console.warn('[autoreply/email] SMTP 未設定，略過');
    return { ok: false, reason: 'smtp_not_configured' };
  }

  try {
    // 用系統內建 net module 做簡單 SMTP 對話（避免加新依賴）
    const net = await import('node:net');
    const tls = await import('node:tls');

    const subjectEn = subject;
    const headers = [
      `From: ${from}`,
      `To: ${to}`,
      `Subject: ${subjectEn}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      '',
      body,
    ].join('\r\n');

    const isSecure = port === 465;
    const socket = isSecure
      ? tls.connect({ host, port, servername: host, rejectUnauthorized: false })
      : net.connect({ host, port });

    const commands = [];
    commands.push({ read: /^220/, write: `EHLO ${host}\r\n` });
    if (!isSecure) commands.push({ read: /^250/, write: `STARTTLS\r\n` });
    commands.push({ read: /^220/, write: `EHLO ${host}\r\n` });
    commands.push({ read: /^250/, write: `AUTH LOGIN\r\n` });
    commands.push({ read: /^334/, write: Buffer.from(user).toString('base64') + '\r\n' });
    commands.push({ read: /^334/, write: Buffer.from(pass).toString('base64') + '\r\n' });
    commands.push({ read: /^235/, write: `MAIL FROM:<${from}>\r\n` });
    commands.push({ read: /^250/, write: `RCPT TO:<${to}>\r\n` });
    commands.push({ read: /^250/, write: 'DATA\r\n' });
    commands.push({ read: /^354/, write: headers + '\r\n.\r\n' });
    commands.push({ read: /^250/, write: 'QUIT\r\n' });

    await new Promise((resolve, reject) => {
      let step = 0;
      let buffer = '';
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error('SMTP timeout'));
      }, 20000);

      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        // 處理多行回應
        while (buffer.includes('\r\n')) {
          const idx = buffer.indexOf('\r\n');
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          if (/^\d{3}-/.test(line)) continue; // 續行

          const cmd = commands[step];
          if (cmd && cmd.read.test(line)) {
            socket.write(cmd.write);
            step++;
            if (step >= commands.length) {
              clearTimeout(timer);
              socket.end();
              resolve();
            }
          } else if (/^[45]\d\d/.test(line)) {
            clearTimeout(timer);
            socket.destroy();
            reject(new Error(`SMTP error: ${line}`));
          }
        }
      });

      socket.on('error', (e) => {
        clearTimeout(timer);
        reject(e);
      });

      socket.on('connect', () => {
        // 等待 banner
      });
    });

    console.log(`[autoreply/email] 已發送至 ${to}`);
    return { ok: true };
  } catch (e) {
    console.error('[autoreply/email] 失敗：', e.message);
    return { ok: false, reason: e.message };
  }
}

/**
 * SMS 自動發送（Twilio）
 * 需要 .env 設定 TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM
 */
async function sendSms(to, body) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM;

  if (!sid || !token || !from) {
    console.warn('[autoreply/sms] Twilio 未設定，略過');
    return { ok: false, reason: 'twilio_not_configured' };
  }

  try {
    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`,
      {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
      }
    );
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || `http_${res.status}`);
    console.log(`[autoreply/sms] 已發送至 ${to}`);
    return { ok: true };
  } catch (e) {
    console.error('[autoreply/sms] 失敗：', e.message);
    return { ok: false, reason: e.message };
  }
}

/**
 * 執行自動回覆
 */
export async function sendAutoReply(booking, service, config) {
  const brand = config.brand || {};
  const channel = pickChannel(booking, config);
  const body = formatBookingText(booking, service, brand);

  const result = { channel, sent: false, link: null, error: null };

  switch (channel) {
    case 'whatsapp': {
      const link = buildWhatsAppLink(booking, service, brand);
      if (link) {
        result.link = link;
        result.sent = true; // 連結已準備好，前端會引導客人開啟
        result.text = body;
      } else {
        result.channel = 'none';
        result.error = 'whatsapp_number_missing';
      }
      break;
    }
    case 'email': {
      const subject = `【預約確認】${service?.name_zh || ''} · ${booking.date} ${booking.time} · ${booking.name}`;
      const r = await sendEmail(booking.email, subject, body, config);
      result.sent = r.ok;
      result.error = r.reason || null;
      result.text = body;
      break;
    }
    case 'sms': {
      const r = await sendSms(booking.phone, body);
      result.sent = r.ok;
      result.error = r.reason || null;
      result.text = body;
      break;
    }
    default:
      result.text = body;
  }

  return result;
}
