/* =======================================================================
 * Zabansaz Apex v4 — engine.js
 * موتور داخل صفحه: رمزگشایی خودکار پیام‌ها + قفل تایپ + پنل.
 *
 * رفع باگ‌ها و بهینه‌سازی نسبت به v3:
 *   - early-exit در MutationObserver وقتی زبان فعال نیست (کاهش بار)
 *   - cache عناصر رمزگشایی‌شده با WeakSet (بدون rescan تکراری)
 *   - tree walker با acceptNode برای سرعت و پریدن از script/style
 *   - guard برای جلوگیری از رمزگشایی داخل input/textarea و UI خودمان.
 *   - setText سازگار با React/Vue (native value setter + execCommand).
 * ===================================================================== */
(function () {
  if (window.__zbLoaded) return;
  window.__zbLoaded = true;

  var state = {
    lang: null,
    enabled: true,
    auto: true,
    lock: true
  };

  var CSS = [
    '#zbFab{position:fixed;bottom:calc(18px + env(safe-area-inset-bottom));left:18px;z-index:2147483000;width:52px;height:52px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:22px;cursor:pointer;user-select:none;background:linear-gradient(135deg,#180f2b,#241038);border:2px solid rgba(167,139,250,.35);box-shadow:0 6px 20px rgba(0,0,0,.45);transition:transform .2s,box-shadow .2s,opacity .2s}',
    '#zbFab:hover{transform:scale(1.06)}',
    '#zbFab.lock{border-color:#e879f9;box-shadow:0 0 18px rgba(232,121,249,.5)}',
    '#zbFab.unlock{border-color:#fbbf24}',
    '#zbFab.nolang{opacity:.5;filter:grayscale(.5)}',
    '#zbFab.off{opacity:.4;filter:grayscale(1)}',

    '.zb-badge{display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:linear-gradient(135deg,#8b5cf6,#e879f9);color:#fff;font-size:9px;font-weight:bold;line-height:1;margin:0 4px;vertical-align:middle;box-shadow:0 0 8px rgba(232,121,249,.55);cursor:help;flex:none}',

    '.zb-halo{border-radius:6px;padding:0 2px;animation:zbPulse .9s ease-out forwards}',
    '@keyframes zbPulse{0%{box-shadow:0 0 0 1px rgba(232,121,249,.9),0 0 22px rgba(232,121,249,.6)}100%{box-shadow:0 0 0 1px rgba(232,121,249,.5),0 0 10px rgba(139,92,246,.3)}}',

    '#zbPanel{position:fixed;bottom:calc(82px + env(safe-area-inset-bottom));left:18px;z-index:2147483000;width:280px;background:linear-gradient(180deg,#1c1130,#150b26);color:#f2edfb;border:1px solid rgba(167,139,250,.35);border-radius:18px;box-shadow:0 14px 40px rgba(0,0,0,.55);font:12px Tahoma;direction:rtl;overflow:hidden;animation:zbPanelIn .18s ease-out}',
    '@keyframes zbPanelIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',

    '.zbHead{display:flex;align-items:center;gap:8px;padding:10px 12px;background:rgba(20,11,36,.6);border-bottom:1px solid rgba(167,139,250,.2)}',
    '.zbHead b{flex:1;font-size:13px}',
    '.zbLogo{width:28px;height:28px;display:flex;align-items:center;justify-content:center;border:2px solid #a78bfa;border-radius:9px;color:#e879f9;transform:rotate(-4deg);font-size:14px}',
    '.zbX{cursor:pointer;color:#a79ac6;font-size:15px;padding:2px 6px;border-radius:8px;transition:.15s}',
    '.zbX:hover{background:rgba(167,139,250,.15);color:#fff}',

    '.zbMaster{display:flex;justify-content:space-between;align-items:center;padding:9px 12px;border-bottom:1px solid rgba(167,139,250,.15)}',
    '.zbStatus{font-weight:bold;font-size:12px}',
    '.zbBtn{border-radius:999px;padding:6px 12px;font-family:inherit;font-size:11px;font-weight:bold;cursor:pointer;background:rgba(255,255,255,.08);color:inherit;transition:.15s}',
    '.zbBtn:hover{filter:brightness(1.15)}',

    '.zbLang{padding:9px 12px;font-size:11px;color:#c4b5fd;background:rgba(139,92,246,.08);border-bottom:1px solid rgba(167,139,250,.15)}',

    '.zbRow{display:flex;justify-content:space-between;align-items:center;gap:6px;padding:9px 12px;font-size:11.5px;border-bottom:1px solid rgba(167,139,250,.1);cursor:pointer}',
    '.zbRow:hover{background:rgba(167,139,250,.06)}',

    '.zbSw{position:relative;width:38px;height:21px;flex:none;display:inline-block}',
    '.zbSw input{opacity:0;width:0;height:0;position:absolute}',
    '.zbSw i{position:absolute;top:0;left:0;right:0;bottom:0;background:#100a1e;border:1px solid rgba(167,139,250,.3);border-radius:99px;transition:.2s;cursor:pointer}',
    '.zbSw i:after{content:"";position:absolute;top:2px;left:2px;width:15px;height:15px;border-radius:50%;background:#a79ac6;transition:.2s}',
    '.zbSw input:checked + i{background:rgba(139,92,246,.4);border-color:#a78bfa}',
    '.zbSw input:checked + i:after{left:19px;background:#e879f9}',

    '.zbActs{display:grid;grid-template-columns:1fr 1fr;gap:6px;padding:10px 12px}',
    '.zbActs button{border:1px solid rgba(167,139,250,.35);background:rgba(20,11,36,.6);color:#f2edfb;border-radius:11px;padding:8px;font-family:inherit;font-size:11px;font-weight:bold;cursor:pointer;transition:.15s}',
    '.zbActs button:hover{background:rgba(167,139,250,.18);transform:translateY(-1px)}',

    '.zbRes{margin:0 12px 10px;background:rgba(16,10,30,.7);border:1px solid rgba(167,139,250,.25);border-radius:11px;padding:8px;font-size:11px;line-height:1.9;display:none;direction:ltr;text-align:left;font-family:monospace;color:#f0abfc;word-break:break-word;max-height:120px;overflow:auto;user-select:text}',
    '.zbRes.err{color:#fb7185;direction:rtl;text-align:right;font-family:Tahoma}',

    '.zbNote{padding:0 12px 11px;font-size:10px;color:#a79ac6;line-height:1.8}',

    '#zbToast{position:fixed;bottom:calc(82px + env(safe-area-inset-bottom));left:80px;z-index:2147483000;background:linear-gradient(135deg,#180f2b,#241038);color:#f2edfb;border:1px solid #e879f9;border-radius:999px;padding:7px 15px;font:11px Tahoma;opacity:0;transition:.3s;pointer-events:none;box-shadow:0 8px 24px rgba(0,0,0,.4)}',
    '#zbToast.show{opacity:1}'
  ].join('\n');

  var styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  (document.head || document.documentElement).appendChild(styleEl);

  var fab = document.createElement('div');
  fab.id = 'zbFab';
  fab.textContent = '⚪';
  fab.title = 'زبان‌ساز Apex';
  (document.body || document.documentElement).appendChild(fab);

  var panel = document.createElement('div');
  panel.id = 'zbPanel';
  panel.style.display = 'none';
  (document.body || document.documentElement).appendChild(panel);

  var toastEl = document.createElement('div');
  toastEl.id = 'zbToast';
  (document.body || document.documentElement).appendChild(toastEl);

  var toastTimer = null;
  // کلید = المان، مقدار = متن join‌شده‌ای که قبلاً تلاش شد (رمزگشایی ناموفق).
  var failMap = new WeakMap();
  // المان‌هایی که با موفقیت رمزگشایی شده‌اند (تا دوباره پردازش نشوند).
  var doneMap = new WeakSet();
  var busy = new WeakSet();

  function zbToast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove('show');
    }, 2200);
  }

  function setActive(token) {
    state.lang = token ? buildLanguageFromToken(token) : null;
    failMap = new WeakMap();
    doneMap = new WeakSet();
  }

  function renderFab() {
    fab.className = '';

    if (!state.enabled) {
      fab.classList.add('off');
      fab.textContent = '💤';
      return;
    }

    if (!state.lang) {
      fab.classList.add('nolang');
      fab.textContent = '⚪';
      return;
    }

    fab.classList.add(state.lock ? 'lock' : 'unlock');
    fab.textContent = state.lock ? '🔒' : '🔓';
  }

  function panelHTML() {
    var lvl = state.lang
      ? (' · ' + LVL_FA[state.lang.level] + ' · ' + state.lang.bits + ' بیت')
      : '';

    var langLine = state.lang
      ? ('✦ زبان فعال: «' + state.lang.name + '»' + lvl)
      : '⚪ زبانی فعال نیست — از پاپ‌آپ اکستنشن بساز';

    var statusTxt = state.enabled ? '⚡ اکستنشن روشن' : '💤 اکستنشن خاموش';
    var masterTxt = state.enabled ? 'خاموش کردن' : 'روشن کردن';
    var masterColor = state.enabled ? '#fb7185' : '#34d399';

    return '' +
      '<div class="zbHead">' +
        '<span class="zbLogo">⠿</span>' +
        '<b>زبان‌ساز Apex</b>' +
        '<span class="zbX" id="zbX">✕</span>' +
      '</div>' +

      '<div class="zbMaster">' +
        '<span class="zbStatus" style="color:' + masterColor + '">' + statusTxt + '</span>' +
        '<button class="zbBtn" id="zbMaster" style="color:' + masterColor + ';border:1px solid ' + masterColor + '">' + masterTxt + '</button>' +
      '</div>' +

      '<div class="zbLang">' + langLine + '</div>' +

      '<label class="zbRow">' +
        '<span>🔒 قفل تایپ (Enter = رمز)</span>' +
        '<span class="zbSw"><input type="checkbox" id="zbLock"><i></i></span>' +
      '</label>' +

      '<label class="zbRow">' +
        '<span>🔍 رمزگشایی خودکار پیام‌های صفحه</span>' +
        '<span class="zbSw"><input type="checkbox" id="zbAuto"><i></i></span>' +
      '</label>' +

      '<div class="zbActs">' +
        '<button id="zbEnc">⬇ رمز انتخاب‌شده</button>' +
        '<button id="zbDec">⬆ رمزگشای انتخاب‌شده</button>' +
      '</div>' +

      '<div class="zbRes" id="zbRes"></div>' +

      '<div class="zbNote">' +
        'وقتی روشن است، پیام‌های همین زبان با تیک بنفش ✓ به‌صورت خودکار نمایش داده می‌شوند.' +
      '</div>';
  }

  function renderPanel() {
    panel.innerHTML = panelHTML();

    var lockBox = panel.querySelector('#zbLock');
    var autoBox = panel.querySelector('#zbAuto');
    var closeBtn = panel.querySelector('#zbX');
    var masterBtn = panel.querySelector('#zbMaster');
    var encBtn = panel.querySelector('#zbEnc');
    var decBtn = panel.querySelector('#zbDec');

    if (lockBox) lockBox.checked = state.lock;
    if (autoBox) autoBox.checked = state.auto;

    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        panel.style.display = 'none';
      });
    }

    if (masterBtn) {
      masterBtn.addEventListener('click', function () {
        chrome.storage.local.set({ zb_enabled: !state.enabled });
      });
    }

    if (lockBox) {
      lockBox.addEventListener('change', function () {
        chrome.storage.local.set({ zb_lock: lockBox.checked });
      });
    }

    if (autoBox) {
      autoBox.addEventListener('change', function () {
        chrome.storage.local.set({ zb_auto: autoBox.checked });
      });
    }

    if (encBtn) {
      encBtn.addEventListener('click', function () {
        handleSel('enc');
      });
    }

    if (decBtn) {
      decBtn.addEventListener('click', function () {
        handleSel('dec');
      });
    }
  }

  fab.addEventListener('click', function () {
    if (panel.style.display === 'none') {
      renderPanel();
      panel.style.display = 'block';
    } else {
      panel.style.display = 'none';
    }
  });

  function copyToClip(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        zbToast('کپی شد ⧉');
      }).catch(function () {});
    }
  }

  function handleSel(dir) {
    var res = panel.querySelector('#zbRes');
    var sel = (window.getSelection() ? window.getSelection().toString() : '').trim();

    function showRes(text, isErr) {
      res.style.display = 'block';
      res.textContent = text;
      res.classList.toggle('err', !!isErr);
    }

    if (!state.enabled) {
      showRes('💤 اکستنشن خاموش است.', true);
      return;
    }

    if (!state.lang) {
      showRes('⚪ زبانی فعال نیست.', true);
      return;
    }

    if (!sel) {
      showRes('⚠ اول متنی را انتخاب کن.', true);
      return;
    }

    if (sel.length > 20000) {
      showRes('⚠ متن انتخاب‌شده خیلی بزرگ است.', true);
      return;
    }

    if (dir === 'enc') {
      encryptBytes(state.lang, T_enc.encode(sel)).then(function (r) {
        showRes(r.text, false);
        copyToClip(r.text);
      }).catch(function () {
        showRes('✖ خطا در رمزکردن.', true);
      });
    } else {
      decryptGlyphs(state.lang, sel).then(function (r) {
        if (!r.ok) {
          showRes('✖ رمزگشا نشد.', true);
          return;
        }
        showRes(r.text, false);
        copyToClip(r.text);
      }).catch(function () {
        showRes('✖ خطا در رمزگشایی.', true);
      });
    }
  }

  chrome.storage.local.get(
    ['zb_active', 'zb_enabled', 'zb_auto', 'zb_lock'],
    function (r) {
      if (chrome.runtime.lastError) return;

      state.enabled = r.zb_enabled !== false;
      state.auto = r.zb_auto !== false;
      state.lock = r.zb_lock !== false;

      setActive(r.zb_active || '');
      renderFab();
      rescanAll();

      // rescan ملایم‌تر برای SPA‌ها — هر ۵ ثانیه به جای ۲ ثانیه.
      // Observer داخل متون جدید را به‌موقع می‌گیرد؛ این فقط fallback است.
      setInterval(function () {
        if (document.visibilityState === 'visible') {
          rescanAll();
        }
      }, 5000);
    }
  );

  chrome.storage.onChanged.addListener(function (changes) {
    if (changes.zb_enabled) {
      state.enabled = changes.zb_enabled.newValue !== false;
      zbToast(state.enabled ? '⚡ روشن شد' : '💤 خاموش شد');
    }

    if (changes.zb_auto) {
      state.auto = changes.zb_auto.newValue !== false;
    }

    if (changes.zb_lock) {
      state.lock = changes.zb_lock.newValue !== false;
    }

    if (changes.zb_active) {
      setActive(changes.zb_active.newValue || '');
      zbToast(state.lang ? ('✦ زبان: «' + state.lang.name + '»') : '⚪ زبانی نیست');
    }

    renderFab();

    if (panel.style.display !== 'none') {
      renderPanel();
    }

    rescanAll();
  });

  function addBadge(host) {
    if (!host) return;

    if (!host.classList.contains('zb-halo')) {
      host.classList.add('zb-halo');
    }

    if (host.querySelector && host.querySelector('.zb-badge')) return;

    var b = document.createElement('span');
    b.className = 'zb-badge';
    b.textContent = '✓';
    b.title = 'این پیام رمزشده بود و رمزگشایی شد 🔒';
    host.appendChild(b);
  }

  function isOurUI(el) {
    if (!el) return false;
    if (el.id === 'zbFab' || el.id === 'zbPanel' || el.id === 'zbToast' || el.id === 'zbMobileHost') return true;
    if (el.closest && (el.closest('#zbPanel') || el.closest('#zbFab') || el.closest('#zbMobileHost'))) return true;
    return false;
  }

  function isEditableEl(el) {
    if (!el) return false;
    if (el.isContentEditable) return true;
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return true;
    if (el.closest && el.closest('[contenteditable="true"]')) return true;
    return false;
  }

  function looksFrag(text) {
    if (!state.lang) return false;
    return looksCipher(state.lang, text);
  }

  // جمع‌آوری text nodeهای رمزشده داخل یک element.
  function cipherNodes(el, out) {
    // بهینه: اگر element خیلی بزرگ است رد کن (محافظ کارایی)
    if (el.childElementCount > 500) return;

    var walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        var p = node.parentElement;
        // از بررسی محتوای داخل SCRIPT/STYLE بپرهیز
        if (p) {
          var tag = p.tagName;
          if (tag === 'SCRIPT' || tag === 'STYLE') return NodeFilter.FILTER_REJECT;
        }
        if (node.nodeValue && node.nodeValue.length >= 8 && looksFrag(node.nodeValue)) {
          return NodeFilter.FILTER_ACCEPT;
        }
        return NodeFilter.FILTER_REJECT;
      }
    });

    var n;
    while ((n = walker.nextNode())) {
      out.push(n);
    }
  }

  function tryDecrypt(el) {
    if (!el || busy.has(el) || doneMap.has(el)) return;
    if (isOurUI(el) || isEditableEl(el)) return;
    if (el.childElementCount > 500) return;

    var lang = state.lang;
    if (!lang) return;

    var parts = [];
    cipherNodes(el, parts);

    if (!parts.length) return;

    var joined = parts.map(function (p) {
      return p.nodeValue.trim();
    }).join(' ');

    if (joined.length < 28 || joined.length > 12000) return;
    if (failMap.get(el) === joined) return;

    busy.add(el);

    decryptGlyphs(lang, joined).then(function (r) {
      busy.delete(el);

      if (!state.enabled || state.lang !== lang) return;

      if (r && r.ok) {
        var host = parts[0].parentElement || el;

        // جایگزینی متن داخل اولین text node؛ بقیه خالی می‌شوند.
        parts[0].nodeValue = r.text;
        for (var i = 1; i < parts.length; i++) {
          parts[i].nodeValue = '';
        }

        doneMap.add(el);
        addBadge(host);
      } else {
        failMap.set(el, joined);
      }
    }).catch(function () {
      busy.delete(el);
    });
  }

  function collect(root, out) {
    if (out.length >= 700) return;

    out.push(root);

    var kids = root.children;

    for (var i = 0; i < kids.length; i++) {
      collect(kids[i], out);
    }
  }

  function depth(el) {
    var d = 0;
    var n = el;

    while (n && n !== document.body && d < 80) {
      d++;
      n = n.parentNode;
    }

    return d;
  }

  var pend = [];
  var queued = false;

  function schedule(node) {
    pend.push(node);

    if (!queued) {
      queued = true;
      requestAnimationFrame(process);
    }
  }

  function process() {
    queued = false;

    var list = pend.splice(0);

    if (!state.lang || !state.auto || !state.enabled) return;

    var els = [];

    for (var i = 0; i < list.length; i++) {
      var n = list[i];

      if (n.nodeType === 3) {
        if (n.parentElement) els.push(n.parentElement);
      } else if (n.nodeType === 1) {
        collect(n, els);
      }
    }

    els.sort(function (a, b) {
      return depth(b) - depth(a);
    });

    var count = 0;

    for (var j = 0; j < els.length; j++) {
      if (count++ > 900) break;
      tryDecrypt(els[j]);
    }
  }

  function messageRoots() {
    var sels = [
      '[class*="message"]',
      '[class*="Message"]',
      '[class*="bubble"]',
      '[class*="chat"]',
      '[class*="Chat"]',
      '[class*="msg"]',
      '[role="listitem"]',
      '[role="list"]',
      'main'
    ];

    var set = [];

    for (var i = 0; i < sels.length; i++) {
      try {
        var found = document.querySelectorAll(sels[i]);

        for (var k = 0; k < found.length; k++) {
          if (set.indexOf(found[k]) === -1) {
            set.push(found[k]);
          }
        }
      } catch (e) {}
    }

    return set.length ? set : [document.body];
  }

  function rescanAll() {
    if (!state.lang || !state.auto || !state.enabled) return;

    var roots = messageRoots();

    for (var i = 0; i < roots.length; i++) {
      schedule(roots[i]);
    }
  }

  var observer = new MutationObserver(function (muts) {
    // اگر زبان فعالی نیست یا رمزگشایی خودکار خاموش است، observer کاری ندارد.
    if (!state.lang || !state.auto || !state.enabled) return;

    for (var i = 0; i < muts.length; i++) {
      var m = muts[i];

      for (var j = 0; j < m.addedNodes.length; j++) {
        var n = m.addedNodes[j];

        if (n.nodeType === 1) {
          schedule(n);
        } else if (n.nodeType === 3 && n.parentElement) {
          schedule(n.parentElement);
        }
      }

      if (m.type === 'characterData' && m.target.parentElement) {
        schedule(m.target.parentElement);
      }
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true
  });

  function isEditable(el) {
    return !!(
      el &&
      (
        el.tagName === 'TEXTAREA' ||
        el.tagName === 'INPUT' ||
        el.isContentEditable
      )
    );
  }

  function getText(el) {
    if (!el) return '';
    return (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT')
      ? el.value
      : el.textContent;
  }

  function setText(el, v) {
    if (!el) return;

    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      // استفاده از native setter برای سازگاری با React
      var proto = el.tagName === 'TEXTAREA'
        ? window.HTMLTextAreaElement.prototype
        : window.HTMLInputElement.prototype;
      var setter = Object.getOwnPropertyDescriptor(proto, 'value');
      if (setter && setter.set) {
        setter.set.call(el, v);
      } else {
        el.value = v;
      }
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      // برای contenteditable از execCommand استفاده می‌کنیم تا React/Vue آن را ببیند
      try {
        el.focus();
        var sel = window.getSelection();
        var range = document.createRange();
        range.selectNodeContents(el);
        sel.removeAllRanges();
        sel.addRange(range);
        if (document.execCommand('insertText', false, v)) {
          return;
        }
      } catch (e) {}

      // fallback
      el.textContent = v;
      try {
        el.dispatchEvent(new InputEvent('input', {
          bubbles: true,
          data: v,
          inputType: 'insertText'
        }));
      } catch (e) {
        el.dispatchEvent(new Event('input', { bubbles: true }));
      }
    }

    try {
      el.focus();
    } catch (e) {}
  }

  document.addEventListener('keydown', function (e) {
    if (!e.isTrusted || e.key !== 'Enter' || e.shiftKey) return;
    if (!state.enabled || !state.lock || !state.lang) return;

    var el = document.activeElement;
    if (!isEditable(el)) return;

    var txt = getText(el);
    if (!txt || !txt.trim() || looksFrag(txt)) return;

    e.preventDefault();
    e.stopPropagation();

    encryptBytes(state.lang, T_enc.encode(txt)).then(function (r) {
      setText(el, r.text);

      setTimeout(function () {
        el.dispatchEvent(new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        }));

        el.dispatchEvent(new KeyboardEvent('keypress', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        }));

        el.dispatchEvent(new KeyboardEvent('keyup', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        }));
      }, 40);
    }).catch(function () {
      zbToast('خطا در رمزکردن');
    });
  }, true);
})();
