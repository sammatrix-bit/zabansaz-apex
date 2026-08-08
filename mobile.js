/* =======================================================================
 * Zabansaz Apex v4 — mobile.js
 * دکمه‌ی شناور رمزی برای موبایل (و دسکتاپ): رمزکردن متن کادر پیام
 * و (اختیاری) ارسال آن.
 *
 * رفع باگ‌ها و قابلیت‌های جدید نسبت به v3:
 *   - setText سازگار با React/Vue (native setter + execCommand)
 *   - findSendButton با selectorهای گسترده‌تر + اولویت‌بندی
 *   - تشخیص بهتر کادر پیام فعال (حتی بعد از blur کوتاه)
 *   - حالت «فقط انتخاب/روشن» و بدون باگ Drag
 *   - دکمه‌ی کمکی رمزگشایی داخل کادر (وقتی متن رمزشده باشد)
 * ===================================================================== */
(function () {
  if (window.__zbMobileLoaded) return;
  window.__zbMobileLoaded = true;

  if (
    typeof buildLanguageFromToken !== 'function' ||
    typeof encryptBytes !== 'function' ||
    typeof decryptGlyphs !== 'function' ||
    typeof T_enc === 'undefined'
  ) {
    return;
  }

  var state = {
    enabled: true,
    lang: null,
    mobileBtn: false,
    mobileSend: true,
    hideFab: false,
    pos: null
  };

  var lastEditable = null;
  var lastEditableAt = 0;
  var toastTimer = null;

  var drag = {
    active: false,
    moved: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    origX: 0,
    origY: 0
  };

  var host = document.createElement('div');
  host.id = 'zbMobileHost';
  (document.body || document.documentElement).appendChild(host);

  var shadow = host.attachShadow({ mode: 'closed' });

  var styleEl = document.createElement('style');
  shadow.appendChild(styleEl);

  var btn = document.createElement('div');
  btn.id = 'zbMobileBtn';
  btn.setAttribute('role', 'button');
  btn.setAttribute('tabindex', '0');
  btn.setAttribute('aria-label', 'دکمه رمزی — رمز کردن پیام');
  btn.innerHTML = '<span class="ico">🔒</span><span class="txt">رمز</span>';
  btn.style.display = 'none';
  shadow.appendChild(btn);

  var toast = document.createElement('div');
  toast.id = 'zbMobileToast';
  shadow.appendChild(toast);

  var pageStyle = document.createElement('style');
  (document.head || document.documentElement).appendChild(pageStyle);

  function css() {
    return `
      #zbMobileBtn {
        position: fixed;
        z-index: 2147483100;
        min-width: 68px;
        min-height: 68px;
        border-radius: 22px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 3px;
        background: linear-gradient(135deg, rgba(124, 58, 237, 0.96), rgba(219, 39, 119, 0.96));
        color: #fff;
        border: 1px solid rgba(255, 255, 255, 0.28);
        box-shadow: 0 10px 30px rgba(0, 0, 0, 0.45), 0 0 22px rgba(139, 92, 246, 0.35);
        cursor: pointer;
        user-select: none;
        touch-action: none;
        font-family: Tahoma, Arial, sans-serif;
        font-size: 11px;
        line-height: 1;
        padding: 8px 10px;
        direction: rtl;
        transition: transform .12s;
      }

      #zbMobileBtn:active {
        transform: scale(0.97);
      }

      #zbMobileBtn.dec {
        background: linear-gradient(135deg, rgba(16, 185, 129, 0.96), rgba(59, 130, 246, 0.96));
      }

      #zbMobileBtn .ico {
        font-size: 22px;
        line-height: 1;
      }

      #zbMobileBtn .txt {
        font-size: 11px;
        font-weight: bold;
        opacity: 0.95;
      }

      #zbMobileToast {
        position: fixed;
        left: 50%;
        transform: translateX(-50%);
        bottom: calc(110px + env(safe-area-inset-bottom));
        z-index: 2147483100;
        background: rgba(10, 5, 20, 0.92);
        color: #fff;
        border: 1px solid rgba(232, 121, 249, 0.55);
        border-radius: 999px;
        padding: 7px 13px;
        font: 11px Tahoma, Arial, sans-serif;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.2s ease;
        direction: rtl;
        max-width: 80vw;
        text-align: center;
      }

      #zbMobileToast.show {
        opacity: 1;
      }
    `;
  }

  function renderStyles() {
    styleEl.textContent = css();

    if (state.hideFab) {
      pageStyle.textContent = `
        #zbFab,
        #zbPanel,
        #zbToast {
          display: none !important;
        }
      `;
    } else {
      pageStyle.textContent = '';
    }
  }

  function showToast(msg) {
    toast.textContent = msg;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove('show');
    }, 2200);
  }

  function isEditable(el) {
    if (!el) return false;
    if (el.tagName === 'TEXTAREA') return true;
    if (el.tagName === 'INPUT') return true;
    if (el.isContentEditable) return true;
    if (el.closest && el.closest('[contenteditable="true"]')) return true;
    return false;
  }

  function getText(el) {
    if (!el) return '';
    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
      return el.value || '';
    }
    return el.textContent || '';
  }

  // نسخه‌ی مقاوم setText که با React/Vue هم کار می‌کند.
  function setText(el, v) {
    if (!el) return;

    if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') {
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

  function isVisible(el) {
    if (!el) return false;

    var r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    if (el.disabled) return false;

    var cs = window.getComputedStyle(el);
    if (!cs) return false;
    if (cs.display === 'none') return false;
    if (cs.visibility === 'hidden') return false;

    return true;
  }

  // پیدا کردن دکمه‌ی ارسال با اولویت‌بندی — برای سایت‌های مختلف.
  function findSendButton() {
    var selectors = [
      'button[aria-label*="Send" i]',
      'button[aria-label*="ارسال" i]',
      'button[data-testid*="send" i]',
      'button[data-testid*="composer" i]',
      '[role="button"][aria-label*="Send" i]',
      '[role="button"][aria-label*="ارسال" i]',
      'button[type="submit"]',
      'form button[type="submit"]'
    ];

    for (var i = 0; i < selectors.length; i++) {
      try {
        var list = document.querySelectorAll(selectors[i]);
        for (var j = 0; j < list.length; j++) {
          var el = list[j];
          if (el.id === 'zbMobileHost') continue;
          if (isVisible(el)) return el;
        }
      } catch (e) {}
    }

    return null;
  }

  // ارسال با چند روش (eventهای Enter + submit + click دکمه).
  function trySend(el) {
    try {
      el.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        })
      );

      el.dispatchEvent(
        new KeyboardEvent('keypress', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        })
      );

      el.dispatchEvent(
        new KeyboardEvent('keyup', {
          key: 'Enter',
          code: 'Enter',
          keyCode: 13,
          which: 13,
          bubbles: true,
          cancelable: true
        })
      );
    } catch (e) {}

    try {
      var form = el.closest ? el.closest('form') : null;
      if (form) {
        if (form.requestSubmit) {
          form.requestSubmit();
        } else {
          form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        }
      }
    } catch (e) {}

    try {
      var sendBtn = findSendButton();
      if (sendBtn) sendBtn.click();
    } catch (e) {}
  }

  function getTargetEditable() {
    var active = document.activeElement;

    if (isEditable(active)) {
      lastEditable = active;
      lastEditableAt = Date.now();
      return active;
    }

    var recent = Date.now() - lastEditableAt < 30000;

    if (recent && lastEditable && document.contains(lastEditable)) {
      return lastEditable;
    }

    return null;
  }

  // عمل اصلی: رمزکردن متن کادر پیام (یا رمزگشایی اگر از قبل رمز باشد).
  function action() {
    if (!state.enabled) {
      showToast('اکستنشن خاموش است.');
      return;
    }

    if (!state.mobileBtn) {
      showToast('دکمه رمزی از تنظیمات غیرفعال است.');
      return;
    }

    if (!state.lang) {
      showToast('اول یک زبان فعال کن.');
      return;
    }

    var el = getTargetEditable();

    if (!el) {
      showToast('اول داخل کادر پیام برو.');
      return;
    }

    var txt = getText(el);

    if (!txt || !txt.trim()) {
      showToast('متنی برای رمزکردن نیست.');
      return;
    }

    var alreadyCipher = typeof looksCipher === 'function' && looksCipher(state.lang, txt);

    if (alreadyCipher) {
      // متن از قبل رمزشده است → آن را رمزگشایی کن تا کاربر ببیند/ویرایش کند.
      decryptGlyphs(state.lang, txt).then(function (r) {
        if (r && r.ok) {
          setText(el, r.text);
          showToast('رمزگشایی شد ✓');
        } else {
          if (state.mobileSend) {
            trySend(el);
            showToast('ارسال شد…');
          } else {
            showToast('متن از قبل رمزشده است.');
          }
        }
      });
      return;
    }

    encryptBytes(state.lang, T_enc.encode(txt))
      .then(function (r) {
        setText(el, r.text);

        if (state.mobileSend) {
          showToast('رمز شد ✓');
          setTimeout(function () {
            trySend(el);
          }, 80);
        } else {
          showToast('رمز شد؛ حالا دکمه ارسال خود سایت را بزن.');
        }
      })
      .catch(function () {
        showToast('خطا در رمزکردن.');
      });
  }

  function clampPos(x, y) {
    var w = btn.offsetWidth || 68;
    var h = btn.offsetHeight || 68;

    var maxW = window.innerWidth || document.documentElement.clientWidth || 800;
    var maxH = window.innerHeight || document.documentElement.clientHeight || 600;

    x = Math.max(8, Math.min(x, maxW - w - 8));
    y = Math.max(8, Math.min(y, maxH - h - 8));

    return { x: x, y: y };
  }

  function applyPos() {
    if (state.pos && typeof state.pos.x === 'number' && typeof state.pos.y === 'number') {
      var c = clampPos(state.pos.x, state.pos.y);
      btn.style.left = c.x + 'px';
      btn.style.top = c.y + 'px';
      btn.style.right = 'auto';
      btn.style.bottom = 'auto';
    } else {
      btn.style.left = 'auto';
      btn.style.top = 'auto';
      btn.style.right = '16px';
      btn.style.bottom = 'calc(94px + env(safe-area-inset-bottom))';
    }
  }

  function updateVisibility() {
    var active = document.activeElement;

    if (isEditable(active)) {
      lastEditable = active;
      lastEditableAt = Date.now();
    }

    var recent = Date.now() - lastEditableAt < 30000;

    var canShow =
      state.enabled &&
      state.mobileBtn &&
      state.lang &&
      (
        isEditable(active) ||
        (recent && lastEditable && document.contains(lastEditable))
      );

    btn.style.display = canShow ? 'flex' : 'none';

    if (canShow) {
      applyPos();
      // اگر متن کادر فعلی رمزشده باشد، دکمه را به حالت رمزگشایی تغییر بده.
      var txt = getText(getTargetEditable());
      var isCipher = txt && typeof looksCipher === 'function' && looksCipher(state.lang, txt);
      btn.classList.toggle('dec', !!isCipher);
      var ico = btn.querySelector('.ico');
      var t = btn.querySelector('.txt');
      if (ico) ico.textContent = isCipher ? '🔓' : '🔒';
      if (t) t.textContent = isCipher ? 'بازکن' : 'رمز';
    }
  }

  function loadSettings() {
    chrome.storage.local.get(
      [
        'zb_enabled',
        'zb_active',
        'zb_mobile_btn',
        'zb_mobile_send',
        'zb_hide_fab',
        'zb_mobile_pos'
      ],
      function (r) {
        if (chrome.runtime.lastError) return;

        state.enabled = r.zb_enabled !== false;
        state.mobileBtn = r.zb_mobile_btn === true;
        state.mobileSend = r.zb_mobile_send !== false;
        state.hideFab = r.zb_hide_fab === true;
        state.pos = r.zb_mobile_pos && typeof r.zb_mobile_pos === 'object' ? r.zb_mobile_pos : null;
        state.lang = r.zb_active ? buildLanguageFromToken(r.zb_active) : null;

        renderStyles();
        applyPos();
        updateVisibility();
      }
    );
  }

  chrome.storage.onChanged.addListener(function (changes) {
    if (changes.zb_enabled) {
      state.enabled = changes.zb_enabled.newValue !== false;
    }

    if (changes.zb_active) {
      state.lang = changes.zb_active.newValue
        ? buildLanguageFromToken(changes.zb_active.newValue)
        : null;
    }

    if (changes.zb_mobile_btn) {
      state.mobileBtn = changes.zb_mobile_btn.newValue === true;
    }

    if (changes.zb_mobile_send) {
      state.mobileSend = changes.zb_mobile_send.newValue !== false;
    }

    if (changes.zb_hide_fab) {
      state.hideFab = changes.zb_hide_fab.newValue === true;
      renderStyles();
    }

    if (changes.zb_mobile_pos) {
      state.pos =
        changes.zb_mobile_pos.newValue &&
        typeof changes.zb_mobile_pos.newValue === 'object'
          ? changes.zb_mobile_pos.newValue
          : null;
      applyPos();
    }

    updateVisibility();
  });

  document.addEventListener('focusin', function (e) {
    if (isEditable(e.target)) {
      lastEditable = e.target;
      lastEditableAt = Date.now();
    }
    updateVisibility();
  }, true);

  document.addEventListener('focusout', function () {
    setTimeout(updateVisibility, 250);
  }, true);

  // به‌روزرسانی ظاهر دکمه وقتی متن کادر عوض می‌شود.
  document.addEventListener('input', function (e) {
    if (isEditable(e.target)) updateVisibility();
  }, true);

  window.addEventListener('resize', function () {
    applyPos();
    updateVisibility();
  }, true);

  window.addEventListener('orientationchange', function () {
    setTimeout(function () {
      applyPos();
      updateVisibility();
    }, 200);
  }, true);

  btn.addEventListener('contextmenu', function (e) {
    e.preventDefault();
  });

  btn.addEventListener('mousedown', function (e) {
    e.preventDefault();
  });

  btn.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      action();
    }
  });

  btn.addEventListener('pointerdown', function (e) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    drag.active = true;
    drag.moved = false;
    drag.pointerId = e.pointerId;
    drag.startX = e.clientX;
    drag.startY = e.clientY;

    var rect = btn.getBoundingClientRect();
    drag.origX = rect.left;
    drag.origY = rect.top;

    try {
      btn.setPointerCapture(e.pointerId);
    } catch (err) {}

    e.preventDefault();
  }, true);

  btn.addEventListener('pointermove', function (e) {
    if (!drag.active) return;

    var dx = e.clientX - drag.startX;
    var dy = e.clientY - drag.startY;

    if (!drag.moved && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
      drag.moved = true;
    }

    if (!drag.moved) return;

    var x = drag.origX + dx;
    var y = drag.origY + dy;
    var c = clampPos(x, y);

    btn.style.left = c.x + 'px';
    btn.style.top = c.y + 'px';
    btn.style.right = 'auto';
    btn.style.bottom = 'auto';

    e.preventDefault();
  }, true);

  btn.addEventListener('pointerup', function (e) {
    if (!drag.active) return;

    drag.active = false;

    try {
      btn.releasePointerCapture(drag.pointerId);
    } catch (err) {}

    if (drag.moved) {
      var rect = btn.getBoundingClientRect();
      var c = clampPos(rect.left, rect.top);

      state.pos = { x: c.x, y: c.y };

      chrome.storage.local.set({
        zb_mobile_pos: state.pos
      });
    } else {
      action();
    }

    e.preventDefault();
  }, true);

  btn.addEventListener('pointercancel', function () {
    drag.active = false;
    drag.moved = false;
  }, true);

  renderStyles();
  loadSettings();
})();
