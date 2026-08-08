/* =======================================================================
 * Zabansaz Apex v4 — popup.js
 * منطق پاپ‌آپ با ۴ صفحه: خانه، زبان‌ها، ابزار، تنظیمات.
 * ===================================================================== */
var selProfile = 4; // پیش‌فرض: قوی (level 3 → 16 بایت)
var mMode = 'auto';
var mTimer = null;

function $(id) {
  return document.getElementById(id);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getStore() {
  return new Promise(function (res) {
    chrome.storage.local.get(
      ['zb_active', 'zb_langs', 'zb_auto', 'zb_lock', 'zb_enabled'],
      function (r) {
        if (chrome.runtime.lastError) {
          res({});
          return;
        }
        res(r);
      }
    );
  });
}

function setStore(o) {
  return new Promise(function (res) {
    chrome.storage.local.set(o, function () {
      res(!chrome.runtime.lastError);
    });
  });
}

async function getState() {
  var s = await getStore();
  return {
    active: s.zb_active || '',
    langs: Array.isArray(s.zb_langs) ? s.zb_langs : [],
    auto: s.zb_auto !== false,
    lock: s.zb_lock !== false,
    enabled: s.zb_enabled !== false
  };
}

function copy(txt, msg) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(txt).then(function () {
      toastMsg(msg || 'کپی شد');
    }).catch(function () {
      toastMsg('کپی ناموفق بود');
    });
  } else {
    toastMsg('دسترسی به کلیپ‌بورد نیست');
  }
}

// نمایش پیام کوتاه در خروجی ابزار
function toastMsg(m) {
  var o = $('mOut');
  if (!o) return;
  o.className = 'out err';
  o.textContent = m;
  setTimeout(convert, 1400);
}

// ----------------------- navigation -----------------------
function switchPage(page) {
  var pages = document.querySelectorAll('.page');
  for (var i = 0; i < pages.length; i++) {
    pages[i].classList.remove('on');
  }

  var el = $('page' + page.charAt(0).toUpperCase() + page.slice(1));
  if (el) el.classList.add('on');

  var navs = document.querySelectorAll('.nav button');
  for (var j = 0; j < navs.length; j++) {
    var p = navs[j].getAttribute('data-page');
    navs[j].classList.toggle('on', p === page);
  }

  if (page === 'tools') {
    renderStat();
  }
}

document.querySelectorAll('.nav button').forEach(function (b) {
  b.addEventListener('click', function () {
    switchPage(b.getAttribute('data-page'));
  });
});

// ----------------------- render active language -----------------------
async function render() {
  var s = await getState();
  var lang = s.active ? buildLanguageFromToken(s.active) : null;
  var box = $('activeSec');

  if (lang) {
    var numeric = numericForm(lang);

    box.innerHTML =
      '<h3>✦ زبان فعال</h3>' +
      '<div class="langcard">' +
        '<span class="n">زبان «' + esc(lang.name) + '»</span>' +
        '<span class="lv">' + esc(LVL_FA[lang.level] || '') + ' · ' + Number(lang.bits || 0) + ' بیت</span>' +
        '<div class="tok" id="tokChip" title="برای کپی کلیک کن">' + esc(lang.tokenStr) + '</div>' +
        (numeric
          ? '<div class="tok" id="tokNum" style="color:#34d399;border-color:rgba(52,211,153,.4)" title="برای کپی کلیک کن">کد کوتاه: ' + esc(numeric) + '</div>'
          : '') +
        '<div class="rowb">' +
          '<button class="btn g" id="btnTok">⧉ کپی توکن</button>' +
          '<button class="btn d" id="btnDel">🗑 حذف از فعال</button>' +
        '</div>' +
      '</div>';

    $('tokChip').addEventListener('click', function () {
      copy(lang.tokenStr, 'توکن کپی شد');
    });

    $('btnTok').addEventListener('click', function () {
      copy(lang.tokenStr, 'توکن کپی شد');
    });

    var tokNum = $('tokNum');
    if (tokNum) {
      tokNum.addEventListener('click', function () {
        copy(numeric, 'کد کوتاه کپی شد');
      });
    }

    $('btnDel').addEventListener('click', async function () {
      await setStore({ zb_active: '' });
      render();
      toastMsg('زبان فعال پاک شد');
    });
  } else {
    box.innerHTML =
      '<h3>✦ زبان فعال</h3>' +
      '<div class="mut">هنوز زبانی فعال نیست. یک زبان بساز یا با توکن بازیابی کن.</div>';
  }

  // پروفایل‌ها
  $('profGrid').innerHTML = PROFILES.map(function (p, i) {
    return '<button class="prof' + (i === selProfile ? ' sel' : '') + '" data-p="' + i + '">' +
      '<b>' + esc(LVL_FA[i + 1]) + '</b>' +
      '<span>' + Number(p.bytes) + 'B</span>' +
    '</button>';
  }).join('');

  var profs = document.querySelectorAll('.prof');
  for (var i = 0; i < profs.length; i++) {
    profs[i].addEventListener('click', function () {
      selProfile = parseInt(this.getAttribute('data-p'), 10);
      render();
    });
  }

  // تنظیمات
  $('tgAuto').checked = s.auto;
  $('tgLock').checked = s.lock;
  $('tgEnabled').checked = s.enabled;

  var badge = $('onBadge');
  badge.textContent = s.enabled ? '⚡ اکستنشن روشن است' : '💤 اکستنشن خاموش است';
  badge.style.color = s.enabled ? '#34d399' : '#a79ac6';

  // دفترچه
  renderLangsList(s.langs, s.active);
}

