const $ = (id) => document.getElementById(id);
const appState = { quotes: [], currentId: '', priorityId: '', settings: {}, lastRotationDate: '', isPackaged: false, appVersion: '', updateConfigured: false };
const dateKey = () => new Date().toISOString().slice(0, 10);
let toastTimer;
let quoteEditingId = '';
let selectedSku = '';
const expandedPackIds = new Set();

const quotePacks = [
  {
    id: 'nietzsche', author: '尼采', work: '《偶像的黄昏》',
    quotes: [
      { text: '未能将我击碎的事，也在锻造我。', source: '《偶像的黄昏》· 箴言与箭 8', locked: false },
      { text: '一个深邃的思想，也愿意化作一句箴言。', source: '编辑转述示例，非原文引句', locked: false },
      { text: '你心中须有混沌，才能诞生一颗跳舞的星。', source: '《查拉图斯特拉如是说》· 序言 5', locked: true },
      { text: '人应当成为自己，而不是安于既定的模样。', source: '据《查拉图斯特拉如是说》思想转述', locked: true }
    ]
  },
  {
    id: 'kant', author: '康德', work: '《答复这个问题：什么是启蒙？》',
    quotes: [
      { text: '要有勇气运用你自己的理智。', source: '《答复这个问题：什么是启蒙？》', locked: false },
      { text: '思想若没有内容便空，直观若没有概念便盲。', source: '《纯粹理性批判》· A51/B75', locked: false },
      { text: '自由，是不受他人任意选择支配的权利。', source: '据《道德形而上学》思想转译', locked: true },
      { text: '对待每一个人，都要同时把他看作目的。', source: '据《道德形而上学奠基》思想转译', locked: true }
    ]
  },
  {
    id: 'wittgenstein', author: '维特根斯坦', work: '《逻辑哲学论》',
    quotes: [
      { text: '哲学不是一套学说，而是一种活动。', source: '《逻辑哲学论》· 4.112', locked: false },
      { text: '我的语言的边界，就是我的世界的边界。', source: '《逻辑哲学论》· 5.6', locked: false },
      { text: '世界是事实的总和，而不是事物的总和。', source: '《逻辑哲学论》· 1.1', locked: true },
      { text: '对于不可说的东西，我们必须保持沉默。', source: '《逻辑哲学论》· 7', locked: true }
    ]
  },
  {
    id: 'beauvoir', author: '西蒙娜·德·波伏瓦', work: '《第二性》· 思想转述示例',
    quotes: [
      { text: '女性的处境并非先天命定，也由制度与日常生活塑造。', source: '编辑转述示例，非原文引句', locked: false },
      { text: '理解一个人，也要看她被允许成为什么。', source: '编辑转述示例，非原文引句', locked: false },
      { text: '自由不只关乎选择，也关乎选择是否真正可行。', source: '据《第二性》思想转述示例，非原文引句', locked: true },
      { text: '改变处境，需要看见它如何被建构。', source: '据《第二性》思想转述示例，非原文引句', locked: true }
    ]
  }
];

function renderClock() {
  const now = new Date();
  $('local-time').textContent = new Intl.DateTimeFormat('zh-Hans-CN', {
    hour: '2-digit', minute: '2-digit', hour12: false
  }).format(now);
  $('local-date').textContent = new Intl.DateTimeFormat('zh-Hans-CN', {
    month: 'numeric', day: 'numeric', weekday: 'short'
  }).format(now);
}

renderClock();
setInterval(renderClock, 15000);

function activeQuotes() {
  const today = dateKey();
  return appState.quotes.filter((q) => q.active && (!q.expiresAt || q.expiresAt >= today));
}

function currentQuote() {
  const quotes = activeQuotes();
  let current = quotes.find((q) => q.id === appState.currentId);
  if (!current && quotes.length) {
    current = quotes[Math.floor(Math.random() * quotes.length)];
    appState.currentId = current.id;
  }
  return current;
}

function priorityQuote() {
  const quotes = activeQuotes();
  return quotes.find((q) => q.id === appState.priorityId) || currentQuote() || quotes[0];
}

