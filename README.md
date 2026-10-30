# 九號攝影館 · 線上預約系統

9Shoot Photo Studio 的線上預約網站。FB / IG 客人點入連結即可自行預約，
提交後即時 Telegram 通知工作室，唔會漏單。

---

## 🌍 線上網址

**https://nineshoot-booking.onrender.com**

（部署平台：Render · Singapore · Free plan · 連結 GitHub repo 自動部署）

### 部署相關指令

```bash
export PATH="$HOME/bin:$PATH"          # gh / render CLI 喺 ~/bin

# 查看部署狀態
render deploys list srv-dbi1pd9srm7s73d0k5v0

# 睇日誌
render logs srv-dbi1pd9srm7s73d0k5v0 --resources web --start 2026-10-30

# 改完 code 後推上去了就自動重新部署
git push origin main

# 手動觸發部署
render deploys create srv-dbi1pd9srm7s73d0k5v0 --wait
```

### 已設定嘅環境變數（Render dashboard）

| 變數 | 用途 |
|------|------|
| `TELEGRAM_BOT_TOKEN` | Telegram 通知 |
| `TELEGRAM_CHAT_ID` | `6687684829`（你的 Telegram） |
| `NODE_VERSION` | `24.16.0` |

### GitHub repo

`https://github.com/9shootphoto-cyber/9shoot-booking`（public）

> 之所以 public：Render 要裝 GitHub App 先讀到 private repo，會多幾個設定步驟。
> Repo 內**冇任何敏感資料** — Telegram token、預約記錄、`.env` 全部排除咗。
> 如要轉返 private，去 dashboard 裝 GitHub App 即可。

### ⚠️ Render Free plan 注意

- 15 分鐘冇人訪問 → service 會休眠
- 下次有人訪問要等 **約 30-60 秒** 冷啟動先有回應
- 首次訪問會慢啲，之後就正常

如果你想避免客人遇到「等 loading」，可以升級 paid plan（$7/月），或者遲啲我幫你
加一個「保持溫醒」嘅 cron（`cron self` 每 10 分鐘 ping 一次）。

---

## 快速開始（本地開發）

```bash
cd ~/9shoot-booking
npm install
npm start          # → http://localhost:3000
```

> **路徑說明**：專案實際位置係 `~/9shoot-booking`，`~/Desktop/9Shoot Photo Studio/booking-site`
> 係指向佢嘅 symlink（方便喺 Finder 直接開）。
> 之所以唔直接放 Desktop，係因為 macOS LaunchAgent 冇權限讀 Desktop 資料夾，
> 服務會起唔到。唔好將實體目錄搬返去 Desktop。

### 服務已經自動常駐

已經裝好 LaunchAgent，開機自動啟動、崩潰自動重啟：

```bash
launchctl list | grep 9shoot        # 查看狀態
launchctl kickstart -k gui/$(id -u)/com.9shoot.booking   # 重啟
tail -f /tmp/9shoot-booking.log      # 看日誌
```

想停：`launchctl bootout gui/$(id -u)/com.9shoot.booking`


---

## 目錄結構

```
booking-site/
├── data/
│   ├── config.json      ← 【最重要】服務、價目、營業時間、評價
│   └── bookings.json    ← 預約記錄（自動產生）
├── public/
│   ├── index.html
│   ├── styles.css
│   ├── app.js           ← 前端邏輯 + 中英雙語 + 深色模式
│   ├── assets/          ← logo
│   └── img/             ← Sample 作品圖
├── server/
│   ├── index.js         ← API 路由
│   ├── calendar.js      ← Google Calendar 整合
│   ├── slots.js         ← 時段計算
│   ├── content.js       ← 內容讀寫（後台用）
│   └── notify.js        ← Telegram 通知
└── scripts/
    └── google-auth.js   ← OAuth 授權工具
```

## 深色模式

右上角有月光掣可以切換深／淺色。

- 選擇會記住喺瀏覽器 localStorage
- 第一次訪問會跟系統偏好（系統係深色就自動用深色）
- 深色模式嘅品牌 logo 用 CSS filter 自動反轉，唔使另外存圖

想強制某個語言／主題做預設，改 `public/app.js` 開頭：

```js
function getInitialTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  if (saved) return saved;
  return 'light';   // ← 改成 'dark' 就強制深色
}
```

---

## 改價目 / 改營業時間

全部喺 **`data/config.json`** 一個檔案改，唔使掂程式碼。

### 服務項目

```json
{
  "id": "id-photo",
  "name_zh": "證件照",
  "name_en": "ID Photo",
  "duration_min": 15,
  "price_from": 150,
  "price_note_zh": "起 · 現場拍攝即取",
  "desc_zh": "……",
  "includes_zh": ["白底 / 藍底可選", "現場即拍即取"]
}
```

- `duration_min` — 預約時長，影響日曆 event 結束時間同可用時段數量
- `price_from` — 網站顯示嘅起價（MOP）
- `id` — 唔好改，改咗會影響 `/img/` 對應關係

### 營業時間

```json
"booking_hours": {
  "timezone": "Asia/Macau",
  "days": [1, 2, 3, 4, 5, 6],   ← 0=週日, 1=週一 ... 6=週六
  "start": "14:00",
  "end": "20:00",
  "slot_minutes": 30,            ← 時間格間隔
  "lead_time_days": 1,           ← 最快可以幾日後預約
  "max_advance_days": 60         ← 最遠可以預約幾日後
}
```