function renderLangsList(langs, active) {
  var list = $('langsList');

  if (langs.length) {
    list.innerHTML = langs.map(function (e, i) {
      var isActive = e.token === active;
      return '<div class="it">' +
        '<div class="info">' +
          '<div class="nm">«' + esc(e.name) + '»' + (isActive ? ' <span class="pill">فعال</span>' : '') + '</div>' +
          '<div class="lv2">' + esc(e.token.slice(0, 24)) + (e.token.length > 24 ? '…' : '') + '</div>' +
        '</div>' +
        '<div class="acts">' +
          '<button class="btn g" data-o="' + i + '" title="فعال‌سازی">✓</button>' +
          '<button class="btn g" data-c="' + i + '" title="کپی توکن">⧉</button>' +
          '<button class="btn d" data-d="' + i + '" title="حذف">✕</button>' +
        '</div>' +
      '</div>';
    }).join('');

    list.querySelectorAll('[data-o]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var idx = parseInt(b.getAttribute('data-o'), 10);
        var cur = await getState();
        if (cur.langs[idx]) {
          await setStore({ zb_active: cur.langs[idx].token });
          render();
        }
      });
    });

    list.querySelectorAll('[data-c]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var idx = parseInt(b.getAttribute('data-c'), 10);
        var cur = await getState();
        if (cur.langs[idx]) {
          copy(cur.langs[idx].token, 'توکن کپی شد');
        }
      });
    });

    list.querySelectorAll('[data-d]').forEach(function (b) {
      b.addEventListener('click', async function () {
        var idx = parseInt(b.getAttribute('data-d'), 10);
        var cur = await getState();
        var tok = cur.langs[idx] ? cur.langs[idx].token : null;
        if (!tok) return;

        var patch = {
          zb_langs: cur.langs.filter(function (x) {
            return x.token !== tok;
          })
        };

        if (cur.active === tok) patch.zb_active = '';

        await setStore(patch);
        render();
      });
    });
  } else {
    list.innerHTML = '<div class="empty-mini">دفتر خالی است. از تب خانه زبان بساز.</div>';
  }
}

// ----------------------- settings handlers -----------------------
$('tgAuto').addEventListener('change', function () {
  setStore({ zb_auto: $('tgAuto').checked });
});

$('tgLock').addEventListener('change', function () {
  setStore({ zb_lock: $('tgLock').checked });
});

$('tgEnabled').addEventListener('change', async function () {
  await setStore({ zb_enabled: $('tgEnabled').checked });
  render();
});

// ----------------------- make language -----------------------
$('btnMake').addEventListener('click', async function () {
  var tok = makeToken(PROFILES[selProfile]);
  var lang = buildLanguageFromToken(tok);

  var s = await getState();

  var langs = [{ token: tok, name: lang.name, ts: Date.now() }].concat(
    s.langs.filter(function (x) {
      return x.token !== tok;
    })
  );

  await setStore({ zb_langs: langs, zb_active: tok });
  render();
  toastMsg('زبان «' + lang.name + '» ساخته و فعال شد ✦');
});

// ----------------------- restore -----------------------
$('btnRestore').addEventListener('click', async function () {
  var v = $('tokIn').value.trim();

  if (!v) {
    toastMsg('اول یک توکن یا کد وارد کن');
    return;
  }

  var lang = buildLanguageFromToken(v);

  if (!lang) {
    toastMsg('توکن نامعتبر است');
    return;
  }

  var s = await getState();

  var langs = [{ token: lang.tokenStr, name: lang.name, ts: Date.now() }].concat(
    s.langs.filter(function (x) {
      return x.token !== lang.tokenStr;
    })
  );

  await setStore({ zb_langs: langs, zb_active: lang.tokenStr });

  $('tokIn').value = '';
  render();
  toastMsg('زبان «' + lang.name + '» بازیابی و فعال شد');
});

