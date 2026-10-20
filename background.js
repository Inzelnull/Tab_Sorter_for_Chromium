/**
 * Tab Sorter - Chrome & Edge Extension
 * バックグラウンド・サービスクーカー (Service Worker)
 * 
 * 【主な機能】
 * 1. タブおよびタブグループの整然としたソート（昇順 / 降順）
 * 2. 「タイトル順」および「URL順（ドメイン階層優先）」の両対応
 * 3. 自然順ソート（例: 1, 2, 10）および全角英数字の正規化対応（例: １, ２, Ａ）
 * 4. タブグループの所属構造を完全維持し、グループ外タブの後ろ（ウィンドウ末尾）に整列
 * 5. キーボードショートカット（manifest commands）の受信と即時実行
 * 6. ユーザー設定（ストレージ）に応じた柔軟なデフォルト挙動
 * 7. 外部ライブラリ依存ゼロ（Vanilla JS）＆ 最小権限で安全な設計
 */

// =============================================================================
// 定数およびユーティリティ設定
// =============================================================================

/**
 * 自然順（1, 2, 10 等）および大文字小文字・アクセントを考慮した文字列比較用 Collator。
 * numeric: true により、文字列内の数値を数値順として自然に比較します。
 */
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base'
});

/**
 * 拡張機能のデフォルト設定値
 */
const DEFAULT_SETTINGS = {
  // アイコンクリック時のソート基準: 'title' (タイトル順) または 'url' (URL順)
  defaultSortBy: 'title',
  // アイコンクリック時の並び順: false (昇順), true (降順)
  defaultDescending: false,
  // URLソート時の方式: 'domain' (ドメイン優先・サイトごとにまとめる), 'full' (URL全体直接比較)
  urlSortMode: 'domain'
};

/**
 * Chrome Storageからユーザー設定を読み込む補助関数。
 * 読み込みに失敗した場合や未保存の場合はデフォルト値を返します。
 * @returns {Promise<typeof DEFAULT_SETTINGS>}
 */
async function getSettings() {
  try {
    if (chrome.storage && chrome.storage.sync) {
      const stored = await chrome.storage.sync.get(DEFAULT_SETTINGS);
      return { ...DEFAULT_SETTINGS, ...stored };
    }
  } catch (error) {
    console.warn('Tab Sorter: 設定の取得に失敗したためデフォルト設定を使用します。', error);
  }
  return { ...DEFAULT_SETTINGS };
}

// =============================================================================
// 文字列比較・正規化ロジック
// =============================================================================

/**
 * 比較用に文字列を正規化します。
 * - NFKC正規化により、全角英数（'１' -> '1', 'Ａ' -> 'A'）などを半角に統一
 * - 前後の余分な空白文字をトリム
 * 
 * @param {string|null|undefined} str - 正規化対象の文字列
 * @returns {string} 正規化後の文字列
 */
function normalizeForComparison(str) {
  if (typeof str !== 'string') return '';
  return str.normalize('NFKC').trim();
}

/**
 * 自然順・全角英数対応の汎用文字列比較関数
 * 
 * @param {string|null|undefined} a - 比較対象文字列 A
 * @param {string|null|undefined} b - 比較対象文字列 B
 * @param {boolean} [descending=false] - true の場合は降順、false の場合は昇順
 * @returns {number} 比較結果（負数: aが先、0: 等価、正数: bが先）
 */
function compareStrings(a, b, descending = false) {
  const normA = normalizeForComparison(a);
  const normB = normalizeForComparison(b);
  let res = collator.compare(normA, normB);

  // 正規化後に同等と判定された場合（全角と半角の違いなど）、
  // 元の文字列を使ってタイブレーク（順序の決定論的安定性を保つ）
  if (res === 0) {
    res = (a || '').localeCompare(b || '', undefined, { numeric: true });
  }

  return descending ? -res : res;
}

