/* ==========================================================
   九號攝影館 — 預約系統前端邏輯
   ========================================================== */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

let CONFIG = null;
let LANG = localStorage.getItem('9shoot-lang') || 'zh';
let state = {
  serviceId: null,
  date: null,
  time: null,
  dates: [],
  slots: [],
  calAuth: false,
  today: null,
  calYear: null,
  calMonth: null,
};

// ===== 主題（深色 / 淺色） =====
const THEME_KEY = '9shoot-theme';

function getInitialTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) return saved;
  // 預設深色模式
  return 'dark';
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(THEME_KEY, theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'light';
  const next = current === 'dark' ? 'light' : 'dark';
  applyTheme(next);
}

// 初始化時立即套用，避免閃爍
applyTheme(getInitialTheme());

// ===== i18n =====
const I18N = {
  zh: {
    nav_services: '服務', nav_samples: '作品', nav_reviews: '評價', nav_contact: '聯絡', nav_book: '立即預約',
    hero_badge: '澳門 · 專業攝影',
    hero_title_1: '九號攝影館',
    hero_sub: '證件照 · 形象照 · 家庭照 · 寵物照 · 婚禮活動攝影',
    hero_sub_2: '證件照 · 形象照 · 家庭照 · 寵物照 · 婚禮活動攝影',
    hero_cta: '立即預約', hero_cta2: '看看作品',
    stat_1: '證件照即拍即取', stat_2: '形象照客滿意', stat_3: '客人評分',
    services_kicker: '服務項目', services_title: '揀一個服務，開始預約',
    services_desc: '所有拍攝均於澳門田畔街工作室進行，實景燈光、即影即有。',
    services_note: '營業時間以外的預約需求，可直接 inbox 我們，我們會盡快回覆確認。',
    samples_kicker: 'Sample 作品', samples_title: '看看我們的風格',
    samples_desc: '分類瀏覽不同主題的拍攝效果，搵到感覺就開始預約。',
    samples_note: '以下為示範圖片，正式作品將陸續更新。歡迎於 IG 查看最新作品。',
    reviews_kicker: '客人評價', reviews_title: '他們怎麼說',
    book_kicker: '線上預約', book_title: '四步完成預約',
    step_1_t: '選擇服務', step_1_d: '決定拍攝項目同時間長度',
    step_2_t: '選擇時段', step_2_d: '實時查看可預約日期同時間',
    step_3_t: '填寫資料', step_3_d: '聯絡方式同備註',
    step_4_t: '等待確認', step_4_d: '我們會盡快回覆確認細節', step_4_n: '其它時間可提前預約溝通',
    book_direct_t: '想直接聯絡？',
    contact_addr: '澳門田畔街 9 號地下',
    contact_hours: '週一至六 14:00–20:00（週日休息）',
    f1_label: '選擇服務', f2_label: '選擇日期同時間', f3_label: '填寫聯絡資料',
    f2_slots: '可預約時段',
    f_name: '姓名', f_phone: '聯絡電話', f_email: 'Email', f_optional: '選填',
    f_note: '備註', f_contact: '偏好聯絡方式',
    f_contact_phone: '電話',
    submit: '確認預約',
    form_fine: '提交後我們會盡快聯絡你確認時間及細節。預約暫時保留，待確認後正式生效。',
    success_title: '預約已提交！',
    success_desc: '我們會盡快聯絡你確認時間及細節。',
    success_again: '再預約一次',
    wa_open: '用 WhatsApp 發送確認',
    footer_contact: '聯絡', footer_hours: '營業時間', footer_follow: '追蹤我們',
    footer_note: '非營業時間可提前預約', footer_rights: '九號攝影館 · 澳門',
    ss_service: '服務', ss_datetime: '日期時間', ss_duration: '時長', ss_price: '起價', ss_ref: '編號',
    ss_name: '姓名', ss_phone: '電話',
    all: '全部', sample_placeholder: '示範圖',
    loading: '載入中…', no_slots: '這天沒有可預約時段', pick_date: '請先選擇日期',
  },
  en: {
    nav_services: 'Services', nav_samples: 'Work', nav_reviews: 'Reviews', nav_contact: 'Contact', nav_book: 'Book Now',
    hero_badge: 'Macau · Professional Photography',
    hero_title_1: '9Shoot Photo Studio',
    hero_sub: 'ID Photos · Portraits · Family · Pets · Weddings & Events',
    hero_sub_2: 'ID Photos · Portraits · Family · Pets · Weddings & Events',
    hero_cta: 'Book Now', hero_cta2: 'See Our Work',
    stat_1: 'ID photos ready instantly', stat_2: 'Happy portrait clients', stat_3: 'Client rating',
    services_kicker: 'Services', services_title: 'Pick a service, start booking',
    services_desc: 'All sessions are shot at our Macau studio on Tap Seac Street — real lighting, real results.',
    services_note: 'For requests outside opening hours, inbox us directly and we will reply to confirm.',
    samples_kicker: 'Sample Work', samples_title: 'See our style',
    samples_desc: 'Browse by theme to find the look you want, then book.',
    samples_note: 'Sample images shown. Real work updated regularly — see the latest on IG.',
    reviews_kicker: 'Reviews', reviews_title: 'What they say',
    book_kicker: 'Online Booking', book_title: 'Book in four steps',
    step_1_t: 'Choose a service', step_1_d: 'Decide the shoot type and duration',
    step_2_t: 'Pick a slot', step_2_d: 'Live availability by date and time',
    step_3_t: 'Your details', step_3_d: 'Contact info and notes',
    step_4_t: 'Confirmation', step_4_d: 'We will reply to confirm', step_4_n: 'For other times, contact us to arrange in advance',
    book_direct_t: 'Prefer to reach us directly?',
    contact_addr: '9 Tap Seac St, Ground Floor, Macau',
    contact_hours: 'Mon–Sat 14:00–20:00 (Closed Sun)',
    f1_label: 'Choose a service', f2_label: 'Pick date & time', f3_label: 'Your details',
    f2_slots: 'Available slots',
    f_name: 'Name', f_phone: 'Phone', f_email: 'Email', f_optional: 'optional',
    f_note: 'Notes', f_contact: 'Preferred contact',
    f_contact_phone: 'Phone',
    submit: 'Confirm booking',
    form_fine: 'We will contact you shortly to confirm time and details. Your slot is held pending confirmation.',
    success_title: 'Booking submitted!',
    success_desc: 'We will be in touch shortly to confirm your time and details.',
    success_again: 'Book another',
    wa_open: 'Send confirmation via WhatsApp',
    footer_contact: 'Contact', footer_hours: 'Hours', footer_follow: 'Follow',
    footer_note: 'Advance booking available outside hours', footer_rights: '9Shoot Photo Studio · Macau',
    ss_service: 'Service', ss_datetime: 'Date & time', ss_duration: 'Duration', ss_price: 'From', ss_ref: 'Reference',
    ss_name: 'Name', ss_phone: 'Phone',
    all: 'All', sample_placeholder: 'Sample',
    loading: 'Loading…', no_slots: 'No slots available on this date', pick_date: 'Please pick a date first',
  },
};

