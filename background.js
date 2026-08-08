/* =======================================================================
 * Zabansaz Apex v4 — background.js (service worker)
 *
 * وظایف:
 *   - مقداردهی اولیه‌ی تنظیمات پیش‌فرض
 *   - ثبت content scriptها برای سایت‌های سفارشی (با اجازه‌ی کاربر)
 *   - همگام‌سازی پس از تغییر سایت‌ها یا حذف اجازه
 *
 * قابلیت جدید: پیام روی نصب/به‌روزرسانی (تب راهنما باز شود).
 * ===================================================================== */
const ZB_CUSTOM_SCRIPT_ID = 'zb-apex-custom-sites';
const ZB_CONTENT_FILES = ['cipher.js', 'engine.js', 'mobile.js'];

function getStore(keys) {
  return new Promise(function (resolve) {
    chrome.storage.local.get(keys, function (r) {
      resolve(r || {});
    });
  });
}

function setStore(obj) {
  return new Promise(function (resolve) {
    chrome.storage.local.set(obj, function () {
      resolve(!chrome.runtime.lastError);
    });
  });
}

async function setDefaults() {
  const r = await getStore([
    'zb_enabled',
    'zb_auto',
    'zb_lock',
    'zb_mobile_btn',
    'zb_mobile_send',
    'zb_hide_fab',
    'zb_mobile_pos',
    'zb_custom_sites',
    'zb_langs',
    'zb_active',
    'zb_first_run'
  ]);

  const patch = {};

  if (typeof r.zb_enabled === 'undefined') patch.zb_enabled = true;
  if (typeof r.zb_auto === 'undefined') patch.zb_auto = true;
  if (typeof r.zb_lock === 'undefined') patch.zb_lock = true;

  // دکمه رمزی موبایل پیش‌فرض خاموش است؛ کاربر باید خودش روشن کند.
  if (typeof r.zb_mobile_btn === 'undefined') patch.zb_mobile_btn = false;

  // اگر روشن باشد: رمز + تلاش برای ارسال
  // اگر خاموش باشد: فقط رمز می‌کند، خود کاربر دکمه Send سایت را می‌زند.
  if (typeof r.zb_mobile_send === 'undefined') patch.zb_mobile_send = true;

  // مخفی کردن دکمه شناور قدیمی engine.js
  if (typeof r.zb_hide_fab === 'undefined') patch.zb_hide_fab = false;

  // موقعیت دکمه موبایل
  if (typeof r.zb_mobile_pos === 'undefined') patch.zb_mobile_pos = null;

  // سایت‌های سفارشی
  if (!Array.isArray(r.zb_custom_sites)) patch.zb_custom_sites = [];

  // دفترچه زبان‌ها
  if (!Array.isArray(r.zb_langs)) patch.zb_langs = [];

  // زبان فعال
  if (typeof r.zb_active === 'undefined') patch.zb_active = '';

  if (typeof r.zb_first_run === 'undefined') patch.zb_first_run = true;

  if (Object.keys(patch).length) {
    await setStore(patch);
  }
}

async function syncCustomSites() {
  if (!chrome.scripting || !chrome.scripting.registerContentScripts) return;

  const r = await getStore(['zb_custom_sites']);
  const sites = Array.isArray(r.zb_custom_sites) ? r.zb_custom_sites : [];

  let matches = [];

  for (const site of sites) {
    if (site && site.enabled !== false && Array.isArray(site.matches)) {
      matches = matches.concat(site.matches);
    }
  }

  matches = [...new Set(matches)];

  const granted = [];

  for (const m of matches) {
    try {
      const has = await chrome.permissions.contains({ origins: [m] });
      if (has) granted.push(m);
    } catch (e) {}
  }

  try {
    await chrome.scripting.unregisterContentScripts({
      ids: [ZB_CUSTOM_SCRIPT_ID]
    });
  } catch (e) {}

  if (granted.length) {
    try {
      await chrome.scripting.registerContentScripts([
        {
          id: ZB_CUSTOM_SCRIPT_ID,
          matches: granted,
          js: ZB_CONTENT_FILES,
          runAt: 'document_idle',
          allFrames: false
        }
      ]);
    } catch (e) {
      console.warn('Zabansaz Apex: registerContentScripts failed', e);
    }
  }
}

// باز کردن صفحه راهنما هنگام نصب اولین‌بار (اولین toplevel onInstalled).
chrome.runtime.onInstalled.addListener(async function (details) {
  await setDefaults();
  await syncCustomSites();

  if (details.reason === 'install') {
    // باز کردن صفحه راهنما برای کاربر تازه
    try {
      if (chrome.runtime.openOptionsPage) {
        chrome.runtime.openOptionsPage();
      }
    } catch (e) {}
  }
});

chrome.runtime.onStartup.addListener(async function () {
  await syncCustomSites();
});

chrome.storage.onChanged.addListener(function (changes) {
  if (changes.zb_custom_sites) {
    syncCustomSites();
  }
});

if (chrome.permissions && chrome.permissions.onRemoved) {
  chrome.permissions.onRemoved.addListener(function () {
    syncCustomSites();
  });
}
