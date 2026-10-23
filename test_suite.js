/**
 * Tab Sorter - 総合テストスイート (test_suite.js)
 * 
 * 【検証内容】
 * Test 1: 自然順ソート（1, 2, 10 等）および全角英数字の正規化比較テスト
 * Test 2: URLソートの検証（ドメイン階層優先、パスの自然順、タイブレーク）
 * Test 3: タブグループの所属維持・グループ内ソート・ウィンドウ末尾配置の検証
 * Test 4: 同一ドメインでのタブグループ自動作成機能の検証（未所属対象・先頭位置・順序維持・ドメイン名）
 * 
 * 実行方法:
 *   node test_suite.js
 */

const assert = require('assert');

// =============================================================================
// テスト対象のソートロジック（background.js と同等の実装）
// =============================================================================

// 自然順比較用 Collator
const collator = new Intl.Collator(undefined, {
  numeric: true,
  sensitivity: 'base'
});

/**
 * 比較用に文字列を正規化（全角英数半角化・トリム）
 */
function normalizeForComparison(str) {
  if (typeof str !== 'string') return '';
  return str.normalize('NFKC').trim();
}

/**
 * 文字列の自然順・全角対応比較
 */
function compareStrings(a, b, descending = false) {
  const normA = normalizeForComparison(a);
  const normB = normalizeForComparison(b);
  let res = collator.compare(normA, normB);

  // 正規化後に同等の場合のタイブレーク
  if (res === 0) {
    res = (a || '').localeCompare(b || '', undefined, { numeric: true });
  }

  return descending ? -res : res;
}

/**
 * URL文字列をパースして比較用パーツを抽出
 */
function parseUrlForSort(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') {
    return { host: '', path: '', raw: '' };
  }
  try {
    const parsed = new URL(urlStr);
    const host = parsed.hostname.toLowerCase().replace(/^www\./, '');
    const path = parsed.pathname + parsed.search + parsed.hash;
    return { host, path, raw: urlStr };
  } catch {
    return { host: '', path: '', raw: urlStr };
  }
}

/**
 * タブ比較関数（タイトル順 / URL順）
 */
function compareTabs(tabA, tabB, sortBy = 'title', descending = false, urlSortMode = 'domain') {
  let res = 0;

  if (sortBy === 'url') {
    if (urlSortMode === 'domain') {
      const infoA = parseUrlForSort(tabA.url);
      const infoB = parseUrlForSort(tabB.url);

      // 1. ホスト名で自然順比較
      res = compareStrings(infoA.host, infoB.host, descending);

      // 2. ホスト名が同一の場合はパスで比較
      if (res === 0) {
        res = compareStrings(infoA.path, infoB.path, descending);
      }

      // 3. パスも同一なら完全URLで比較
      if (res === 0) {
        res = compareStrings(infoA.raw, infoB.raw, descending);
      }
    } else {
      res = compareStrings(tabA.url, tabB.url, descending);
    }

    // 4. URLが同一ならタイトルでタイブレーク
    if (res === 0) {
      res = compareStrings(tabA.title, tabB.title, descending);
    }
  } else {
    // タイトル優先
    res = compareStrings(tabA.title, tabB.title, descending);
    if (res === 0) {
      res = compareStrings(tabA.url, tabB.url, descending);
    }
  }

  // 最終タイブレーク: タブID
  if (res === 0) {
    const idA = tabA.id || 0;
    const idB = tabB.id || 0;
    res = descending ? (idB - idA) : (idA - idB);
  }

  return res;
}

/**
 * タブグループ比較関数
 */
function compareGroups(groupA, groupB, descending = false) {
  let res = compareStrings(groupA.title, groupB.title, descending);
  if (res === 0) {
    res = descending ? (groupB.id - groupA.id) : (groupA.id - groupB.id);
  }
  return res;
}

// =============================================================================
// テスト実行
// =============================================================================