function t(key) { return I18N[LANG][key] ?? I18N.zh[key] ?? key; }

function applyI18n() {
  document.documentElement.lang = LANG === 'zh' ? 'zh-Hant' : 'en';
  document.body.classList.toggle('lang-en', LANG === 'en');
  $$('[data-i18n]').forEach((el) => { el.textContent = t(el.dataset.i18n); });
  $$('.lang-opt').forEach((el) => el.classList.toggle('active', el.dataset.lang === LANG));
  if (CONFIG) { renderServices(); renderSamples(); renderReviews(); renderServiceOptions(); }
}

// ===== 圖示 =====
const ICONS = {
  id: '<svg viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2.2"/><path d="M5.5 17c.6-2.2 1.9-3.3 3.5-3.3s2.9 1.1 3.5 3.3M15 9h4M15 13h4"/></svg>',
  portrait: '<svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/><circle cx="18.5" cy="6" r="1.6"/></svg>',
  family: '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="3"/><circle cx="16.5" cy="9.5" r="2.4"/><path d="M2.5 20c0-3.3 2.5-5.5 5.5-5.5s5.5 2.2 5.5 5.5M13.5 20c0-2.6 1.8-4.4 4-4.4s4 1.8 4 4.4"/></svg>',
  event: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/><circle cx="12" cy="16" r="2"/></svg>',
};