async function save() {
  if (!window.xingqian?.saveState) return appState;
  const stored = await window.xingqian.saveState(appState);
  Object.assign(appState, stored);
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 1800);
}

function renderCard() {
  const quotes = activeQuotes();
  const quote = currentQuote();
  const priority = priorityQuote();
  $('active-count').textContent = quotes.length ? `${quotes.length} 句正在陪着你` : '留一席给重要的事';
  $('quote-text').textContent = quote ? quote.text : '写下一句，提醒自己什么最重要。';
  $('quote-source').textContent = quote?.source || '';
  $('quote-index').textContent = quote ? `${String(quotes.indexOf(quote) + 1).padStart(2, '0')} / ${String(quotes.length).padStart(2, '0')}` : '还没有收藏';
  $('next-quote').disabled = quotes.length < 2;
  $('next-quote').style.opacity = quotes.length < 2 ? '.42' : '1';
  $('pin-icon').textContent = appState.settings.alwaysOnTop ? '⌖' : '⌗';
  $('pin-label').textContent = appState.settings.alwaysOnTop ? '置顶中' : '已取消置顶';
  $('compact-quote').textContent = priority ? priority.text : '写下一句最想记住的话';
  $('compact-view').title = priority ? `最高优先级：${priority.text}（点击展开）` : '点击展开醒签卡片';
}

function renderList() {
  const list = $('quote-list');
  list.replaceChildren();
  if (!appState.quotes.length) {
    const empty = document.createElement('div');
    empty.className = 'list-empty';
    empty.textContent = '还没有收藏的话，从下面添加第一句。';
    list.append(empty);
    return;
  }
  appState.quotes.forEach((quote) => {
    const row = document.createElement('div');
    row.className = 'list-item';
    const radio = document.createElement('input');
    radio.type = 'radio'; radio.name = 'current-quote'; radio.className = 'list-select';
    radio.checked = quote.id === appState.currentId;
    radio.setAttribute('aria-label', '设为当前提醒');
    radio.disabled = Boolean(quote.expiresAt && quote.expiresAt < dateKey());
    radio.addEventListener('change', async () => { appState.currentId = quote.id; await save(); render(); toast('已设为当前提醒'); });
    const copy = document.createElement('div'); copy.className = 'list-copy';
    const text = document.createElement('div'); text.className = 'list-text'; text.textContent = quote.text;
    const meta = document.createElement('div'); meta.className = 'list-meta';
    const expired = quote.expiresAt && quote.expiresAt < dateKey();
    meta.textContent = expired ? '已过期' : (quote.source || (quote.expiresAt ? `提醒至 ${quote.expiresAt.replaceAll('-', '.')}` : '长期保留'));
    copy.append(text, meta);
    const actions = document.createElement('div'); actions.className = 'item-actions';
    const priority = document.createElement('button'); priority.className = `priority-button${quote.id === appState.priorityId ? ' is-priority' : ''}`;
    priority.type = 'button'; priority.textContent = quote.id === appState.priorityId ? '★' : '☆';
    priority.title = quote.id === appState.priorityId ? '当前最高优先级' : '设为最高优先级';
    priority.setAttribute('aria-label', priority.title);
    priority.disabled = Boolean(quote.expiresAt && quote.expiresAt < dateKey());
    priority.addEventListener('click', async () => {
      appState.priorityId = quote.id;
      await save(); render(); toast('已设为最高优先级');
    });
    const edit = document.createElement('button'); edit.className = 'edit-button'; edit.type = 'button'; edit.textContent = '编辑'; edit.title = '编辑这句话';
    edit.addEventListener('click', () => {
      quoteEditingId = quote.id;
      $('quote-input').value = quote.text;
      $('source-input').value = quote.source || '';
      $('expiry-input').value = quote.expiresAt ? String(Math.max(1, Math.round((new Date(quote.expiresAt) - new Date()) / (30 * 86400000)))) : '';
      $('quote-form').querySelector('[type="submit"]').firstChild.textContent = '保存修改 ';
      $('cancel-edit').classList.remove('hidden');
      $('quote-input').focus();
    });
    const remove = document.createElement('button'); remove.className = 'delete-button'; remove.type = 'button'; remove.textContent = '×'; remove.title = '删除这句话';
    remove.addEventListener('click', async () => {
      appState.quotes = appState.quotes.filter((q) => q.id !== quote.id);
      if (appState.currentId === quote.id) appState.currentId = activeQuotes()[0]?.id || '';
      if (appState.priorityId === quote.id) appState.priorityId = activeQuotes()[0]?.id || '';
      await save(); render(); toast('这句话已删除');
    });
    actions.append(priority, edit, remove);
    row.append(radio, copy, actions); list.append(row);
  });
}