console.log('--- Test 1: 自然順ソート（1, 2, 10）および全角数字のテスト ---');
{
  const input = ['タブ10', 'タブ2', 'タブ1', 'タブ２０', 'タブ１', 'タブ２'];
  const asc = [...input].sort((a, b) => compareStrings(a, b, false));
  
  // 自然順かつ全角正規化により、タブ1/タブ１ -> タブ2/タブ２ -> タブ10 -> タブ20 の順
  assert.strictEqual(normalizeForComparison(asc[0]), 'タブ1');
  assert.strictEqual(normalizeForComparison(asc[1]), 'タブ1');
  assert.strictEqual(normalizeForComparison(asc[2]), 'タブ2');
  assert.strictEqual(normalizeForComparison(asc[3]), 'タブ2');
  assert.strictEqual(normalizeForComparison(asc[4]), 'タブ10');
  assert.strictEqual(normalizeForComparison(asc[5]), 'タブ20');
  console.log('✓ Test 1 Passed: 自然順および全角文字が正しくソートされました');
}

console.log('\n--- Test 2: URLソート機能のテスト（ドメイン優先 & パスの自然順） ---');
{
  const testTabs = [
    { id: 1, title: 'GitHub Repo 10', url: 'https://github.com/user/repo10' },
    { id: 2, title: 'GitHub Repo 2', url: 'https://github.com/user/repo2' },
    { id: 3, title: 'Amazon Top', url: 'https://www.amazon.co.jp/' },
    { id: 4, title: 'Google Search', url: 'https://google.com/search?q=test' },
    { id: 5, title: 'Google About', url: 'https://google.com/about' },
    { id: 6, title: 'Amazon Item', url: 'https://amazon.co.jp/dp/B000' }
  ];

  // URL昇順ソートの実行
  const sorted = [...testTabs].sort((a, b) => compareTabs(a, b, 'url', false, 'domain'));

  // ドメイン順: amazon.co.jp (www.除去で統一) -> github.com -> google.com
  // 1 & 2: amazon.co.jp (/dp/B000 -> /)
  assert.strictEqual(parseUrlForSort(sorted[0].url).host, 'amazon.co.jp');
  assert.strictEqual(parseUrlForSort(sorted[1].url).host, 'amazon.co.jp');

  // 3 & 4: github.com (パスの自然順: repo2 -> repo10)
  assert.strictEqual(sorted[2].url, 'https://github.com/user/repo2');
  assert.strictEqual(sorted[3].url, 'https://github.com/user/repo10');

  // 5 & 6: google.com (/about -> /search)
  assert.strictEqual(sorted[4].url, 'https://google.com/about');
  assert.strictEqual(sorted[5].url, 'https://google.com/search?q=test');

  console.log('✓ Test 2 Passed: ドメイン優先かつパスの自然順でURLが正しくソートされました');
}

console.log('\n--- Test 3: タブグループの中身と配置の完全検証 ---');
{
  // 仮想タブストリップ
  let tabs = [
    { id: 1, title: 'タブ10', groupId: -1, pinned: false, index: 0 },
    { id: 2, title: 'タブ2', groupId: -1, pinned: false, index: 1 },
    { id: 3, title: 'グループB-タブ10', groupId: 200, pinned: false, index: 2 },
    { id: 4, title: 'グループB-タブ2', groupId: 200, pinned: false, index: 3 },
    { id: 5, title: 'グループA-タブ2', groupId: 100, pinned: false, index: 4 },
    { id: 6, title: 'グループA-タブ1', groupId: 100, pinned: false, index: 5 },
  ];
  const groups = [
    { id: 200, title: 'プロジェクトB' },
    { id: 100, title: 'プロジェクトA' }
  ];

  function moveTab(tabId, targetIndex) {
    const idx = tabs.findIndex(t => t.id === tabId);
    const [t] = tabs.splice(idx, 1);
    if (targetIndex >= tabs.length) tabs.push(t);
    else tabs.splice(targetIndex, 0, t);
    tabs.forEach((item, i) => { item.index = i; });
  }

  function moveGroupToEnd(groupId) {
    const gTabs = tabs.filter(t => t.groupId === groupId);
    tabs = tabs.filter(t => t.groupId !== groupId);
    tabs.push(...gTabs);
    tabs.forEach((item, i) => { item.index = i; });
  }

  // 昇順シミュレーション実行
  const ungrouped = tabs.filter(t => t.groupId < 0).sort((a, b) => compareTabs(a, b, 'title', false));
  ungrouped.forEach((t, i) => moveTab(t.id, i));

  const sortedG = [...groups].sort((a, b) => compareGroups(a, b, false));
  for (const g of sortedG) {
    moveGroupToEnd(g.id);
  }
  for (const g of sortedG) {
    const gTabs = tabs.filter(t => t.groupId === g.id).sort((a, b) => compareTabs(a, b, 'title', false));
    let tIdx = Math.min(...gTabs.map(t => t.index));
    for (const t of gTabs) {
      moveTab(t.id, tIdx);
      tIdx++;
    }
  }

  console.log('昇順結果:', tabs.map(t => `${t.title} [Grp:${t.groupId}]`));
  assert.strictEqual(tabs[0].title, 'タブ2');
  assert.strictEqual(tabs[1].title, 'タブ10');
  assert.strictEqual(tabs[2].title, 'グループA-タブ1');
  assert.strictEqual(tabs[3].title, 'グループA-タブ2');
  assert.strictEqual(tabs[4].title, 'グループB-タブ2');
  assert.strictEqual(tabs[5].title, 'グループB-タブ10');
  console.log('✓ Test 3 Passed: グループ外タブのソートおよびグループ末尾配置・グループ内ソートが正常に動作');
}