**「營業時間以外可以 inbox 預約」** 呢個功能已內建：
服務頁下方同表單都會顯示提示，客人可以 WhatsApp / Email / 電話聯絡。

### 評價

`reviews` 陣列，直接改文字或加落去就得。

---

## 自動回覆

客人提交預約後，系統會按佢填寫嘅資料自動判斷用邊個渠道：

| 情況 | 渠道 | 狀態 |
|------|------|------|
| 有電話 | **WhatsApp** | ✅ 即刻可用，零成本 |
| 只有 Email | **Email** | 需設定 SMTP |
| 指定偏好但冇該渠道 | 自動退回另一個 | ✅ |
| 電話同 Email 都冇 | 顯示預約資料 | 前端會擋住唔俾提交 |

### WhatsApp（免費，已啟用）

用 `wa.me` 免費連結。客人提交後，頁面會顯示：

- 完整確認訊息內容（日期、時間、服務、備註、預約編號、地址）
- 一個「用 WhatsApp 發送確認」按鈕，一撳就開 WhatsApp 並帶住全部資料

客人只需要撳一下「傳送」就完成。**零 API、零審批、永久免費。**

WhatsApp 號碼喺 `data/config.json`：

```json
"brand": { "whatsapp": "85366612227" }
```

### Email（需設定一次）

客人有填 Email 就會自動寄確認信。設定 `.env`：

```bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=9shootphoto@gmail.com
SMTP_PASS=你的App密碼
SMTP_FROM=9Shoot Photo Studio <9shootphoto@gmail.com>
```

**Gmail App Password 做法**：去 https://myaccount.google.com/apppasswords → 開兩步驗證 → 生成 App Password → 貼入 `SMTP_PASS`。

### SMS（需 Twilio）

```bash
TWILIO_ACCOUNT_SID=ACxxxx
TWILIO_AUTH_TOKEN=xxxx
TWILIO_FROM=+853xxxxxxx
```

---

## 通知設定

預約提交後會自動推送 Telegram 去 `6687684829`（你嘅 ID）。

Token 直接讀 Mavis 現有憑證（`~/.minimax/credentials/mavis/telegram.json`），
唔使另外配置。

想改用自己個 Bot：

```bash
# .env
TELEGRAM_BOT_TOKEN=xxxx
TELEGRAM_CHAT_ID=xxxx
```

---

## Google Calendar 整合（可稍後做）

而家預約**唔會**寫入日曆，但會：

1. 存入 `data/bookings.json`
2. Telegram 即時通知你
3. 同一時段喺網站自動鎖住，唔會重複被約

要接日曆嘅話：

### 步驟 1 — Google Cloud Console

1. 去 https://console.cloud.google.com
2. 建立新專案
3. 開啟 **Google Calendar API**
4. 進入 **OAuth 同意畫面**，選擇 External，加自己個 email 做測試使用者
5. **憑證 → 建立 OAuth 客戶端 ID**
   - 類型：Web 應用程式
   - 授權碼 URI：`http://localhost:3000/oauth2callback`

### 步驟 2 — 填憑證

```bash
# .env
GOOGLE_CLIENT_ID=xxxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxxx
GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback
GOOGLE_CALENDAR_ID=primary
```

### 步驟 3 — 授權

```bash
npm run auth
```

開啟顯示嘅網址，同意權限。Token 會存入 `data/token.json`，之後自動 refresh。

### 步驟 4 — 驗證

```bash
npm run slots
```

之後所有預約會自動寫入 Google 日曆，並扣除已佔用嘅時段。

> ⚠️ `.env` 同 `data/token.json` 唔好上傳到公開 repo。

---

## 部署

`public/` 係純靜態檔，但 `server/` 需要 Node runtime（因為要處理預約 API）。

### 選項 A — 保留後端（需要日曆 / Telegram 通知）

部署到任何有 Node runtime 嘅地方（Railway / Render / Fly.io / VPS）：

```bash
npm install --omit=dev
NODE_ENV=production node server/index.js
```

記得設定所有環境變數（見上）。

### 選項 B — 純靜態（Netlify / Vercel / GitHub Pages）

只部署 `public/`。但咁樣：

- ❌ 預約表單冇後端收，**用唔到**
- ✅ 淨係做作品展示頁

所以預約功能建議用選項 A。

### 選項 C — 本機 / 區網

喺自己 Mac 上跑 `npm start`，同一個 WiFi 客人可以用區域網 IP 訪問。
但要公開上線俾 FB 客人用，就要 Option A。

---

## 常見問題

**Q: 價目改咗但網站冇變？**
A: 改 `data/config.json` 後重啟 server（`npm start`）。或者用 `npm run dev` 自動重載。

**Q: 想加多一個服務項目？**
A: 喺 `config.json` 嘅 `services` 陣列加一個物件，跟返現有格式。

**Q: 客人話搵唔到預約連結？**
A: 網站路徑係 `/`（根路徑）。部署後會有一個公開網址，放落 FB 簡介同 IG 個人檔。

**Q: 圖片點樣換？**
A: 檔案放 `public/img/`，命名 `sample-<id>.jpg`（id 要同 `config.json` 嘅
`sample_categories` 一致），然後喺 `public/app.js` 嘅 `SAMPLE_IMAGES` 更新對應。

**Q: 可以收線上付款嗎？**
A: 而家未接。想接的話可以加 Stripe / 微信支付 / 澳門銀聯，但要先決定係訂金定全款。
