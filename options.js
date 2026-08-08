/* =======================================================================
 * Zabansaz Apex v4 — options.js
 * صفحه تنظیمات کامل: دکمه موبایل، سایت‌های سفارشی، راهنما، پاک‌سازی.
 * ===================================================================== */
(function () {
  function $(id) {
    return document.getElementById(id);
  }

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

  function requestPermissions(origins) {
    return new Promise(function (resolve) {
      try {
        chrome.permissions.request({ origins: origins }, function (granted) {
          resolve(!!granted);
        });
      } catch (e) {
        resolve(false);
      }
    });
  }

  function removePermissions(origins) {
    return new Promise(function (resolve) {
      try {
        chrome.permissions.remove({ origins: origins }, function () {
          resolve(true);
        });
      } catch (e) {
        resolve(false);
      }
    });
  }

  var toastTimer = null;

  function toast(msg) {
    var el = $('toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('show');
    }, 2300);
  }

  function normalizeHost(input) {
    var v = String(input || '').trim().toLowerCase();

    if (!v) return '';

    v = v.replace(/^https?:\/\//, '').replace(/^www\./, '');
    v = v.split('/')[0].split('?')[0].split('#')[0];

    if (!/^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/.test(v)) {
      return '';
    }

    return v;
  }

  function buildMatches(domain, includeSubdomains) {
    var matches = [];

    if (includeSubdomains) {
      matches.push('https://*.' + domain + '/*');
      matches.push('https://' + domain + '/*');
    } else {
      matches.push('https://' + domain + '/*');
      matches.push('https://www.' + domain + '/*');
    }

    return [...new Set(matches)];
  }

  async function renderSettings() {
    var r = await getStore([
      'zb_mobile_btn',
      'zb_mobile_send',
      'zb_hide_fab'
    ]);

    $('mobileBtnToggle').checked = r.zb_mobile_btn === true;
    $('mobileSendToggle').checked = r.zb_mobile_send !== false;
    $('hideFabToggle').checked = r.zb_hide_fab === true;
  }

  async function renderSites() {
    var r = await getStore(['zb_custom_sites']);
    var sites = Array.isArray(r.zb_custom_sites) ? r.zb_custom_sites : [];

    var list = $('sitesList');
    list.textContent = '';

    if (!sites.length) {
      var empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = 'هیچ سایت سفارشی اضافه نشده است. مثلاً برای اینستاگرام بنویس: instagram.com';
      list.appendChild(empty);
      return;
    }

    sites.forEach(function (site) {
      var row = document.createElement('div');
      row.className = 'site';

      var info = document.createElement('div');
      info.className = 'info';

      var name = document.createElement('b');
      name.textContent = site.name || site.domain || 'سایت';

      var matches = document.createElement('small');
      matches.textContent = (site.matches || []).join(' | ');

      info.appendChild(name);
      info.appendChild(matches);

      var controls = document.createElement('div');
      controls.className = 'controls';

      var toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.className = 'mini-switch';
      toggle.checked = site.enabled !== false;
      toggle.title = 'فعال/غیرفعال';

      toggle.addEventListener('change', async function () {
        site.enabled = toggle.checked;
        await setStore({ zb_custom_sites: sites });
        toast('وضعیت سایت ذخیره شد.');
      });

      var del = document.createElement('button');
      del.className = 'btn d';
      del.textContent = 'حذف';

      del.addEventListener('click', async function () {
        var remaining = sites.filter(function (s) {
          return s.id !== site.id;
        });

        var otherMatches = new Set();

        remaining.forEach(function (s) {
          if (Array.isArray(s.matches)) {
            s.matches.forEach(function (m) {
              otherMatches.add(m);
            });
          }
        });

        var toRemove = (site.matches || []).filter(function (m) {
          return !otherMatches.has(m);
        });

        if (toRemove.length) {
          await removePermissions(toRemove);
        }

        await setStore({ zb_custom_sites: remaining });
        renderSites();
        toast('سایت حذف شد.');
      });

      controls.appendChild(toggle);
      controls.appendChild(del);

      row.appendChild(info);
      row.appendChild(controls);

      list.appendChild(row);
    });
  }

  $('mobileBtnToggle').addEventListener('change', async function () {
    await setStore({ zb_mobile_btn: this.checked });
    toast(this.checked ? 'دکمه رمزی فعال شد.' : 'دکمه رمزی غیرفعال شد.');
  });

  $('mobileSendToggle').addEventListener('change', async function () {
    await setStore({ zb_mobile_send: this.checked });
    toast(this.checked ? 'حالت رمز + ارسال فعال شد.' : 'حالت فقط رمز فعال شد.');
  });

  $('hideFabToggle').addEventListener('change', async function () {
    await setStore({ zb_hide_fab: this.checked });
    toast(this.checked ? 'دکمه قدیمی مخفی شد.' : 'دکمه قدیمی دوباره نمایش داده می‌شود.');
  });

  $('resetPosBtn').addEventListener('click', async function () {
    await setStore({ zb_mobile_pos: null });
    toast('موقعیت دکمه ریست شد. صفحه هدف را رفرش کن.');
  });

  $('addSiteBtn').addEventListener('click', async function () {
    var name = $('siteName').value.trim();
    var rawDomain = $('siteDomain').value.trim();
    var domain = normalizeHost(rawDomain);

    if (!domain) {
      toast('آدرس سایت معتبر نیست. مثال: instagram.com');
      return;
    }

    var includeSub = $('siteSub').checked;
    var matches = buildMatches(domain, includeSub);

    var r = await getStore(['zb_custom_sites']);
    var sites = Array.isArray(r.zb_custom_sites) ? r.zb_custom_sites : [];

    var exists = sites.some(function (s) {
      return s.domain === domain;
    });

    if (exists) {
      toast('این سایت قبلاً اضافه شده است.');
      return;
    }

    var granted = await requestPermissions(matches);

    if (!granted) {
      toast('اجازه دسترسی به این سایت داده نشد.');
      return;
    }

    sites.unshift({
      id: String(Date.now()),
      name: name || domain,
      domain: domain,
      matches: matches,
      enabled: true,
      ts: Date.now()
    });

    await setStore({ zb_custom_sites: sites });

    $('siteName').value = '';
    $('siteDomain').value = '';

    renderSites();
    toast('سایت اضافه شد. صفحه آن سایت را رفرش کن.');
  });

  // ورود با Enter در فیلد دامنه
  $('siteDomain').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') {
      $('addSiteBtn').click();
    }
  });

  // منطقه خطر: پاک‌کردن همه چیز
  $('wipeBtn').addEventListener('click', async function () {
    var ok = confirm('آیا مطمئنی؟ همه زبان‌ها، تنظیمات و سایت‌های سفارشی حذف می‌شوند. این عمل قابل بازگشت نیست.');
    if (!ok) return;

    // پاک‌کردن اجازه‌های سایت‌های سفارشی
    var r = await getStore(['zb_custom_sites']);
    var sites = Array.isArray(r.zb_custom_sites) ? r.zb_custom_sites : [];
    var allMatches = [];
    sites.forEach(function (s) {
      if (Array.isArray(s.matches)) {
        s.matches.forEach(function (m) {
          if (allMatches.indexOf(m) === -1) allMatches.push(m);
        });
      }
    });
    if (allMatches.length) {
      await removePermissions(allMatches);
    }

    await chrome.storage.local.clear();
    toast('همه چیز پاک شد. اکستنشن به حالت اولیه برگشت.');

    // بازگذاری دوباره‌ی UI
    setTimeout(function () {
      location.reload();
    }, 900);
  });

  renderSettings();
  renderSites();
})();