const STAR = '<svg viewBox="0 0 24 24"><path d="m12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.9L12 17.8 5.8 21l1.2-6.9-5-4.9 6.9-1z"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>';
const ARROW = '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

// ===== 渲染：服務 =====
function svcName(s) { return LANG === 'zh' ? s.name_zh : s.name_en; }
function svcDesc(s) { return LANG === 'zh' ? s.desc_zh : s.desc_en; }
function svcIncludes(s) { return LANG === 'zh' ? s.includes_zh : s.includes_en; }

function renderServices() {
  const grid = $('#servicesGrid');
  grid.innerHTML = CONFIG.services.map((s) => `
    <div class="svc-card">
      <div class="svc-top">
        <div class="svc-icon">${ICONS[s.icon] || ICONS.portrait}</div>
        <div class="svc-price">
          <div><span class="cur">MOP</span><span class="amt">${s.price_from.toLocaleString()}</span></div>
          <span class="note">${LANG === 'zh' ? s.price_note_zh : s.price_note_en}</span>
        </div>
      </div>
      <div class="svc-name">${svcName(s)}</div>
      <div class="svc-meta">
        <span class="pill">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
          ${s.duration_min} min
        </span>
      </div>
      <p class="svc-desc">${svcDesc(s)}</p>
      <ul class="svc-includes">
        ${svcIncludes(s).map((i) => `<li>${CHECK}<span>${i}</span></li>`).join('')}
      </ul>
      <a href="#book" class="svc-cta" data-svc-jump="${s.id}">${LANG === 'zh' ? '預約此服務' : 'Book this'} ${ARROW}</a>
    </div>
  `).join('');
}

// ===== 渲染：作品 =====
let activeCategory = 'all';
const SAMPLE_IMAGES = {
  'id-photo': ['sample-id1.jpg', 'sample-id2.jpg'],
  portrait: ['sample-p1.jpg', 'sample-p2.jpg', 'sample-p3.jpg'],
  family: ['sample-f1.jpg', 'sample-f2.jpg'],
  pet: ['sample-pt1.jpg'],
  wedding: ['sample-w1.jpg', 'sample-w2.jpg'],
};

function renderSamples() {
  const chips = $('#sampleChips');
  const allChip = `<button class="chip ${activeCategory === 'all' ? 'active' : ''}" data-cat="all">${t('all')}</button>`;
  chips.innerHTML = allChip + CONFIG.sample_categories.map((c) =>
    `<button class="chip ${activeCategory === c.id ? 'active' : ''}" data-cat="${c.id}">${LANG === 'zh' ? c.name_zh : c.name_en}</button>`
  ).join('');

  const cats = activeCategory === 'all' ? CONFIG.sample_categories.map((c) => c.id) : [activeCategory];
  const items = [];
  cats.forEach((cid) => {
    const cat = CONFIG.sample_categories.find((c) => c.id === cid);
    const imgs = SAMPLE_IMAGES[cid] || [];
    imgs.forEach((img) => {
      items.push({ cat: cid, catName: LANG === 'zh' ? cat.name_zh : cat.name_en, img });
    });
  });

  const grid = $('#samplesGrid');
  grid.innerHTML = items.map((it) => `
    <div class="sample-item" data-src="${it.img}">
      <img src="/img/${it.img}" alt="${it.catName}" loading="lazy"
           onerror="this.onerror=null;this.src='/img/sample-placeholder.svg'">
      <span class="sample-tag">${it.catName}</span>
    </div>
  `).join('');
}

