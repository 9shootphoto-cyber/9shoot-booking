/**
 * 網站內容管理
 * - 讀寫 data/config.json（原子寫入，避免寫到一半斷電）
 * - 管理 public/img/ 作品相片
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'data');
const CONFIG_PATH = path.join(DATA_DIR, 'config.json');
const IMG_DIR = path.join(ROOT, 'public', 'img');

// ===== Config =====

export function readConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

/**
 * 原子寫入：先寫 temp 再 rename，避免中途中斷令檔案損壞
 */
export function writeConfig(config) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const tmp = CONFIG_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf8');
  fs.renameSync(tmp, CONFIG_PATH);
  return config;
}

/**
 * 合併更新（只改指定欄位，其餘保持不變）
 */
export function updateConfig(patch) {
  const config = readConfig();

  if (patch.services) config.services = patch.services;
  if (patch.booking_hours) config.booking_hours = { ...config.booking_hours, ...patch.booking_hours };
  if (patch.reviews) config.reviews = patch.reviews;
  if (patch.brand) config.brand = { ...config.brand, ...patch.brand };
  if (patch.sample_categories) config.sample_categories = patch.sample_categories;
  if (patch.samples) config.samples = patch.samples;

  return writeConfig(config);
}

// ===== 圖片 =====

/**
 * 掃描 public/img 目錄，讀出所有作品相片及其分類
 * 檔名格式：sample-<slug>.jpg  例如 sample-p1.jpg
 */
export function listImages() {
  if (!fs.existsSync(IMG_DIR)) return [];
  const files = fs
    .readdirSync(IMG_DIR)
    .filter((f) => /\.(jpe?g|png|webp)$/i.test(f) && !f.startsWith('.'))
    .filter((f) => !f.includes('placeholder'));

  return files
    .map((filename) => {
      const stat = fs.statSync(path.join(IMG_DIR, filename));
      const slug = filename.replace(/^sample-/, '').replace(/\.(jpe?g|png|webp)$/i, '');
      return {
        filename,
        slug,
        url: `/img/${filename}`,
        size: stat.size,
        mtime: stat.mtimeMs,
      };
    })
    .sort((a, b) => a.slug.localeCompare(b.slug, undefined, { numeric: true }));
}

/**
 * 壓縮圖片：限制最長邊 1600px, JPEG quality 85
 */
export async function compressImage(srcPath, destPath) {
  const script = `
from PIL import Image
import sys
src, dest = sys.argv[1], sys.argv[2]
im = Image.open(src).convert('RGB')
w, h = im.size
MAX = 1600
if max(w, h) > MAX:
    if w >= h:
        im = im.resize((MAX, round(h*MAX/w)), Image.LANCZOS)
    else:
        im = im.resize((round(w*MAX/h), MAX), Image.LANCZOS)
im.save(dest, 'JPEG', quality=85, optimize=True, progressive=True)
print(f"{im.size[0]}x{im.size[1]}")
`;
  const { stdout } = await execFileAsync('python3', ['-c', script, srcPath, destPath]);
  return stdout.trim();
}

/**
 * 刪除圖片
 */
export function deleteImage(filename) {
  // 防目錄穿越
  const safe = path.basename(filename);
  const full = path.join(IMG_DIR, safe);
  if (!fs.existsSync(full)) return false;
  fs.unlinkSync(full);
  return true;
}

/**
 * 重新命名圖片（改 slug 或分類）
 */
export function renameImage(oldName, newName) {
  const safeOld = path.basename(oldName);
  const safeNew = path.basename(newName);
  const oldPath = path.join(IMG_DIR, safeOld);
  const newPath = path.join(IMG_DIR, safeNew);
  if (!fs.existsSync(oldPath)) return false;
  if (fs.existsSync(newPath)) throw new Error('目標檔名已存在');
  fs.renameSync(oldPath, newPath);
  return true;
}

/**
 * 排序：將圖片按照指定順序寫回 config.samples
 */
export function setImageOrder(filenames) {
  const config = readConfig();
  config.samples = filenames.map((filename, index) => ({
    filename: path.basename(filename),
    order: index,
  }));
  writeConfig(config);
  return config.samples;
}

/**
 * 取得圖片排序（冇設定就用檔名自然排序）
 */
export function getImageOrder() {
  const config = readConfig();
  if (!config.samples || !config.samples.length) return null;
  return config.samples;
}

/**
 * 刪除圖片時同步更新排序
 */
export function syncOrderAfterDelete(deleted) {
  const config = readConfig();
  if (!config.samples) return;
  config.samples = config.samples.filter((s) => s.filename !== deleted);
  config.samples.forEach((s, i) => { s.order = i; });
  writeConfig(config);
}

export { IMG_DIR, CONFIG_PATH };