console.log('\n--- Test 4: 同一ドメインでのタブグループ自動作成機能の検証 ---');
{
  // 仮想タブストリップ
  let tabs = [
    { id: 1, title: 'Google Search 1', url: 'https://www.google.com/search?q=1', groupId: -1, pinned: false },
    { id: 2, title: 'GitHub Repo A', url: 'https://github.com/repoA', groupId: -1, pinned: false },
    { id: 3, title: '既存グループ タブ1', url: 'https://www.google.com/search?q=exist', groupId: 99, pinned: false },
    { id: 4, title: 'Google Search 2', url: 'https://google.com/search?q=2', groupId: -1, pinned: false },
    { id: 5, title: '単独タブ (Amazon)', url: 'https://www.amazon.co.jp/', groupId: -1, pinned: false },
    { id: 6, title: 'GitHub Repo B', url: 'https://github.com/repoB', groupId: -1, pinned: false },
    { id: 7, title: 'Google Search 3', url: 'https://google.com/search?q=3', groupId: -1, pinned: false }
  ];

  function isUngrouped(t) {
    return !t.pinned && (t.groupId === undefined || t.groupId === null || t.groupId < 0);
  }

  // 1. 未所属タブをドメインごとに集約
  const domainTabsMap = new Map();
  for (const tab of tabs) {
    if (isUngrouped(tab)) {
      const domain = parseUrlForSort(tab.url).host;
      if (domain) {
        if (!domainTabsMap.has(domain)) {
          domainTabsMap.set(domain, []);
        }
        domainTabsMap.get(domain).push(tab);
      }
    }
  }

  // 2. 2つ以上ある同一ドメインのみをグループ化対象とする
  const targetDomainMap = new Map();
  for (const [domain, dTabs] of domainTabsMap.entries()) {
    if (dTabs.length >= 2) {
      targetDomainMap.set(domain, dTabs);
    }
  }

  // 3. 理想の最終並び順およびグループ作成情報を構築
  const groupsToCreate = [];
  const handledDomains = new Set();
  const finalTabs = [];
  let nextGid = 1000;
  const tabToGroupIdMap = new Map();
  const groupTitles = new Map();

  for (let i = 0; i < tabs.length; i++) {
    const tab = tabs[i];
    if (isUngrouped(tab)) {
      const domain = parseUrlForSort(tab.url).host;
      if (targetDomainMap.has(domain)) {
        if (!handledDomains.has(domain)) {
          handledDomains.add(domain);
          const dTabs = targetDomainMap.get(domain);
          const gid = nextGid++;
          groupTitles.set(gid, domain);
          groupsToCreate.push({
            domain,
            groupId: gid,
            tabs: dTabs,
            firstIndex: i
          });
          for (const dt of dTabs) {
            tabToGroupIdMap.set(dt.id, gid);
            finalTabs.push({ ...dt, groupId: gid });
          }
        }
        continue;
      }
    }
    finalTabs.push(tab);
  }

  // 4. 移動シミュレーション
  // 各タブの groupId を更新
  for (const t of tabs) {
    if (tabToGroupIdMap.has(t.id)) {
      t.groupId = tabToGroupIdMap.get(t.id);
    }
  }

  // アイテム列構築
  const items = [];
  let currentItem = null;
  for (const tab of finalTabs) {
    const isGrouped = tab.groupId >= 0;
    if (isGrouped) {
      if (!currentItem || currentItem.type !== 'group' || currentItem.groupId !== tab.groupId) {
        currentItem = { type: 'group', groupId: tab.groupId, tabIds: [tab.id] };
        items.push(currentItem);
      } else {
        currentItem.tabIds.push(tab.id);
      }
    } else {
      currentItem = { type: 'tab', tabId: tab.id, tabIds: [tab.id] };
      items.push(currentItem);
    }
  }

  function moveTab(tabId, targetIndex) {
    const idx = tabs.findIndex(t => t.id === tabId);
    const [t] = tabs.splice(idx, 1);
    tabs.splice(targetIndex, 0, t);
  }

  function moveGroup(groupId, targetIndex) {
    const gTabs = tabs.filter(t => t.groupId === groupId);
    tabs = tabs.filter(t => t.groupId !== groupId);
    tabs.splice(targetIndex, 0, ...gTabs);
  }

  let currentIndex = 0;
  for (const item of items) {
    if (item.type === 'group') {
      moveGroup(item.groupId, currentIndex);
      currentIndex += item.tabIds.length;
    } else {
      moveTab(item.tabId, currentIndex);
      currentIndex += 1;
    }
  }

  console.log('グループ化後:', tabs.map(t => `${t.title} [Grp:${t.groupId}(${groupTitles.get(t.groupId) || '既存'})]`));

  // 検証 1: 既存グループ (id: 3) は勝手に別グループ化されず維持されていること
  assert.strictEqual(tabs.find(t => t.id === 3).groupId, 99);

  // 検証 2: 単独タブ (Amazon id: 5) はグループ化されていないこと (groupId: -1)
  assert.strictEqual(tabs.find(t => t.id === 5).groupId, -1);

  // 検証 3: 作成されたグループ名はドメイン名（'www.' 除去済み）であること
  const googleGrpId = tabs.find(t => t.id === 1).groupId;
  const githubGrpId = tabs.find(t => t.id === 2).groupId;
  assert.strictEqual(groupTitles.get(googleGrpId), 'google.com');
  assert.strictEqual(groupTitles.get(githubGrpId), 'github.com');

  // 検証 4: タブグループの位置はそのタブグループに所属するタブの中で一番先頭にあった位置
  // google.com グループが先頭 (index 0, 1, 2)
  assert.strictEqual(tabs[0].id, 1);
  assert.strictEqual(tabs[1].id, 4);
  assert.strictEqual(tabs[2].id, 7);
  assert.strictEqual(tabs[0].groupId, googleGrpId);
  assert.strictEqual(tabs[1].groupId, googleGrpId);
  assert.strictEqual(tabs[2].groupId, googleGrpId);

  // github.com グループが次 (index 3, 4)
  assert.strictEqual(tabs[3].id, 2);
  assert.strictEqual(tabs[4].id, 6);
  assert.strictEqual(tabs[3].groupId, githubGrpId);
  assert.strictEqual(tabs[4].groupId, githubGrpId);

  // 検証 5: グループ内の並びが実行前の並び順（元の順序）のままであること
  // Google: id 1 -> id 4 -> id 7
  // GitHub: id 2 -> id 6
  // (上記のアサートで確認済み)

  console.log('✓ Test 4 Passed: 同一ドメインタブグループ自動作成（未所属のみ・先頭位置・順序維持・ドメイン名）が正常に動作');
}

console.log('\n=============================');
console.log('ALL TEST CASES PASSED! 🎉');
console.log('=============================');