function renderQuotePacks() {
  const list = $('quote-pack-list');
  if (!list) return;
  list.replaceChildren();
  quotePacks.forEach((pack) => {
    const expanded = expandedPackIds.has(pack.id);
    const card = document.createElement('article');
    card.className = `quote-pack-card${expanded ? ' is-expanded' : ''}`;

    const header = document.createElement('button');
    header.type = 'button';
    header.className = 'quote-pack-header';
    header.setAttribute('aria-expanded', String(expanded));
    header.setAttribute('aria-controls', `pack-quotes-${pack.id}`);
    const author = document.createElement('span');
    author.className = 'quote-pack-author';
    author.textContent = pack.author;
    const preview = document.createElement('span');
    preview.className = 'quote-pack-preview';
    preview.textContent = pack.quotes[0].text;
    const arrow = document.createElement('span');
    arrow.className = 'quote-pack-chevron';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = expanded ? '⌃' : '⌄';
    header.append(author, preview, arrow);
    header.addEventListener('click', () => {
      if (expanded) expandedPackIds.delete(pack.id);
      else expandedPackIds.add(pack.id);
      renderQuotePacks();
    });
    card.append(header);

    if (expanded) {
      const entries = document.createElement('div');
      entries.className = 'quote-pack-entries';
      entries.id = `pack-quotes-${pack.id}`;
      pack.quotes.forEach((item) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `pack-quote${item.locked ? ' is-muted' : ''}`;
        button.setAttribute('aria-label', item.locked ? `解锁：${item.text}` : `收进我的话：${item.text}`);
        const text = document.createElement('span');
        text.className = 'pack-quote-text';
        text.textContent = item.text;
        const source = document.createElement('small');
        source.className = 'pack-quote-source';
        source.textContent = item.source;
        button.append(text, source);
        button.addEventListener('click', () => {
          if (item.locked) {
            openUnlockShelf(`${pack.author}的语录包`, 'pack');
            return;
          }
          const sourceLabel = `${pack.author} · ${item.source}`;
          let quote = appState.quotes.find((saved) => saved.text === item.text && saved.source === sourceLabel);
          if (!quote) {
            quote = { id: crypto.randomUUID(), text: item.text, source: sourceLabel, createdAt: new Date().toISOString(), expiresAt: '', active: true };
            appState.quotes.unshift(quote);
          }
          appState.currentId = quote.id;
          save().then(() => {
            render();
            toast('已收进你的话');
          });
        });
        entries.append(button);
      });
      card.append(entries);
    }
    list.append(card);
  });
}

function render() {
  renderCard();
  renderList();
  renderQuotePacks();
  $('always-top').checked = Boolean(appState.settings.alwaysOnTop);
  $('login-start').checked = Boolean(appState.settings.openAtLogin);
  $('login-start').disabled = !appState.isPackaged;
  $('login-start').title = appState.isPackaged ? '' : '请安装打包版本后设置登录启动';
  $('check-updates').disabled = !appState.updateConfigured;
  $('check-updates').title = appState.updateConfigured ? '' : '此安装包还没有连接线上更新源';
  $('update-status').textContent = appState.updateConfigured
    ? `版本 ${appState.appVersion} · 启动时自动检查`
    : (appState.isPackaged ? '尚未连接线上更新源' : '安装包发布并连接更新源后可用');
}

