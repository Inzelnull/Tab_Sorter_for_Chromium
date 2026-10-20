/**
 * Tab Sorter - オプション設定スクリプト (options.js)
 * 
 * 【主な役割】
 * 1. 登録されているキーボードショートカット一覧の動的取得・画面描画 (chrome.commands.getAll)
 * 2. ブラウザ（Chrome / Edge）に応じたショートカット設定ページへの誘導・タブオープン
 * 3. ユーザー設定（ソート基準、ソート方向、URL比較方式）の取得・保存 (chrome.storage.sync)
 * 4. 設定変更時の自動保存とフィードバック（トースト通知）
 */

// =============================================================================
// 定数定義 & 初期設定
// =============================================================================

/**
 * 拡張機能のデフォルト設定
 */
const DEFAULT_SETTINGS = {
  defaultSortBy: 'title',       // 'title' または 'url'
  defaultDescending: 'false',   // 'false' (昇順) または 'true' (降順) ※select要素の値として文字列
  urlSortMode: 'domain'         // 'domain' (ドメイン優先) または 'full' (完全URL)
};

/**
 * 各コマンド名に対する人間向けのわかりやすい日本語表示ラベル
 */
const COMMAND_LABELS = {
  sort_title_asc: 'タイトル昇順ソート (A → Z, 1 → 9)',
  sort_title_desc: 'タイトル降順ソート (Z → A, 9 → 1)',
  sort_url_asc: 'URL昇順ソート (ドメイン・パス順)',
  sort_url_desc: 'URL降順ソート (ドメイン・パス順)'
};

// =============================================================================
// ブラウザ判定とショートカット設定URLの決定
// =============================================================================

/**
 * ユーザーが利用しているブラウザ（Chrome または Edge）を判定し、
 * 対応するショートカット設定画面の内部URLを返します。
 * 
 * @returns {string} 'edge://extensions/shortcuts' または 'chrome://extensions/shortcuts'
 */
function getBrowserShortcutsUrl() {
  const ua = navigator.userAgent;
  // Edge の User-Agent には 'Edg/' が含まれます
  if (ua.includes('Edg/')) {
    return 'edge://extensions/shortcuts';
  }
  return 'chrome://extensions/shortcuts';
}

// =============================================================================
// DOM要素の参照
// =============================================================================
const shortcutsListEl = document.getElementById('shortcutsList');
const btnOpenShortcuts = document.getElementById('btnOpenShortcuts');
const btnCopyShortcutsUrl = document.getElementById('btnCopyShortcutsUrl');
const shortcutsUrlTextEl = document.getElementById('shortcutsUrlText');

const selectSortBy = document.getElementById('defaultSortBy');
const selectDescending = document.getElementById('defaultDescending');
const selectUrlSortMode = document.getElementById('urlSortMode');
const toastEl = document.getElementById('toast');

// =============================================================================
// ショートカットキー一覧の描画
// =============================================================================

/**
 * ショートカット文字列（例: "Alt+Shift+S"）を、
 * 立体感のあるキートップ要素（<kbd>）に分解してHTML生成します。
 * 
 * @param {string} shortcutStr 
 * @returns {string} HTML文字列
 */
function formatShortcutKeysHtml(shortcutStr) {
  if (!shortcutStr || shortcutStr.trim() === '') {
    return '<span class="key-none">未割り当て</span>';
  }

  // '+' で分割して各キーを <kbd> タグで包む
  const keys = shortcutStr.split('+');
  return keys
    .map(key => `<kbd>${escapeHtml(key.trim())}</kbd>`)
    .join('<span class="key-separator">+</span>');
}

/**
 * HTMLエスケープ処理
 * @param {string} str 
 * @returns {string}
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * 現在ブラウザに登録されているショートカット情報を取得し、
 * オプション画面の一覧部分にレンダリングします。
 */
async function loadAndRenderShortcuts() {
  if (!chrome.commands || !chrome.commands.getAll) {
    shortcutsListEl.innerHTML = '<div class="loading-placeholder">ショートカットAPIに対応していません。</div>';
    return;
  }

  try {
    const commands = await chrome.commands.getAll();
    shortcutsListEl.innerHTML = '';

    // manifest.json で定義したコマンドを一覧表示
    const validCommands = commands.filter(cmd => cmd.name && cmd.name !== '_execute_action');

    if (validCommands.length === 0) {
      shortcutsListEl.innerHTML = '<div class="loading-placeholder">ショートカットが見つかりませんでした。</div>';
      return;
    }

    for (const cmd of validCommands) {
      const row = document.createElement('div');
      row.className = 'shortcut-row';

      const label = COMMAND_LABELS[cmd.name] || cmd.description || cmd.name;
      const keysHtml = formatShortcutKeysHtml(cmd.shortcut);

      row.innerHTML = `
        <span class="shortcut-name">${escapeHtml(label)}</span>
        <div class="shortcut-keys">${keysHtml}</div>
      `;

      shortcutsListEl.appendChild(row);
    }
  } catch (err) {
    console.error('ショートカット一覧の取得に失敗:', err);
    shortcutsListEl.innerHTML = '<div class="loading-placeholder">ショートカットの取得に失敗しました。</div>';
  }
}