// ===== 渲染：評價 =====
function renderReviews() {
  const grid = $('#reviewsGrid');
  grid.innerHTML = CONFIG.reviews.map((r) => {
    const name = LANG === 'zh' ? r.name_zh : r.name_en;
    const text = LANG === 'zh' ? r.text_zh : r.text_en;
    const tag = LANG === 'zh' ? r.tag_zh : r.tag_en;
    const initials = name.replace(/[^\w一-鿿]/g, '').slice(0, 2);
    return `
      <div class="review-card">
        <div class="review-stars">${STAR.repeat(r.rating)}</div>
        <p class="review-text">${text}</p>
        <div class="review-foot">
          <div class="review-avatar">${initials}</div>
          <div class="review-meta">
            <span class="review-name">${name}</span>
            <span class="review-tag">${tag}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

// ===== 渲染：表單服務選項 =====
function renderServiceOptions() {
  const list = $('#serviceOptions');
  if (!state.serviceId && CONFIG.services.length) state.serviceId = CONFIG.services[0].id;

  list.innerHTML = CONFIG.services.map((s) => `
    <button type="button" class="opt ${state.serviceId === s.id ? 'active' : ''}" data-service="${s.id}">
      <span class="opt-radio"></span>
      <span class="opt-body">
        <span class="opt-name">${svcName(s)}</span>
        <span class="opt-sub">${s.duration_min} min · ${LANG === 'zh' ? s.price_note_zh : s.price_note_en}</span>
      </span>
      <span class="opt-price"><small>MOP</small>${s.price_from.toLocaleString()}</span>
    </button>
  `).join('');
}

// ===== 日期 =====
const DOW_ZH = ['日', '一', '二', '三', '四', '五', '六'];
const DOW_EN = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function renderCalendar() {
  const grid = $('#calGrid');
  const title = $('#calTitle');
  const dowRow = $('#calDow');

  if (!state.dates.length) {
    grid.innerHTML = `<div class="slot-empty">${t('loading')}</div>`;
    return;
  }

  // --- 星期標題 ---
  const dowLabels = LANG === 'zh' ? ['日', '一', '二', '三', '四', '五', '六'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  dowRow.innerHTML = dowLabels.map((d) => `<span>${d}</span>`).join('');

  // --- 當前顯示嘅月份 ---
  const viewY = state.calYear;
  const viewM = state.calMonth;

  title.textContent = LANG === 'zh' ? `${viewY} 年 ${viewM} 月` : `${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][viewM-1]} ${viewY}`;

  // --- 該月第一天係星期幾 ---
  const firstDow = new Date(Date.UTC(viewY, viewM - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(viewY, viewM, 0)).getUTCDate();

  // --- 逐格 ---
  const cells = [];
  for (let i = 0; i < firstDow; i++) cells.push('<span class="cal-cell blank"></span>');

  const dateSet = new Set(state.dates);
  const todayStr = state.today;

  for (let d = 1; d <= daysInMonth; d++) {
    const ds = `${viewY}-${String(viewM).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const dow = new Date(Date.UTC(viewY, viewM - 1, d)).getUTCDay();

    const isOpen = dateSet.has(ds);
    const isClosed = !isOpen && dow !== 0;  // 唔開放但唔係週日 = 超出範圍/休息
    const isSunday = dow === 0;
    const isPast = ds < todayStr;
    const isToday = ds === todayStr;
    const isSelected = state.date === ds;

    let cls = 'cal-cell';
    if (isSelected) cls += ' selected';
    else if (isOpen) cls += ' open';
    else if (isPast) cls += ' past';
    else cls += ' closed';

    const label = LANG === 'zh' ? `${viewM}月${d}日` : `${d} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][viewM-1]}`;

    cells.push(
      `<button type="button" class="${cls}${isToday ? ' today' : ''}" data-date="${ds}" ${isOpen ? '' : 'disabled'}>` +
      `<span class="cd">${d}</span>` +
      `<span class="cw">${LANG === 'zh' ? '週' + DOW_ZH[dow] : DOW_EN[dow].slice(0, 2)}</span>` +
      `</button>`
    );
  }

  grid.innerHTML = cells.join('');
}

/**
 * 切換顯示月份
 */
function shiftMonth(delta) {
  let y = state.calYear;
  let m = state.calMonth + delta;
  if (m < 1) { m = 12; y--; }
  if (m > 12) { m = 1; y++; }

  // 唔可以跳去完全冇可預約日期嘅月份
  const hasAny = state.dates.some((d) => {
    const [dy, dm] = d.split('-').map(Number);
    return dy === y && dm === m;
  });
  if (!hasAny && delta !== 0) return;

  state.calYear = y;
  state.calMonth = m;
  renderCalendar();
}

function renderSlots() {
  const grid = $('#slotGrid');
  const label = $('#slotDateLabel');

  if (!state.date) {
    grid.innerHTML = `<div class="slot-empty">${t('pick_date')}</div>`;
    label.textContent = '';
    return;
  }

  const [y, m, d] = state.date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  label.textContent = LANG === 'zh'
    ? `${y}年${m}月${d}日 週${DOW_ZH[dt.getUTCDay()]}`
    : `${DOW_EN[dt.getUTCDay()]} ${d} ${m}`;

  if (!state.slots.length) {
    grid.innerHTML = `<div class="slot-empty">${t('no_slots')}</div>`;
    return;
  }

  grid.innerHTML = state.slots.map((s) => `
    <button type="button" class="slot ${state.time === s.time ? 'active' : ''}"
            data-time="${s.time}" ${s.available ? '' : 'disabled'}>${s.time}</button>
  `).join('');
}

// ===== 載入資料 =====
async function loadConfig() {
  const res = await fetch('/api/config');
  CONFIG = await res.json();
}

async function loadStatus() {
  try {
    const res = await fetch('/api/status');
    const st = await res.json();
    state.calAuth = st.calendarAuthorized;
  } catch { /* ignore */ }
}

async function loadDates() {
  try {
    const res = await fetch('/api/dates');
    const data = await res.json();
    state.dates = data.dates || [];
    state.today = data.today;

    // 預設顯示第一個可預約日期所屬嘅月份
    if (state.dates.length) {
      const first = state.dates[0];
      const [fy, fm] = first.split('-').map(Number);
      state.calYear = fy;
      state.calMonth = fm;

      if (!state.dates.includes(state.date)) {
        state.date = first;
        await loadSlots();
      }
    }
    renderCalendar();
    renderSlots();
  } catch (e) {
    console.error(e);
  }
}

async function loadSlots() {
  if (!state.date) return;
  const grid = $('#slotGrid');
  grid.innerHTML = `<div class="slot-empty">${t('loading')}</div>`;
  try {
    const svc = CONFIG.services.find((s) => s.id === state.serviceId) || CONFIG.services[0];
    const res = await fetch(`/api/slots?date=${state.date}&service=${svc.id}`);
    const data = await res.json();
    state.slots = data.slots || [];
    if (state.time && !state.slots.find((s) => s.time === state.time && s.available)) {
      state.time = null;
    }
    renderSlots();
  } catch (e) {
    console.error(e);
    grid.innerHTML = `<div class="slot-empty">${t('no_slots')}</div>`;
  }
}

// ===== 提交 =====
async function submitBooking(e) {
  e.preventDefault();
  const errBox = $('#formError');
  errBox.hidden = true;

  const form = e.target;
  const name = $('#fName').value.trim();
  const phone = $('#fPhone').value.trim();
  const email = $('#fEmail').value.trim();

  if (!state.serviceId) return showError(LANG === 'zh' ? '請選擇服務' : 'Please choose a service');
  if (!state.date || !state.time) return showError(LANG === 'zh' ? '請選擇日期同時間' : 'Please pick a date and time');
  if (!name) return showError(LANG === 'zh' ? '請填寫姓名' : 'Please enter your name');
  if (!phone && !email) {
    return showError(LANG === 'zh'
      ? '請填寫聯絡電話或 Email 其中一項，方便我們確認預約'
      : 'Please enter a phone number or email so we can confirm your booking');
  }
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return showError(LANG === 'zh' ? 'Email 格式唔啱，請檢查' : 'Please check the email format');
  }

  const btn = $('#submitBtn');
  const originalText = btn.textContent;
  btn.disabled = true;
  btn.textContent = LANG === 'zh' ? '提交中…' : 'Submitting…';

  try {
    const payload = {
      serviceId: state.serviceId,
      date: state.date,
      time: state.time,
      name,
      phone,
      email: $('#fEmail').value.trim(),
      note: $('#fNote').value.trim(),
      preferredContact: form.querySelector('input[name="preferredContact"]:checked')?.value || 'phone',
    };

    const res = await fetch('/api/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || '提交失敗');

    showSuccess(data.booking, data.autoReply);
  } catch (err) {
    showError(err.message || (LANG === 'zh' ? '提交失敗，請稍後再試' : 'Submission failed'));
    btn.disabled = false;
    btn.textContent = originalText;
  }
}

function showError(msg) {
  const box = $('#formError');
  box.textContent = msg;
  box.hidden = false;
  box.scrollIntoView({ behavior: 'smooth', block: 'center' });
}

function showSuccess(bk, autoReply) {
  // 後端回傳嘅 booking 只有 service 名稱，用 state.serviceId 搵返完整資料
  const svc = CONFIG.services.find((s) => s.id === (bk.serviceId || state.serviceId)) || CONFIG.services[0];
  const [y, m, d] = bk.date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));

  $('#successSummary').innerHTML = `
    <div class="ss-row"><span class="k">${t('ss_service')}</span><span class="v">${svcName(svc)}</span></div>
    <div class="ss-row"><span class="k">${t('ss_datetime')}</span><span class="v">${LANG === 'zh' ? `${y}年${m}月${d}日 週${DOW_ZH[dt.getUTCDay()]} ${bk.time}` : `${DOW_EN[dt.getUTCDay()]} ${d} ${m}, ${bk.time}`}</span></div>
    <div class="ss-row"><span class="k">${t('ss_duration')}</span><span class="v">${bk.durationMin} min</span></div>
    <div class="ss-row"><span class="k">${t('ss_price')}</span><span class="v">MOP ${bk.priceFrom.toLocaleString()}</span></div>
    <div class="ss-row"><span class="k">${t('ss_name')}</span><span class="v">${bk.name}</span></div>
    ${bk.phone ? `<div class="ss-row"><span class="k">${t('ss_phone')}</span><span class="v mono">${bk.phone}</span></div>` : ''}
    <div class="ss-row"><span class="k">${t('ss_ref')}</span><span class="v mono">${bk.id}</span></div>
  `;

  renderAutoReply(autoReply);

  $('#bookForm').hidden = true;
  $('#successBox').hidden = false;
  $('#successBox').scrollIntoView({ behavior: 'smooth', block: 'center' });
}