/**
 * URL文字列をホスト名、パス、生URLにパース・分解します。
 * サイト（ドメイン）ごとにグループ化して直感的にソートするために使用します。
 * 
 * @param {string|null|undefined} urlStr - 対象URL文字列
 * @returns {{ host: string, path: string, raw: string }}
 */
function parseUrlForSort(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') {
    return { host: '', path: '', raw: '' };
  }
  try {
    const parsed = new URL(urlStr);
    // www. の有無で同一サイトが分散しないよう、ホスト名から 'www.' を除去して小文字化
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = parsed.pathname + parsed.search + parsed.hash;
    return { host, path, raw: urlStr };
  } catch {
    // chrome://, edge://, file://, about:blank 等で URL パースに失敗した場合は
    // 生のURL文字列をフォールバックとして保持
    return { host: '', path: '', raw: urlStr };
  }
}

/**
 * 2つのタブを比較するメイン比較関数
 * 
 * @param {chrome.tabs.Tab} tabA - 比較対象タブ A
 * @param {chrome.tabs.Tab} tabB - 比較対象タブ B
 * @param {'title'|'url'} [sortBy='title'] - ソート基準 ('title' または 'url')
 * @param {boolean} [descending=false] - true の場合は降順、false の場合は昇順
 * @param {'domain'|'full'} [urlSortMode='domain'] - URL比較時の方式
 * @returns {number} 比較結果
 */
function compareTabs(tabA, tabB, sortBy = 'title', descending = false, urlSortMode = 'domain') {
  let res = 0;

  if (sortBy === 'url') {
    // ----------------------------------------------------
    // 【URL順ソート】
    // ----------------------------------------------------
    if (urlSortMode === 'domain') {
      // 1. ドメイン（ホスト名）優先比較:
      // これにより同じWebサイトのページ同士が綺麗に隣り合います
      const infoA = parseUrlForSort(tabA.url);
      const infoB = parseUrlForSort(tabB.url);

      res = compareStrings(infoA.host, infoB.host, descending);

      // 2. ホスト名が同一の場合は、パス・クエリで比較
      if (res === 0) {
        res = compareStrings(infoA.path, infoB.path, descending);
      }

      // 3. パスも同一の場合は、完全URL文字列で比較
      if (res === 0) {
        res = compareStrings(infoA.raw, infoB.raw, descending);
      }
    } else {
      // 完全URL文字列での直接比較
      res = compareStrings(tabA.url, tabB.url, descending);
    }

    // 4. URLが同一の場合は、ページタイトルでタイブレーク
    if (res === 0) {
      res = compareStrings(tabA.title, tabB.title, descending);
    }

  } else {
    // ----------------------------------------------------
    // 【タイトル順ソート】
    // ----------------------------------------------------
    // 1. ページタイトルで自然順比較
    res = compareStrings(tabA.title, tabB.title, descending);

    // 2. タイトルが完全に同じ場合は、URLでタイブレーク
    if (res === 0) {
      res = compareStrings(tabA.url, tabB.url, descending);
    }
  }

  // ----------------------------------------------------
  // 【最終タイブレーク】タブIDによる一意性の担保
  // ----------------------------------------------------
  if (res === 0) {
    const idA = tabA.id || 0;
    const idB = tabB.id || 0;
    res = descending ? (idB - idA) : (idA - idB);
  }

  return res;
}

/**
 * タブグループ同士をグループ名（タイトル）で比較する関数
 * 
 * @param {{ id: number, title?: string }} groupA 
 * @param {{ id: number, title?: string }} groupB 
 * @param {boolean} [descending=false] 
 * @returns {number}
 */
function compareGroups(groupA, groupB, descending = false) {
  let res = compareStrings(groupA.title, groupB.title, descending);
  // グループ名が同等の場合はグループIDで安定ソート
  if (res === 0) {
    res = descending ? (groupB.id - groupA.id) : (groupA.id - groupB.id);
  }
  return res;
}

// =============================================================================
// タブ並び替え（ソート実行）エンジン
// =============================================================================

