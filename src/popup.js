const HINTS = {
  smart: 'Blocks tabs, popups and redirects that ad scripts trigger. New tabs you open yourself still work, and so do payment pages that hand you off to your bank a few seconds after you click.',
  strict: 'Maximum protection: no script may open a tab, and once you have used a page no script may send it to another site. Only links you click yourself can open a new tab or leave the site.',
  off: 'PopShield does nothing on this site.',
};
const KINDS = {
  popup: 'Popup / new tab',
  'new-tab': 'New tab closed',
  'overlay-link': 'Invisible ad layer',
  'scripted-link': 'Scripted link',
  'scripted-form': 'Scripted form',
  redirect: 'Redirect hijack',
};
const REASONS = {
  'page-wide-listener': 'opened by a page-wide click hook',
  'invisible-overlay': 'click landed on an invisible overlay',
  'no-gesture': 'not caused by your click',
  'non-activating-event': 'fired on mouse-down, not a real click',
  'strict-mode': 'strict mode',
  'no-user-intent': 'you did not ask for it',
  'embedded-frame': 'an embedded frame tried to take over the tab',
  'ad-layer': 'click landed on an ad layer stacked over the page',
  'ad-box-frame': 'link inside an ad box pinned over the page',
  'tab-under': 'opened this page again and tried to turn this tab into an ad',
  'popup-hijack': 'a popup was sent to another site before you used it',
  'redirect-chain': 'went through a redirect that ended on an unrelated site',
  'form-swapped': 'the button you pressed was re-wired to submit an ad form',
  'non-interactive-listener': 'opened by a script on something that isn\'t a button or link',
  'link-swapped': 'a script swapped the link you clicked for an ad; the real link was opened instead',
};

const $ = (s) => document.querySelector(s);

// ---- reporting: opens a pre-filled GitHub issue / discussion in a new tab.
// The details are in the github.com address, so GitHub receives them when the
// tab opens; the user confirms first and nothing is public unless they submit.
const REPO = 'https://github.com/madironman/popshield';
function chromeVersion() {
  const m = navigator.userAgent.match(/Chrome\/([\d.]+)/);
  return m ? m[1] : '';
}
// Page address without query string or #fragment (they can hold personal tokens).
function cleanUrl(u) {
  try { const x = new URL(u); return x.origin + x.pathname; } catch { return ''; }
}
function hostOf(u) { try { return new URL(u).hostname; } catch { return ''; } }
function logSummary(items) {
  if (!items.length) return 'empty';
  return items.slice(0, 15).map((i) => `- ${i.kind} / ${i.reason}${hostOf(i.url) ? ' -> ' + hostOf(i.url) : ''}`).join('\n');
}
function openIssue(template, fields) {
  const q = new URLSearchParams({ template, ...fields });
  // Keep well under URL length limits.
  let url = `${REPO}/issues/new?${q}`;
  if (url.length > 7000) { q.delete('blocked-log'); url = `${REPO}/issues/new?${q}`; }
  chrome.tabs.create({ url });
}

// ---- lifetime stats (stored only on this device; never which sites)
const nf = new Intl.NumberFormat();
async function renderStats() {
  const { stats } = await chrome.storage.local.get({ stats: null });
  const st = stats || { total: 0, since: Date.now(), days: {} };
  $('#total').textContent = nf.format(st.total || 0);
  $('#total-label').textContent = (st.total === 1 ? 'popup' : 'popups') + ' & redirects blocked';
  const today = new Date().toLocaleDateString('en-CA');
  const todayN = (st.days || {})[today] || 0;
  const sinceStr = new Date(st.since || Date.now()).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  $('#since').textContent = `since ${sinceStr} · ${nf.format(todayN)} today`;
  // 14-day sparkline
  const spark = $('#spark');
  spark.textContent = '';
  const vals = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    vals.push([d.toLocaleDateString('en-CA'), (st.days || {})[d.toLocaleDateString('en-CA')] || 0]);
  }
  const max = Math.max(1, ...vals.map((v) => v[1]));
  for (const [day, n] of vals) {
    const bar = document.createElement('i');
    bar.style.height = Math.max(4, Math.round((n / max) * 100)) + '%';
    bar.title = `${day}: ${n}`;
    if (day === today) bar.className = 'today';
    spark.append(bar);
  }
  return st;
}
function setupStats() {
  $('#reset-stats').onclick = async (e) => {
    e.preventDefault();
    if (!confirm('Reset the lifetime counter on this device?')) return;
    await chrome.storage.local.set({ stats: { total: 0, since: Date.now(), days: {}, kinds: {} } });
    renderStats();
  };
  chrome.storage.onChanged.addListener((c, area) => { if (area === 'local' && c.stats) renderStats(); });
}

