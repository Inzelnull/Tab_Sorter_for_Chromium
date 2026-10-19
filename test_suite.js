const assert = require('assert');

// Collator & Normalizer
const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
function normalizeForComparison(str) {
  if (typeof str !== 'string') return '';
  return str.normalize('NFKC').trim();
}
function compareStrings(a, b, descending = false) {
  const normA = normalizeForComparison(a);
  const normB = normalizeForComparison(b);
  let res = collator.compare(normA, normB);
  if (res === 0) res = (a || '').localeCompare(b || '', undefined, { numeric: true });
  return descending ? -res : res;
}
function compareTabs(tabA, tabB, descending = false) {
  let res = compareStrings(tabA.title, tabB.title, descending);
  if (res === 0) res = compareStrings(tabA.url, tabB.url, descending);
  if (res === 0) res = descending ? (tabB.id - tabA.id) : (tabA.id - tabB.id);
  return res;
}
function compareGroups(groupA, groupB, descending = false) {
  let res = compareStrings(groupA.title, groupB.title, descending);
  if (res === 0) res = descending ? (groupB.id - groupA.id) : (groupA.id - groupB.id);
  return res;
}

console.log('--- Test 1: 自然順ソート（1, 2, 10）および全角数字のテスト ---');
{
  const input = ['タブ10', 'タブ2', 'タブ1', 'タブ２０', 'タブ１', 'タブ２'];
  const asc = [...input].sort((a, b) => compareStrings(a, b, false));
  assert.strictEqual(normalizeForComparison(asc[0]), 'タブ1');
  assert.strictEqual(normalizeForComparison(asc[1]), 'タブ1');
  assert.strictEqual(normalizeForComparison(asc[2]), 'タブ2');
  assert.strictEqual(normalizeForComparison(asc[3]), 'タブ2');
  assert.strictEqual(normalizeForComparison(asc[4]), 'タブ10');
  assert.strictEqual(normalizeForComparison(asc[5]), 'タブ20');
  console.log('✓ Test 1 Passed');
}

console.log('--- Test 2: タブグループの中身と配置の完全検証 ---');
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
  const ungrouped = tabs.filter(t => t.groupId < 0).sort((a, b) => compareTabs(a, b, false));
  ungrouped.forEach((t, i) => moveTab(t.id, i));

  const sortedG = [...groups].sort((a, b) => compareGroups(a, b, false));
  for (const g of sortedG) {
    moveGroupToEnd(g.id);
  }
  for (const g of sortedG) {
    const gTabs = tabs.filter(t => t.groupId === g.id).sort((a, b) => compareTabs(a, b, false));
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
  console.log('✓ Test 2 Passed');
}

console.log('\n=============================');
console.log('ALL TEST CASES PASSED! 🎉');
console.log('=============================');