function showUpdateStatus(status) {
  const label = $('update-status');
  if (!label || !status) return;
  const messages = {
    checking: '正在检查更新…',
    available: `发现新版本 ${status.version}，正在下载…`,
    current: `已是最新版本（${status.version}）`,
    progress: `正在下载更新 ${status.percent}%`,
    downloaded: `新版本 ${status.version} 已下载，退出醒签时安装`,
    error: '暂时无法检查更新，请稍后重试'
  };
  label.textContent = messages[status.type] || label.textContent;
  if (status.type === 'downloaded') toast('更新已下载，退出醒签时会自动安装');
}

function showView(view) {
  const managing = view === 'manage';
  $('card-view').classList.toggle('hidden', managing);
  $('manage-view').classList.toggle('hidden', !managing);
  window.xingqian?.resize?.(managing ? 'manage' : 'card');
}

function cancelEdit() {
  quoteEditingId = '';
  $('quote-form').reset();
  $('expiry-input').value = '6';
  $('quote-form').querySelector('[type="submit"]').firstChild.textContent = '保存这句话 ';
  $('cancel-edit').classList.add('hidden');
}

function switchManagerTab(name) {
  document.querySelectorAll('[data-manager-tab]').forEach((tab) => {
    const active = tab.dataset.managerTab === name;
    tab.classList.toggle('is-active', active);
    tab.setAttribute('aria-selected', String(active));
  });
  document.querySelectorAll('[data-manager-pane]').forEach((pane) => {
    pane.classList.toggle('hidden', pane.dataset.managerPane !== name);
  });
}

function openUnlockShelf(title, kind) {
  $('shelf-title').textContent = `解锁${title}`;
  $('shelf-description').textContent = kind === 'theme'
    ? '这款卡片外观属于醒签会员内容。选择一个方案继续。'
    : '这个完整语录包属于醒签会员内容。选择一个方案继续。';
  selectedSku = '';
  document.querySelectorAll('[name="selected-sku"]').forEach((radio) => { radio.checked = false; });
  $('purchase-sku').disabled = true;
  $('purchase-sku').textContent = '先选择一个方案';
  $('shelf-plans').classList.remove('hidden');
  $('shelf-payment').classList.add('hidden');
  $('unlock-shelf').classList.remove('hidden');
}

document.querySelectorAll('[data-manager-tab]').forEach((tab) => {
  tab.addEventListener('click', () => switchManagerTab(tab.dataset.managerTab));
});
$('toggle-themes').addEventListener('click', () => {
  const expanded = $('toggle-themes').getAttribute('aria-expanded') === 'true';
  $('toggle-themes').setAttribute('aria-expanded', String(!expanded));
  $('theme-picker').classList.toggle('hidden', expanded);
});
document.querySelectorAll('[data-theme-option]').forEach((button) => {
  button.addEventListener('click', () => {
    if (button.dataset.themeOption !== 'paper') {
      openUnlockShelf(`${button.querySelector('span:last-child').textContent.replace('⌑', '').trim()}主题`, 'theme');
      return;
    }
    document.querySelectorAll('[data-theme-option]').forEach((item) => item.classList.toggle('is-selected', item === button));
    $('current-theme-name').textContent = '纸笺';
    toast('已使用纸笺外观');
  });
});
document.querySelectorAll('[name="selected-sku"]').forEach((radio) => {
  radio.addEventListener('change', () => {
    selectedSku = radio.value;
    $('purchase-sku').disabled = false;
    $('purchase-sku').textContent = selectedSku === 'annual' ? '购买年卡 · ¥15 / 年' : '购买终身会员 · ¥20';
  });
});
$('purchase-sku').addEventListener('click', () => {
  if (!selectedSku) return;
  $('payment-plan-label').textContent = selectedSku === 'annual' ? '年卡 · ¥15 / 年' : '终身会员 · ¥20 一次';
  $('shelf-plans').classList.add('hidden');
  $('shelf-payment').classList.remove('hidden');
});
$('back-to-plans').addEventListener('click', () => {
  $('shelf-payment').classList.add('hidden');
  $('shelf-plans').classList.remove('hidden');
});
$('close-shelf').addEventListener('click', () => $('unlock-shelf').classList.add('hidden'));
$('unlock-shelf').addEventListener('click', (event) => {
  if (event.target === $('unlock-shelf')) $('unlock-shelf').classList.add('hidden');
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') $('unlock-shelf').classList.add('hidden');
});