// 多重実行防止用の排他制御フラグ（連打によるタブインデックスの不整合を抑止）
let isSorting = false;

/**
 * 現在アクティブなウィンドウ内のタブおよびタブグループを並び替えます。
 * 
 * 【並び替えのルール】
 * 1. 最前列: ピン留めされたタブ（ピン留めタブ内でのみソート）
 * 2. 中間列: タブグループに属さない通常タブ（グループ外タブ同士でソート）
 * 3. 末尾列: タブグループ（グループ名順に末尾へ配置し、各グループ内でもタブをソート）
 * 
 * @param {Object} [options]
 * @param {'title'|'url'} [options.sortBy='title'] - ソート基準 ('title' or 'url')
 * @param {boolean} [options.descending=false] - true: 降順, false: 昇順
 */
async function sortTabsInCurrentWindow({ sortBy = 'title', descending = false } = {}) {
  // すでにソート処理が進行中の場合は重複実行を防止
  if (isSorting) {
    return;
  }
  isSorting = true;

  try {
    // 実行中表示: ツールバーアイコンのバッジにローディングインジケータを表示
    await chrome.action.setBadgeText({ text: '...' });
    await chrome.action.setBadgeBackgroundColor({ color: '#6366F1' });

    // ユーザー設定（URLソート時のドメイン優先フラグなど）を取得
    const settings = await getSettings();
    const urlSortMode = settings.urlSortMode || 'domain';

    // 現在のウィンドウに所属するタブをすべて取得
    const tabs = await chrome.tabs.query({ currentWindow: true });
    if (!tabs || tabs.length <= 1) {
      showBadgeFeedback(sortBy, descending);
      return;
    }

    const windowId = tabs[0].windowId;

    // -------------------------------------------------------------------------
    // ステップ 1: タブの種別分類
    // -------------------------------------------------------------------------
    const pinnedTabs = [];      // ピン留めタブ
    const ungroupedTabs = [];   // グループ外の通常タブ
    const groupedTabs = [];     // いずれかのタブグループに属するタブ

    // Chrome/Edgeのタブグループ未所属を示す定数（未定義環境への安全対策含む）
    const TAB_GROUP_NONE = (chrome.tabGroups && chrome.tabGroups.TAB_GROUP_ID_NONE) !== undefined
      ? chrome.tabGroups.TAB_GROUP_ID_NONE
      : -1;

    for (const tab of tabs) {
      if (tab.pinned) {
        pinnedTabs.push(tab);
      } else if (tab.groupId === undefined || tab.groupId === null || tab.groupId === TAB_GROUP_NONE || tab.groupId < 0) {
        ungroupedTabs.push(tab);
      } else {
        groupedTabs.push(tab);
      }
    }

    // -------------------------------------------------------------------------
    // ステップ 2: ピン留めタブおよびグループ外タブのソート
    // -------------------------------------------------------------------------
    pinnedTabs.sort((a, b) => compareTabs(a, b, sortBy, descending, urlSortMode));
    ungroupedTabs.sort((a, b) => compareTabs(a, b, sortBy, descending, urlSortMode));

    // -------------------------------------------------------------------------
    // ステップ 3: タブグループ情報の収集とグループのソート
    // -------------------------------------------------------------------------
    const groupMap = new Map();
    if (chrome.tabGroups && chrome.tabGroups.get && groupedTabs.length > 0) {
      // 存在するグループIDの一覧を抽出
      const distinctGroupIds = [...new Set(groupedTabs.map(t => t.groupId))];
      for (const gid of distinctGroupIds) {
        try {
          const groupInfo = await chrome.tabGroups.get(gid);
          groupMap.set(gid, groupInfo);
        } catch {
          // グループ情報取得に失敗した場合は空タイトルで代替
          groupMap.set(gid, { id: gid, title: '' });
        }
      }
    }

    // グループ自体のソート（グループタイトルで整列。昇順/降順は指定に追従）
    const sortedGroups = Array.from(groupMap.values()).sort((a, b) => compareGroups(a, b, descending));

    // -------------------------------------------------------------------------
    // ステップ 4: タブの物理移動を実行
    // -------------------------------------------------------------------------

    // (A) ピン留めタブをウィンドウ先頭 (インデックス 0〜) に整列
    for (let i = 0; i < pinnedTabs.length; i++) {
      try {
        await chrome.tabs.move(pinnedTabs[i].id, { index: i });
      } catch (err) {
        console.warn(`ピン留めタブ ${pinnedTabs[i].id} の移動に失敗:`, err);
      }
    }

    // (B) グループ外タブをピン留めタブの直後に整列
    const pinnedCount = pinnedTabs.length;
    for (let i = 0; i < ungroupedTabs.length; i++) {
      try {
        await chrome.tabs.move(ungroupedTabs[i].id, { index: pinnedCount + i });
      } catch (err) {
        console.warn(`非グループタブ ${ungroupedTabs[i].id} の移動に失敗:`, err);
      }
    }

    // (C) 各タブグループをグループ名順に末尾へ配置し、各グループ内のタブも整列
    if (chrome.tabGroups && sortedGroups.length > 0) {
      // まずタブグループ全体を、整列順にウィンドウ末尾 (index: -1) へ順次移動
      for (const group of sortedGroups) {
        try {
          await chrome.tabGroups.move(group.id, { index: -1 });
        } catch (err) {
          console.warn(`タブグループ ${group.id} の末尾移動に失敗:`, err);
        }
      }

      // 各グループ内のタブをソート順に並び替え
      for (const group of sortedGroups) {
        try {
          // グループ移動後の最新タブ状態を取得
          const currentGroupTabs = await chrome.tabs.query({ windowId, groupId: group.id });
          if (!currentGroupTabs || currentGroupTabs.length <= 1) {
            continue;
          }

          // グループ内のタブをソート
          currentGroupTabs.sort((a, b) => compareTabs(a, b, sortBy, descending, urlSortMode));

          // グループの先頭インデックスを取得
          let targetIndex = Math.min(...currentGroupTabs.map(t => t.index));

          // グループの範囲内で順番に移動（グループ所属を保ったまま順序を整える）
          for (const tab of currentGroupTabs) {
            await chrome.tabs.move(tab.id, { index: targetIndex });
            targetIndex++;
          }
        } catch (err) {
          console.warn(`グループ ${group.id} 内のタブ移動に失敗:`, err);
        }
      }
    }

    // 完了フィードバックの表示
    showBadgeFeedback(sortBy, descending);

  } catch (error) {
    console.error('Tab Sorter 処理エラー:', error);
    try {
      await chrome.action.setBadgeText({ text: 'ERR' });
      await chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
      setTimeout(() => chrome.action.setBadgeText({ text: '' }), 1500);
    } catch {}
  } finally {
    isSorting = false;
  }
}

