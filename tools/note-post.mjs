#!/usr/bin/env node
// note 自動投稿スクリプト（ブラウザ自動操作 / Playwright）
//
//   1回目だけ: npm run note:login          … ブラウザが開くので手動でnoteにログイン → Enter
//   下書き保存: npm run note:draft -- note/記事.md
//   公開まで  : npm run note:publish -- note/記事.md
//
// ログイン情報は .note-auth.json（Cookie）に保存され、パスワードはどこにも保存しません。
// .note-auth.json は絶対にGitにコミットしないでください（.gitignore済み）。
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline/promises';
import { parseNote } from './md-to-html.mjs';

const AUTH = process.env.NOTE_AUTH_FILE || path.resolve('.note-auth.json');
const NEW_URL = 'https://note.com/notes/new';
const [cmd, ...rest] = process.argv.slice(2);
const publish = rest.includes('--publish');
const headless = rest.includes('--headless');
const file = rest.find((a) => !a.startsWith('--'));

async function login() {
  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto('https://note.com/login');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question('ブラウザでnoteにログインしたら、ここでEnterを押してください > ');
  rl.close();
  await ctx.storageState({ path: AUTH });
  console.log(`ログイン状態を保存しました: ${AUTH}`);
  await browser.close();
}

async function post() {
  if (!file) throw new Error('記事ファイルを指定してください 例: npm run note:draft -- note/記事.md');
  if (!fs.existsSync(AUTH)) throw new Error('先に npm run note:login を実行してください');
  const { title, tags, html } = parseNote(fs.readFileSync(file, 'utf8'));
  if (!title) throw new Error('記事の1行目に「# タイトル」を書いてください');

  const browser = await chromium.launch({ headless, slowMo: headless ? 0 : 80 });
  const ctx = await browser.newContext({ storageState: AUTH, locale: 'ja-JP' });
  const page = await ctx.newPage();
  await page.goto(NEW_URL);
  await page.waitForURL(/editor\.note\.com|\/edit/, { timeout: 30000 }).catch(() => {});
  if (/login/.test(page.url())) throw new Error('ログインが切れています。npm run note:login をやり直してください');

  // タイトル
  const titleBox = page.locator('textarea[placeholder*="タイトル"], [placeholder*="タイトル"]').first();
  await titleBox.waitFor({ timeout: 30000 });
  await titleBox.click();
  await titleBox.fill(title);

  // 本文：エディタ(ProseMirror)へHTMLを「貼り付け」として流し込む
  const body = page.locator('.ProseMirror[contenteditable="true"], [contenteditable="true"]').last();
  await body.click();
  await body.evaluate((el, h) => {
    const dt = new DataTransfer();
    dt.setData('text/html', h);
    dt.setData('text/plain', h.replace(/<[^>]+>/g, ''));
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
  }, html);
  await page.waitForTimeout(1500);

  if (!publish) {
    await page.getByRole('button', { name: /下書き保存/ }).click();
    await page.waitForTimeout(2000);
    console.log(`下書き保存しました: ${page.url()}`);
  } else {
    await page.getByRole('button', { name: /公開に進む|公開設定/ }).click();
    // ハッシュタグ
    for (const t of tags) {
      const tagInput = page.locator('input[placeholder*="ハッシュタグ"]').first();
      if (!(await tagInput.count())) break;
      await tagInput.fill(t);
      await tagInput.press('Enter');
    }
    await page.getByRole('button', { name: /^投稿する$|^公開する$/ }).click();
    await page.waitForTimeout(3000);
    console.log(`公開しました: ${page.url()}`);
  }
  await page.screenshot({ path: 'note-result.png', fullPage: true });
  await ctx.storageState({ path: AUTH }); // Cookieを更新
  await browser.close();
}

const run = { login, post }[cmd];
if (!run) {
  console.log('使い方: node tools/note-post.mjs login | post <記事.md> [--publish] [--headless]');
  process.exit(1);
}
run().catch((e) => { console.error('エラー:', e.message); process.exit(1); });
