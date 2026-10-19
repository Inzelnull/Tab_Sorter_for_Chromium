/**
 * Tab Sorter - Chrome & Edge Extension
 * 
 * 機能概要:
 * - タブ・タブグループのソート（昇順 / 降順）
 * - 全角英数対応、自然順ソート（1, 2, 10 等）
 * - タブグループの維持、グループ外・グループ内ソート、グループ末尾配置
 * - サードパーティ依存ゼロ、最小権限で安全な実装
 */

// 自然順・全角英数比較用の Collator
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base'
});

/**
 * 比較用に文字列を正規化（全角英数の半角化、余分な空白のトリム）
 * @param {string|null|undefined} str 
 * @returns {string}
 */
function normalizeForComparison(str) {
  if (typeof str !== 'string') return '';
  // NFKC正規化により、全角英数（'１' -> '1', 'Ａ' -> 'A'）などを正規化
  return str.normalize('NFKC').trim();
}

/**
 * 自然順・全角英数対応の文字列比較関数
 * @param {string|null|undefined} a 
 * @param {string|null|undefined} b 
 * @param {boolean} descending 
 * @returns {number}
 */
function compareStrings(a, b, descending = false) {
  const normA = normalizeForComparison(a);
  const normB = normalizeForComparison(b);
  let res = collator.compare(normA, normB);

  // 正規化後に同等とみなされた場合は、元の文字列でタイブレーク
  if (res === 0) {
    res = (a || '').localeCompare(b || '', undefined, { numeric: true });
  }

  return descending ? -res : res;
}

/**
 * タブ比較関数（タイトル -> URL -> ID）
 * @param {chrome.tabs.Tab} tabA 
 * @param {chrome.tabs.Tab} tabB 
 * @param {boolean} descending 
 * @returns {number}
 */
function compareTabs(tabA, tabB, descending = false) {
  let res = compareStrings(tabA.title, tabB.title, descending);
  if (res === 0) {
    res = compareStrings(tabA.url, tabB.url, descending);
  }
  if (res === 0) {
    res = descending ? (tabB.id - tabA.id) : (tabA.id - tabB.id);
  }
  return res;
}

/**
 * タブグループ比較関数（グループ名 -> ID）
 * @param {{ id: number, title?: string }} groupA 
 * @param {{ id: number, title?: string }} groupB 
 * @param {boolean} descending 
 * @returns {number}
 */
function compareGroups(groupA, groupB, descending = false) {
  let res = compareStrings(groupA.title, groupB.title, descending);
  if (res === 0) {
    res = descending ? (groupB.id - groupA.id) : (groupA.id - groupB.id);
  }
  return res;
}

// 排他制御フラグ（処理の競合防止）
let isSorting = false;

/**
 * 現在のウィンドウのタブおよびタブグループをソート
 * @param {boolean} descending - true の場合降順、false の場合昇順
 */