// =============================================================================
// バッジフィードバック表示
// =============================================================================

/**
 * ソート完了時にツールバーアイコンに視覚的フィードバック（バッジおよびツールチップ）を表示します。
 * 
 * @param {'title'|'url'} sortBy - ソート基準
 * @param {boolean} descending - 降順かどうか
 */
function showBadgeFeedback(sortBy, descending) {
  const isUrl = sortBy === 'url';
  
  // バッジテキスト: 最大4文字程度で視認性よく短縮表示
  // タイトル昇順: 'ASC' / 降順: 'DESC'
  // URL昇順: 'U-UP' / 降順: 'U-DN'
  const badgeText = isUrl ? (descending ? 'U-DN' : 'U-UP') : (descending ? 'DESC' : 'ASC');
  
  // バッジ背景色: 昇順はエメラルドグリーン (#10B981)、降順はアンバーオレンジ (#F59E0B)
  const badgeColor = descending ? '#F59E0B' : '#10B981';

  chrome.action.setBadgeText({ text: badgeText });
  chrome.action.setBadgeBackgroundColor({ color: badgeColor });

  const typeName = isUrl ? 'URL' : 'タイトル';
  const orderName = descending ? '降順' : '昇順';

  chrome.action.setTitle({
    title: `Tab Sorter: ${typeName}【${orderName}】で整列完了`
  });

  // 1.5秒後にバッジを消去し、デフォルトのツールチップに戻す
  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({
      title: 'タブをソート（右クリックでメニュー・オプション）'
    });
  }, 1500);
}