/**
 * 顯示自動回覆區塊
 */
function renderAutoReply(ar) {
  const box = $('#autoreplyBox');
  if (!ar || !ar.text) {
    box.hidden = true;
    return;
  }

  const labels = {
    whatsapp: { zh: 'WhatsApp 確認訊息', en: 'WhatsApp confirmation' },
    email: { zh: '確認 Email 已寄出', en: 'Confirmation email sent' },
    sms: { zh: '確認 SMS 已寄出', en: 'Confirmation SMS sent' },
    none: { zh: '你的預約資料', en: 'Your booking details' },
  };
  const descs = {
    whatsapp: {
      zh: '撳下面按鈕用 WhatsApp 發送確認，資料會自動帶入。',
      en: 'Tap below to send the confirmation via WhatsApp — details are pre-filled.',
    },
    email: {
      zh: '確認訊息已寄到你嘅 Email，請查收。',
      en: 'A confirmation email has been sent. Please check your inbox.',
    },
    sms: {
      zh: '確認 SMS 已寄出，請留意。',
      en: 'A confirmation SMS has been sent. Please check your phone.',
    },
    none: {
      zh: '請記低以下資料，我們會盡快聯絡你。',
      en: 'Please note down these details — we will contact you shortly.',
    },
  };

  const ch = ar.channel || 'none';
  $('#autoreplyLabel').textContent = (labels[ch] || labels.none)[LANG];
  $('#autoreplyDesc').textContent = (descs[ch] || descs.none)[LANG];
  $('#autoreplyText').textContent = ar.text;

  const waBtn = $('#waButton');
  if (ch === 'whatsapp' && ar.link) {
    waBtn.href = ar.link;
    waBtn.hidden = false;
  } else {
    waBtn.hidden = true;
  }

  box.hidden = false;
}