// ----------------------- quick add -----------------------
$('btnQuickAdd').addEventListener('click', async function () {
  var v = $('quickTok').value.trim();

  if (!v) {
    toastMsg('اول یک توکن وارد کن');
    return;
  }

  var lang = buildLanguageFromToken(v);
  if (!lang) {
    toastMsg('توکن نامعتبر است');
    return;
  }

  var s = await getState();
  var langs = [{ token: lang.tokenStr, name: lang.name, ts: Date.now() }].concat(
    s.langs.filter(function (x) {
      return x.token !== lang.tokenStr;
    })
  );

  await setStore({ zb_langs: langs });
  $('quickTok').value = '';
  render();
  toastMsg('به دفترچه اضافه شد');
});

// ----------------------- manual translator -----------------------
function setM(m) {
  mMode = m;
  ['mAuto', 'mEnc', 'mDec'].forEach(function (id) {
    $(id).classList.remove('on');
  });
  $(m === 'auto' ? 'mAuto' : (m === 'enc' ? 'mEnc' : 'mDec')).classList.add('on');
  convert();
}

$('mAuto').addEventListener('click', function () { setM('auto'); });
$('mEnc').addEventListener('click', function () { setM('enc'); });
$('mDec').addEventListener('click', function () { setM('dec'); });

$('mSrc').addEventListener('input', function () {
  clearTimeout(mTimer);
  mTimer = setTimeout(convert, 250);
});

$('mClear').addEventListener('click', function () {
  $('mSrc').value = '';
  convert();
});

$('mSwap').addEventListener('click', async function () {
  var o = $('mOut');
  if (o.classList.contains('err') || !o.textContent) return;
  $('mSrc').value = o.textContent;
  // حالت را برعکس کن
  if (mMode === 'enc') setM('dec');
  else if (mMode === 'dec') setM('enc');
  else convert();
});

$('mCopy').addEventListener('click', function () {
  var o = $('mOut');
  if (!o.classList.contains('err') && o.textContent) {
    copy(o.textContent, 'خروجی کپی شد');
  }
});

async function convert() {
  var src = $('mSrc').value;
  var o = $('mOut');

  if (!src.trim()) {
    o.className = 'out';
    o.dir = 'auto';
    o.textContent = 'نتیجه اینجا ظاهر می‌شود…';
    return;
  }

  var s = await getState();
  var lang = s.active ? buildLanguageFromToken(s.active) : null;

  if (!lang) {
    o.className = 'out err';
    o.textContent = '⚠ اول یک زبان بساز یا بازیابی کن.';
    return;
  }

  var dir = mMode;

  if (mMode === 'auto') {
    dir = looksCipher(lang, src) ? 'dec' : 'enc';
  }

  if (dir === 'enc') {
    try {
      var r = await encryptBytes(lang, T_enc.encode(src));
      o.className = 'out';
      o.dir = 'ltr';
      o.textContent = r.text;
    } catch (e) {
      o.className = 'out err';
      o.textContent = '✖ خطا در رمزکردن.';
    }
  } else {
    var r2 = await decryptGlyphs(lang, src);
    if (!r2.ok) {
      o.className = 'out err';
      o.textContent = '✖ رمزگشا نشد. شاید با زبان دیگری رمز شده.';
      return;
    }
    o.className = 'out';
    o.dir = 'auto';
    o.textContent = r2.text;
  }
}

// ----------------------- stat page -----------------------
async function renderStat() {
  var s = await getState();
  var lang = s.active ? buildLanguageFromToken(s.active) : null;

  var cipherVersion = (typeof ZB_CIPHER_VERSION !== 'undefined') ? ZB_CIPHER_VERSION : 3;

  var lines = [];
  lines.push('وضعیت اکستنشن: ' + (s.enabled ? '✅ روشن' : '❌ خاموش'));
  lines.push('رمزگشایی خودکار: ' + (s.auto ? '✅ فعال' : '❌ خاموش'));
  lines.push('قفل تایپ Enter: ' + (s.lock ? '✅ فعال' : '❌ خاموش'));
  lines.push('تعداد زبان‌های دفترچه: ' + s.langs.length);
  lines.push('نسخه‌ی هسته رمز: v' + cipherVersion);

  if (lang) {
    lines.push('زبان فعال: «' + lang.name + '»');
    lines.push('سطح: ' + LVL_FA[lang.level] + ' · ' + lang.bits + ' بیت');
  } else {
    lines.push('زبان فعال: ⚪ هیچ');
  }

  $('statBox').innerHTML = lines.map(function (l) {
    return esc(l);
  }).join('<br/>');
}

// ----------------------- options button -----------------------
var btnOptions = $('btnOptions');
if (btnOptions) {
  btnOptions.addEventListener('click', function () {
    chrome.runtime.openOptionsPage();
  });
}

// مقدار اولیه
if (typeof PROFILES !== 'undefined') {
  render();
  convert();
} else {
  // cipher.js هنوز لود نشده — کمی صبر کن
  setTimeout(function () {
    render();
    convert();
  }, 50);
}
