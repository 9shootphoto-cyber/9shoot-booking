/**
 * Google Calendar OAuth 授權腳本
 *
 * 用法：
 *   1. 先在 Google Cloud Console 建立 OAuth 憑證（詳見 README）
 *   2. 把憑證填入 .env
 *   3. 執行：npm run auth
 *   4. 瀏覽器會打開授權頁面，同意後 token 會存到 data/token.json
 */
import 'dotenv/config';
import { getAuthClient, exchangeCode, isAuthorized } from '../server/calendar.js';

const auth = getAuthClient();

if (!auth) {
  console.error('\n❌ Google OAuth 未設定');
  console.error('請在 .env 填入：');
  console.error('  GOOGLE_CLIENT_ID=...');
  console.error('  GOOGLE_CLIENT_SECRET=...');
  console.error('  GOOGLE_REDIRECT_URI=http://localhost:3000/oauth2callback\n');
  process.exit(1);
}

if (isAuthorized()) {
  console.log('\n✅ 已經授權過，無需重複授權。');
  console.log('如需重新授權，刪除 data/token.json 再執行。\n');
  process.exit(0);
}

// 產生授權 URL
const url = auth.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/calendar'],
  prompt: 'consent',
});

console.log('\n🔐 請在瀏覽器開啟以下網址授權：');
console.log(`\n${url}\n`);

// 啟動本地臨時 server 接收 callback
const http = await import('node:http');
const server = http.createServer(async (req, res) => {
  const urlObj = new URL(req.url, 'http://localhost');
  const code = urlObj.searchParams.get('code');

  if (urlObj.pathname === '/' && code) {
    try {
      await exchangeCode(code);
      res.end('<h2>✅ 授權成功！可以關閉此頁。</h2><p>回到終端機確認訊息。</p>');
      setTimeout(() => { server.close(); process.exit(0); }, 1000);
    } catch (e) {
      res.end(`<h2>❌ 授權失敗</h2><pre>${e.message}</pre>`);
      setTimeout(() => { server.close(); process.exit(1); }, 1000);
    }
  } else {
    res.end('<p>等待 Google 授權回調…</p>');
  }
});

server.listen(3000, () => {
  console.log('等待 Google 回調（http://localhost:3000）…\n');
});