function resetBooking() {
  $('#successBox').hidden = true;
  $('#bookForm').hidden = false;
  $('#bookForm').reset();
  state.time = null;
  const btn = $('#submitBtn');
  btn.disabled = false;
  btn.textContent = t('submit');
  $('#formError').hidden = true;
  renderServiceOptions();
  renderSlots();
  $('#book').scrollIntoView({ behavior: 'smooth' });
}

// ===== 事件綁定 =====
function bindEvents() {
  // 服務選項
  $('#serviceOptions').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-service]');
    if (!btn) return;
    state.serviceId = btn.dataset.service;
    state.time = null;
    renderServiceOptions();
    loadSlots();
  });

  // 從服務卡跳轉
  document.addEventListener('click', (e) => {
    const jump = e.target.closest('[data-svc-jump]');
    if (!jump) return;
    state.serviceId = jump.dataset.svcJump;
    state.time = null;
    renderServiceOptions();
    loadSlots();
  });

  // 日期（月曆格）
  $('#calGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-date]');
    if (!btn || btn.disabled) return;
    state.date = btn.dataset.date;
    state.time = null;
    renderCalendar();
    loadSlots();
  });

  // 月份切換
  $('#calPrev').addEventListener('click', () => shiftMonth(-1));
  $('#calNext').addEventListener('click', () => shiftMonth(1));

  // 時段
  $('#slotGrid').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-time]');
    if (!btn || btn.disabled) return;
    state.time = btn.dataset.time;
    renderSlots();
  });

  // 分類 chips
  $('#sampleChips').addEventListener('click', (e) => {
    const chip = e.target.closest('[data-cat]');
    if (!chip) return;
    activeCategory = chip.dataset.cat;
    renderSamples();
  });

  // 主題切換
  $('#themeToggle').addEventListener('click', toggleTheme);

  // 語言
  $('#langToggle').addEventListener('click', (e) => {
    const opt = e.target.closest('[data-lang]');
    if (!opt) return;
    LANG = opt.dataset.lang;
    localStorage.setItem('9shoot-lang', LANG);
    applyI18n();
    renderCalendar();
    renderSlots();
  });

  // 表單
  $('#bookForm').addEventListener('submit', submitBooking);
  $('#newBookingBtn').addEventListener('click', resetBooking);

  // 導航
  const nav = $('#nav');
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 20);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  $('#navBurger').addEventListener('click', () => nav.classList.toggle('menu-open'));
  $$('.nav-links a').forEach((a) => a.addEventListener('click', () => nav.classList.remove('menu-open')));

  // Facebook link (未設定時提示)
  const fbHandler = (e) => {
    e.preventDefault();
    alert(LANG === 'zh'
      ? '請於 public/app.js 的 CONFIG 中設定 Facebook 專頁連結'
      : 'Please set the Facebook page link in public/app.js CONFIG');
  };
  $('#fbBtn')?.addEventListener('click', fbHandler);
  $('#fbBtn2')?.addEventListener('click', fbHandler);

  $('#year').textContent = new Date().getFullYear();
}

// ===== 啟動 =====
(async function init() {
  try {
    await loadConfig();
    await loadStatus();
    applyI18n();
    bindEvents();
    await loadDates();
  } catch (e) {
    console.error('[init] 載入失敗：', e);
    document.body.insertAdjacentHTML('afterbegin',
      `<div style="padding:20px;background:#fdecec;color:#b3000e;font-family:sans-serif">初始化失敗：${e.message}</div>`);
  }
})();