$('manage').addEventListener('click', () => { switchManagerTab('quotes'); showView('manage'); });
$('back').addEventListener('click', () => { cancelEdit(); showView('card'); });
$('minimize').addEventListener('click', () => window.xingqian?.resize?.('compact'));
$('quit').addEventListener('click', () => window.xingqian?.quit?.());
$('compact-view').addEventListener('click', () => window.xingqian?.show?.());
$('next-quote').addEventListener('click', async () => {
  const quotes = activeQuotes();
  if (quotes.length < 2) return;
  const candidates = quotes.filter((q) => q.id !== appState.currentId);
  appState.currentId = candidates[Math.floor(Math.random() * candidates.length)].id;
  await save(); renderCard();
});
$('pin-toggle').addEventListener('click', async () => {
  appState.settings.alwaysOnTop = !appState.settings.alwaysOnTop;
  await save(); renderCard(); toast(appState.settings.alwaysOnTop ? '卡片会留在最前面' : '已关闭始终置顶');
});
$('quote-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const text = $('quote-input').value.trim();
  if (!text) return;
  const months = $('expiry-input').value;
  const expiresAt = months ? (() => { const date = new Date(); date.setMonth(date.getMonth() + Number(months)); return date.toISOString().slice(0, 10); })() : '';
  if (quoteEditingId) {
    const target = appState.quotes.find((q) => q.id === quoteEditingId);
    if (target) Object.assign(target, { text, source: $('source-input').value.trim(), expiresAt });
    appState.currentId = quoteEditingId;
  } else {
    const quote = { id: crypto.randomUUID(), text, source: $('source-input').value.trim(), createdAt: new Date().toISOString(), expiresAt, active: true };
    appState.quotes.unshift(quote); appState.currentId = quote.id;
  }
  await save(); $('quote-form').reset(); $('expiry-input').value = '6';
  quoteEditingId = ''; $('quote-form').querySelector('[type="submit"]').firstChild.textContent = '保存这句话 ';
  $('cancel-edit').classList.add('hidden'); render(); toast('已放进你的醒签');
});
$('cancel-edit').addEventListener('click', cancelEdit);
$('always-top').addEventListener('change', async (event) => { appState.settings.alwaysOnTop = event.target.checked; await save(); renderCard(); });
$('login-start').addEventListener('change', async (event) => { appState.settings.openAtLogin = event.target.checked; await save(); toast(event.target.checked ? '已设为登录时显示' : '已关闭登录时启动'); });
$('check-updates').addEventListener('click', async () => {
  $('check-updates').disabled = true;
  showUpdateStatus({ type: 'checking' });
  const result = await window.xingqian.checkForUpdates();
  if (result.status === 'not-configured') showUpdateStatus({ type: 'error' });
  $('check-updates').disabled = !appState.updateConfigured;
});
window.xingqian?.onWindowMode?.((mode) => document.body.classList.toggle('compact', mode === 'compact'));
window.xingqian?.onUpdateStatus?.(showUpdateStatus);

(async () => {
  if (window.xingqian?.getState) {
    const stored = await window.xingqian.getState();
    Object.assign(appState, stored);
    if (!appState.priorityId || !appState.quotes.some((q) => q.id === appState.priorityId)) {
      appState.priorityId = appState.currentId || activeQuotes()[0]?.id || '';
    }
    const today = dateKey();
    if (appState.lastRotationDate && appState.lastRotationDate !== today) {
      const quotes = activeQuotes();
      if (quotes.length > 1) appState.currentId = quotes[Math.floor(Math.random() * quotes.length)].id;
    }
    appState.lastRotationDate = today;
    await save();
  }
  render();
})();