async function main() {
  renderStats();
  setupStats();
  // ?tab=<id> lets the popup be opened as a normal page (used by the UI test).
  const forced = Number(new URLSearchParams(location.search).get('tab'));
  const [tab] = forced ? [await chrome.tabs.get(forced)] : await chrome.tabs.query({ active: true, currentWindow: true });
  const site = tab && PS.siteOfUrl(tab.url || '');
  const settings = await PS.getSettings();
  $('#default').value = settings.defaultMode;
  $('#default').onchange = (e) => PS.setDefaultMode(e.target.value).then(renderMode);

  $('#feedback').onclick = (e) => { e.preventDefault(); chrome.tabs.create({ url: `${REPO}/discussions/new?category=ideas` }); };

  if (!site) {
    $('#main').innerHTML = '<div class="disabled">PopShield only works on regular web pages (http and https).</div>';
    return;
  }
  $('#site').textContent = site;

  async function renderMode() {
    const mode = await PS.getMode(site, tab.incognito);
    document.querySelectorAll('.seg button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
    $('#hint').textContent = HINTS[mode];
  }
  document.querySelectorAll('.seg button').forEach((b) => {
    b.onclick = async () => {
      const s = await PS.getSettings();
      // Picking the default mode again removes the per-site override.
      await PS.setSiteMode(site, b.dataset.mode === s.defaultMode ? null : b.dataset.mode, tab.incognito);
      renderMode();
    };
  });
  renderMode();

  async function renderLog() {
    const key = 'log:' + tab.id;
    const ckey = 'count:' + tab.id;
    const data = await chrome.storage.session.get({ [key]: [], [ckey]: 0 });
    $('#count').textContent = data[ckey] ? data[ckey] + ' blocked' : '';
    const ul = $('#log');
    ul.textContent = '';
    if (!data[key].length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Nothing blocked yet.';
      ul.append(li);
      return;
    }
    for (const item of data[key]) {
      const li = document.createElement('li');
      const info = document.createElement('div');
      info.className = 'info';
      const k = document.createElement('div');
      k.className = 'kind';
      k.textContent = KINDS[item.kind] || 'Blocked';
      const r = document.createElement('div');
      r.className = 'reason';
      r.textContent = REASONS[item.reason] || '';
      const u = document.createElement('div');
      u.className = 'url';
      u.textContent = item.url || (item.source ? 'from frame ' + item.source : '');
      u.title = u.textContent;
      info.append(k, r, u);
      li.append(info);
      if (/^https?:/.test(item.url)) {
        const btn = document.createElement('button');
        btn.textContent = 'Open';
        btn.title = 'Open this one anyway';
        btn.onclick = () => chrome.tabs.create({ url: item.url, index: tab.index + 1 });
        li.append(btn);
      }
      ul.append(li);
    }
  }
  renderLog();
  chrome.storage.onChanged.addListener((c, area) => { if (area === 'session') renderLog(); });

  async function report(template) {
    const items = (await chrome.storage.session.get({ ['log:' + tab.id]: [] }))['log:' + tab.id];
    const mode = await PS.getMode(site, tab.incognito);
    const common = {
      url: cleanUrl(tab.url),
      mode: mode === 'off' ? 'Off' : mode[0].toUpperCase() + mode.slice(1),
      'chrome-version': chromeVersion(),
      'popshield-version': chrome.runtime.getManifest().version,
      'blocked-log': logSummary(items),
    };
    const title = template === 'ad-got-through.yml' ? `[Ad got through]: ${site}` : `[False positive]: ${site}`;
    // Say exactly what will reach GitHub before opening anything.
    const ok = confirm(`This opens github.com with these details filled in:\n\n` +
      `• Page: ${common.url || site}\n• Mode: ${common.mode}\n• Chrome ${common['chrome-version']}, PopShield ${common['popshield-version']}\n` +
      `• What was blocked (types and ad hostnames)\n\nGitHub receives them as soon as the tab opens. ` +
      `Nothing becomes public unless you sign in and press Submit, and you can edit everything first.\n\nContinue to GitHub?`);
    if (!ok) return;
    openIssue(template, { title, ...common });
  }
  // Incognito: don't offer to send the address of a private-window page anywhere.
  if (tab.incognito) $('#report-section').hidden = true;
  $('#report-ad').onclick = () => report('ad-got-through.yml');
  $('#report-fp').onclick = () => report('false-positive.yml');
}
main();