async function sortTabsInCurrentWindow(descending = false) {
  if (isSorting) {
    return;
  }
  isSorting = true;

  try {
    // 実行中インジケータ
    await chrome.action.setBadgeText({ text: '...' });
    await chrome.action.setBadgeBackgroundColor({ color: '#6366F1' });

    // 現在のアクティブなウィンドウ内のタブを全取得
    const tabs = await chrome.tabs.query({ currentWindow: true });
    if (!tabs || tabs.length <= 1) {
      showBadgeFeedback(descending);
      return;
    }

    const windowId = tabs[0].windowId;

    // 1. タブの分類
    // - ピン留めタブ (Pinned)
    // - グループ外の通常タブ (Ungrouped)
    // - グループに所属するタブ (Grouped)
    const pinnedTabs = [];
    const ungroupedTabs = [];
    const groupedTabs = [];

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

    // 2. ピン留めタブ・非グループタブのソート
    pinnedTabs.sort((a, b) => compareTabs(a, b, descending));
    ungroupedTabs.sort((a, b) => compareTabs(a, b, descending));

    // 3. グループ情報の収集とグループのソート
    const groupMap = new Map();
    if (chrome.tabGroups && chrome.tabGroups.get && groupedTabs.length > 0) {
      const distinctGroupIds = [...new Set(groupedTabs.map(t => t.groupId))];
      for (const gid of distinctGroupIds) {
        try {
          const groupInfo = await chrome.tabGroups.get(gid);
          groupMap.set(gid, groupInfo);
        } catch {
          // グループ情報取得失敗時は空タイトルで代替
          groupMap.set(gid, { id: gid, title: '' });
        }
      }
    }

    // 各グループのソート（グループ名でソート。昇順・降順はタブと統一）
    const sortedGroups = Array.from(groupMap.values()).sort((a, b) => compareGroups(a, b, descending));

    // 各グループ内のタブをソート
    const sortedTabsByGroup = new Map();
    for (const group of sortedGroups) {
      const tabsInThisGroup = groupedTabs.filter(t => t.groupId === group.id);
      tabsInThisGroup.sort((a, b) => compareTabs(a, b, descending));
      sortedTabsByGroup.set(group.id, tabsInThisGroup);
    }

    // 4. 移動操作の実行

    // (A) ピン留めタブを先頭から順に並べる
    for (let i = 0; i < pinnedTabs.length; i++) {
      try {
        await chrome.tabs.move(pinnedTabs[i].id, { index: i });
      } catch (err) {
        console.warn(`Failed to move pinned tab ${pinnedTabs[i].id}:`, err);
      }
    }

    // (B) 非グループタブをピン留めタブの直後から順に並べる
    const pinnedCount = pinnedTabs.length;
    for (let i = 0; i < ungroupedTabs.length; i++) {
      try {
        await chrome.tabs.move(ungroupedTabs[i].id, { index: pinnedCount + i });
      } catch (err) {
        console.warn(`Failed to move ungrouped tab ${ungroupedTabs[i].id}:`, err);
      }
    }

    // (C) 各タブグループをグループ名順に末尾（一番下）に配置し、各グループ内のタブもソート
    if (chrome.tabGroups && sortedGroups.length > 0) {
      // まず、タブグループ全体をグループ名順にウィンドウ末尾（一番下）へ順番に送る
      for (const group of sortedGroups) {
        try {
          await chrome.tabGroups.move(group.id, { index: -1 });
        } catch (err) {
          console.warn(`Failed to move tabGroup ${group.id}:`, err);
        }
      }

      // 各グループ内のタブをソート順に並び替え
      for (const group of sortedGroups) {
        try {
          // グループ移動後の最新のタブ状態を取得
          const currentGroupTabs = await chrome.tabs.query({ windowId, groupId: group.id });
          if (!currentGroupTabs || currentGroupTabs.length <= 1) {
            continue;
          }

          // グループ内のタブをソート
          currentGroupTabs.sort((a, b) => compareTabs(a, b, descending));

          // グループの先頭インデックスを取得
          let targetIndex = Math.min(...currentGroupTabs.map(t => t.index));

          // グループの範囲内で順番に移動（グループから外れることなく順序が整う）
          for (const tab of currentGroupTabs) {
            await chrome.tabs.move(tab.id, { index: targetIndex });
            targetIndex++;
          }
        } catch (err) {
          console.warn(`Failed to sort tabs in group ${group.id}:`, err);
        }
      }
    }

    // 完了フィードバックの表示
    showBadgeFeedback(descending);

  } catch (error) {
    console.error('Tab Sorter Error:', error);
    try {
      await chrome.action.setBadgeText({ text: 'ERR' });
      await chrome.action.setBadgeBackgroundColor({ color: '#EF4444' });
      setTimeout(() => chrome.action.setBadgeText({ text: '' }), 1500);
    } catch {}
  } finally {
    isSorting = false;
  }
}

/**
 * ソート完了時のバッジ表示フィードバック
 * @param {boolean} descending 
 */
function showBadgeFeedback(descending) {
  const badgeText = descending ? 'DESC' : 'ASC';
  const badgeColor = descending ? '#F59E0B' : '#10B981'; // 降順: アンバー, 昇順: エメラルド

  chrome.action.setBadgeText({ text: badgeText });
  chrome.action.setBadgeBackgroundColor({ color: badgeColor });

  const label = descending ? '降順' : '昇順';
  chrome.action.setTitle({
    title: `ソート完了: ${label} (次回: クリックで昇順、右クリックで降順)`
  });

  setTimeout(() => {
    chrome.action.setBadgeText({ text: '' });
    chrome.action.setTitle({
      title: 'タブを昇順でソート（右クリックで降順）'
    });
  }, 1400);
}

// ==========================================
// イベントリスナーの登録
// ==========================================

// 1. アイコン左クリック時 -> 昇順ソートを実行
chrome.action.onClicked.addListener(async () => {
  await sortTabsInCurrentWindow(false);
});

// 2. コンテキストメニューの作成関数
function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'sort_descending',
      title: '降順でソート (Z → A, 9 → 1)',
      contexts: ['action']
    });
    chrome.contextMenus.create({
      id: 'sort_ascending',
      title: '昇順でソート (A → Z, 1 → 9)',
      contexts: ['action']
    });
  });
}

// インストール / 更新時
chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus();
});

// ブラウザ起動時
chrome.runtime.onStartup.addListener(() => {
  setupContextMenus();
});

// 3. コンテキストメニュー（右クリック）項目選択時
chrome.contextMenus.onClicked.addListener(async (info) => {
  if (info.menuItemId === 'sort_descending') {
    await sortTabsInCurrentWindow(true);
  } else if (info.menuItemId === 'sort_ascending') {
    await sortTabsInCurrentWindow(false);
  }
});