// =============================================================================
// イベントリスナーの登録
// =============================================================================

/**
 * 1. ツールバーアイコンの左クリック時:
 * ユーザーが保存したデフォルト設定（タイトル順 / URL順、昇順 / 降順）に従ってソートを実行します。
 */
chrome.action.onClicked.addListener(async () => {
  const settings = await getSettings();
  await sortTabsInCurrentWindow({
    sortBy: settings.defaultSortBy || 'title',
    descending: !!settings.defaultDescending
  });
});

/**
 * 2. キーボードショートカット（commands）受信時:
 * manifest.json に定義された各コマンドキーが押された際に即座に実行します。
 */
chrome.commands.onCommand.addListener(async (command) => {
  switch (command) {
    case 'sort_title_asc':
      // タイトル昇順
      await sortTabsInCurrentWindow({ sortBy: 'title', descending: false });
      break;
    case 'sort_title_desc':
      // タイトル降順
      await sortTabsInCurrentWindow({ sortBy: 'title', descending: true });
      break;
    case 'sort_url_asc':
      // URL昇順
      await sortTabsInCurrentWindow({ sortBy: 'url', descending: false });
      break;
    case 'sort_url_desc':
      // URL降順
      await sortTabsInCurrentWindow({ sortBy: 'url', descending: true });
      break;
    default:
      console.warn(`未知のコマンドを受信しました: ${command}`);
      break;
  }
});

/**
 * 3. 右クリックコンテキストメニューの生成
 */
function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    // タイトルソート
    chrome.contextMenus.create({
      id: 'sort_title_asc',
      title: 'タイトル昇順でソート (A → Z, 1 → 9)',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: 'sort_title_desc',
      title: 'タイトル降順でソート (Z → A, 9 → 1)',
      contexts: ['action']
    });

    // 区切り線 1
    chrome.contextMenus.create({
      id: 'sep_url',
      type: 'separator',
      contexts: ['action']
    });

    // URLソート
    chrome.contextMenus.create({
      id: 'sort_url_asc',
      title: 'URL昇順でソート (ドメイン・パス順)',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: 'sort_url_desc',
      title: 'URL降順でソート (ドメイン・パス順)',
      contexts: ['action']
    });

    // 区切り線 2
    chrome.contextMenus.create({
      id: 'sep_options',
      type: 'separator',
      contexts: ['action']
    });

    // 設定画面を開く
    chrome.contextMenus.create({
      id: 'open_options',
      title: '設定・ショートカット変更...',
      contexts: ['action']
    });
  });
}

// 拡張機能インストールまたはアップデート時
chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus();
});

// ブラウザ起動時
chrome.runtime.onStartup.addListener(() => {
  setupContextMenus();
});

/**
 * 4. コンテキストメニュー選択時のイベントハンドラ
 */
chrome.contextMenus.onClicked.addListener(async (info) => {
  switch (info.menuItemId) {
    case 'sort_title_asc':
      await sortTabsInCurrentWindow({ sortBy: 'title', descending: false });
      break;
    case 'sort_title_desc':
      await sortTabsInCurrentWindow({ sortBy: 'title', descending: true });
      break;
    case 'sort_url_asc':
      await sortTabsInCurrentWindow({ sortBy: 'url', descending: false });
      break;
    case 'sort_url_desc':
      await sortTabsInCurrentWindow({ sortBy: 'url', descending: true });
      break;
    case 'open_options':
      // 設定画面（options_ui）を開く
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      } else {
        chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
      }
      break;
    default:
      break;
  }
});