// =============================================================================
// ショートカット変更画面を開く処理
// =============================================================================

/**
 * ブラウザの拡張機能ショートカット設定ページを開きます。
 * セキュリティ制限で直接開けない場合は、フォールバックとしてURLをクリップボードにコピーします。
 */
async function openShortcutsPage() {
  const url = getBrowserShortcutsUrl();
  try {
    // 新しいタブでショートカット設定ページを開く
    await chrome.tabs.create({ url });
  } catch (error) {
    console.warn('ショートカット画面の直接オープンに失敗。クリップボードへコピーします:', error);
    copyShortcutsUrl();
    alert(`ブラウザのセキュリティ設定により自動で開けませんでした。\nアドレスバーに以下のURLを貼り付けて開いてください:\n\n${url}`);
  }
}

/**
 * ショートカット設定画面のURLをクリップボードにコピー
 */
async function copyShortcutsUrl() {
  const url = getBrowserShortcutsUrl();
  try {
    await navigator.clipboard.writeText(url);
    showToast('URLをクリップボードにコピーしました！');
  } catch {
    // Clipboard API が使えない場合のフォールバック
    const input = document.createElement('input');
    input.value = url;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    document.body.removeChild(input);
    showToast('URLをクリップボードにコピーしました！');
  }
}

// =============================================================================
// 設定の読み込みと保存
// =============================================================================

/**
 * 保存済みの設定をストレージから読み込み、フォーム要素に反映します。
 */
async function loadSettings() {
  try {
    const stored = await chrome.storage.sync.get({
      defaultSortBy: DEFAULT_SETTINGS.defaultSortBy,
      defaultDescending: false,
      urlSortMode: DEFAULT_SETTINGS.urlSortMode
    });

    selectSortBy.value = stored.defaultSortBy || DEFAULT_SETTINGS.defaultSortBy;
    selectDescending.value = stored.defaultDescending ? 'true' : 'false';
    selectUrlSortMode.value = stored.urlSortMode || DEFAULT_SETTINGS.urlSortMode;
  } catch (err) {
    console.error('設定の読み込みに失敗:', err);
  }
}

/**
 * 現在のフォーム値を取得し、ストレージに自動保存します。
 */
async function saveSettings() {
  try {
    const newSettings = {
      defaultSortBy: selectSortBy.value,
      defaultDescending: selectDescending.value === 'true',
      urlSortMode: selectUrlSortMode.value
    };

    await chrome.storage.sync.set(newSettings);
    showToast('設定を保存しました');
  } catch (err) {
    console.error('設定の保存に失敗:', err);
    showToast('設定の保存に失敗しました');
  }
}

/**
 * トースト通知を表示する補助関数
 * @param {string} message 
 */
let toastTimeout = null;
function showToast(message) {
  const msgEl = toastEl.querySelector('.toast-message');
  if (msgEl) msgEl.textContent = message;

  toastEl.classList.add('show');
  if (toastTimeout) clearTimeout(toastTimeout);

  toastTimeout = setTimeout(() => {
    toastEl.classList.remove('show');
  }, 2200);
}

// =============================================================================
// イベントリスナーの登録・初期化
// =============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  // ブラウザごとのURL案内テキストを更新
  const targetUrl = getBrowserShortcutsUrl();
  if (shortcutsUrlTextEl) {
    shortcutsUrlTextEl.textContent = targetUrl;
  }

  // 設定の読み込みとショートカット一覧の描画
  await loadSettings();
  await loadAndRenderShortcuts();

  // イベントリスナーのバインド
  btnOpenShortcuts.addEventListener('click', openShortcutsPage);
  btnCopyShortcutsUrl.addEventListener('click', copyShortcutsUrl);

  // フォーム値が変更されたら即座に自動保存
  selectSortBy.addEventListener('change', saveSettings);
  selectDescending.addEventListener('change', saveSettings);
  selectUrlSortMode.addEventListener('change', saveSettings);
});
