/* =======================================================================
 * Zabansaz Apex v4 — cipher.js
 * هسته رمزنگاری. سازگار با نسخه‌های قبلی (ZBA3 و فرمت بریل).
 *
 * تغییرات نسبت به v3:
 *   - keyCache با محدودیت اندازه (LRU ساده) → جلوگیری از memory leak
 *   - مدیریت خطای مقاوم‌تر در buildLanguageFromToken
 *   - تابع‌های کمکی برای رمزگشایی چندزبانه (گروه‌ها)
 *   - typeof/instanceof checks مقاوم‌تر
 * ===================================================================== */
(function () {
  if (globalThis.__zbCipherLoaded) return;
  globalThis.__zbCipherLoaded = true;

  var T_enc = new TextEncoder();
  var T_dec = new TextDecoder();

  // Zabansaz Apex v3 magic — نباید تغییر کند (سازگاری با پیام‌های قدیمی)
  var MAGIC = new Uint8Array([0x5a, 0x42, 0xa3, 0x03]);
  var MAGIC_LEN = MAGIC.length; // 4
  var IV_LEN = 12;
  var TAG_LEN = 16;

  var MAX_TOKEN_CHARS = 200000;
  var MAX_CIPHER_CHARS = 250000;
  var MAX_PLAIN_BYTES = 200000;

  var KEY_CACHE_MAX = 16; // حداکثر تعداد کلیدهای cache شده

  var PROFILES = [
    { id: 1, bytes: 4,  level: 1 },
    { id: 2, bytes: 8,  level: 2 },
    { id: 3, bytes: 16, level: 3 },
    { id: 4, bytes: 32, level: 4 },
    { id: 5, bytes: 48, level: 5 },
    { id: 6, bytes: 74, level: 6 }
  ];

  var LVL_FA = {
    1: 'ساده',
    2: 'معمولی',
    3: 'قوی',
    4: 'سخت',
    5: 'فوق‌امن',
    6: 'افسانه‌ای'
  };

  var ADJ = [
    'سایه', 'شبتاب', 'مه‌شید', 'آذرخش', 'شباهنگ',
    'نیلوفر', 'ارغوان', 'فیروزه', 'عنقا', 'سیمرغ'
  ];

  var NOUN = [
    'رمز', 'ققنوس', 'سپهر', 'آینه', 'کلید',
    'نگهبان', 'ستاره', 'ماه', 'ستون', 'دژ'
  ];

  // ----------------------- hash -----------------------
  function cyrb53(str, seed) {
    var h1 = 0xdeadbeef ^ seed;
    var h2 = 0x41c6ce57 ^ seed;

    for (var i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }

    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
    h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);

    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
    h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);

    return 4294967296 * (2097151 & h2) + (h1 >>> 0);
  }

  // ----------------------- base64url -----------------------
  function b64uEncode(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) {
      bin += String.fromCharCode(bytes[i]);
    }
    return btoa(bin)
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  function b64uDecode(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // ----------------------- bytes <-> number -----------------------
  function bytesToNumber(bytes) {
    var n = 0n;
    for (var i = 0; i < bytes.length; i++) {
      n = (n << 8n) | BigInt(bytes[i]);
    }
    return n;
  }

  function numberToBytes(n, len) {
    var out = new Uint8Array(len);
    for (var i = len - 1; i >= 0; i--) {
      out[i] = Number(n & 255n);
      n >>= 8n;
    }
    return out;
  }

  // ----------------------- braille -----------------------
  function bytesToBraille(bytes) {
    // ساخت رشته‌ی بریل با chunking برای حافظه‌ی کارآمدتر
    var CHUNK = 0x8000;
    var parts = [];
    for (var i = 0; i < bytes.length; i += CHUNK) {
      var end = Math.min(i + CHUNK, bytes.length);
      var seg = '';
      for (var j = i; j < end; j++) {
        seg += String.fromCharCode(0x2800 + bytes[j]);
      }
      parts.push(seg);
    }
    return parts.join('');
  }

  function brailleToBytes(text) {
    var out = [];
    for (var ch of text) {
      var c = ch.codePointAt(0);
      if (c >= 0x2800 && c <= 0x28ff) {
        out.push(c - 0x2800);
      }
    }
    return Uint8Array.from(out);
  }

  // ----------------------- language -----------------------
  function makeLang(secretBytes, level, tokenStr, numericCode) {
    // کپی از secretBytes برای ایمنی (جلوگیری از تغییر خارجی)
    var safe = secretBytes.slice();

    var shortForHash = tokenStr.length > 4000
      ? tokenStr.slice(0, 4000) + '|len:' + tokenStr.length
      : tokenStr;

    var h1 = cyrb53(shortForHash, 7);
    var h2 = cyrb53(shortForHash, 17);

    var name =
      ADJ[h1 % ADJ.length] +
      ' ' +
      NOUN[h2 % NOUN.length] +
      ' ' +
      (100 + (h1 % 900));

    return {
      v: 3,
      tokenStr: tokenStr,
      name: name,
      level: level,
      bits: safe.length * 8,
      secretBytes: safe,
      numeric: numericCode || '',
      keyId: tokenStr.length <= 300
        ? tokenStr
        : 'long:' + h1 + ':' + h2 + ':' + tokenStr.length
    };
  }

  function makeToken(profile) {
    var bytes = crypto.getRandomValues(new Uint8Array(profile.bytes));
    return 'ZBA3.' + profile.id + '.' + b64uEncode(bytes);
  }

  function buildLanguageFromToken(v) {
    try {
      v = String(v == null ? '' : v).trim();

      if (!v) return null;
      if (v.length > MAX_TOKEN_CHARS) return null;

      // کد کوتاه عددی (حداکثر uint32)
      if (/^\d{1,10}$/.test(v)) {
        var n = BigInt(v);
        if (n > 4294967295n) return null;
        var bytes = numberToBytes(n, 4);
        return makeLang(bytes, 1, v, v);
      }

      // توکن نسخه‌ی جدید
      if (v.indexOf('ZBA3.') === 0) {
        var parts = v.split('.');
        if (parts.length !== 3) return null;

        var id = parseInt(parts[1], 10);
        var profile = null;

        for (var i = 0; i < PROFILES.length; i++) {
          if (PROFILES[i].id === id) profile = PROFILES[i];
        }

        if (!profile) return null;

        var secret = b64uDecode(parts[2]);
        if (secret.length !== profile.bytes) return null;

        return makeLang(secret, profile.level, v, '');
      }

      // Legacy / passphrase / token دلخواه
      var raw = T_enc.encode(v);
      if (!raw.length) return null;

      var level = 1;
      if (raw.length >= 64) level = 6;
      else if (raw.length >= 48) level = 5;
      else if (raw.length >= 32) level = 4;
      else if (raw.length >= 16) level = 3;
      else if (raw.length >= 8) level = 2;

      return makeLang(raw, level, v, '');
    } catch (e) {
      return null;
    }
  }

  function numericForm(lang) {
    if (!lang || !lang.secretBytes) return '';
    if (lang.level !== 1) return '';
    if (lang.secretBytes.length !== 4) return '';
    return bytesToNumber(lang.secretBytes).toString();
  }

  // ----------------------- key cache (LRU) -----------------------
  var keyCache = new Map();

  async function getKey(lang) {
    if (!crypto.subtle) {
      throw new Error('crypto.subtle unavailable');
    }

    if (keyCache.has(lang.keyId)) {
      // LRU: حذف و دوباره set تا به انتها برود
      var cached = keyCache.get(lang.keyId);
      keyCache.delete(lang.keyId);
      keyCache.set(lang.keyId, cached);
      return cached;
    }

    var ikm = lang.secretBytes;

    // اگر توکن/عبارت عبور خیلی طولانی بود، اول هش می‌شود.
    if (ikm.byteLength > 4096) {
      ikm = new Uint8Array(await crypto.subtle.digest('SHA-256', ikm));
    }

    var salt = T_enc.encode('Zabansaz Apex v3 salt');
    var info = T_enc.encode('Zabansaz Apex v3 AES-256-GCM');

    var baseKey = await crypto.subtle.importKey(
      'raw',
      ikm,
      'HKDF',
      false,
      ['deriveKey']
    );

    var key = await crypto.subtle.deriveKey(
      {
        name: 'HKDF',
        hash: 'SHA-256',
        salt: salt,
        info: info
      },
      baseKey,
      {
        name: 'AES-GCM',
        length: 256
      },
      false,
      ['encrypt', 'decrypt']
    );

    // مدیریت اندازه cache
    if (keyCache.size >= KEY_CACHE_MAX) {
      var oldest = keyCache.keys().next().value;
      keyCache.delete(oldest);
    }
    keyCache.set(lang.keyId, key);
    return key;
  }

  // ----------------------- cipher detection -----------------------
  function looksCipher(lang, text) {
    // lang در v3 استفاده می‌شد ولی برای تشخیص نیاز نیست؛ برای سازگاری نگه داشته شد.
    if (typeof text !== 'string') return false;

    var t = text.replace(/\s+/g, '');
    if (t.length < 8 || t.length > MAX_CIPHER_CHARS) return false;

    var brailleCount = 0;
    var len = t.length;

    for (var i = 0; i < len; i++) {
      var c = t.charCodeAt(i);
      if (c >= 0x2800 && c <= 0x28ff) brailleCount++;
    }

    return (brailleCount / len) >= 0.95;
  }

  // تشخیص بدون نیاز به زبان — برای فیلتر سریع
  function looksCipherAny(text) {
    return looksCipher(null, text);
  }

  // ----------------------- encrypt / decrypt -----------------------
  async function encryptBytes(lang, plainBytes) {
    if (!lang) throw new Error('no language');
    if (!plainBytes || plainBytes.byteLength === 0) throw new Error('empty');
    if (plainBytes.byteLength > MAX_PLAIN_BYTES) throw new Error('too large');

    var key = await getKey(lang);
    var iv = crypto.getRandomValues(new Uint8Array(IV_LEN));

    var ct = new Uint8Array(
      await crypto.subtle.encrypt(
        {
          name: 'AES-GCM',
          iv: iv,
          additionalData: MAGIC
        },
        key,
        plainBytes
      )
    );

    var out = new Uint8Array(MAGIC_LEN + IV_LEN + ct.length);
    out.set(MAGIC, 0);
    out.set(iv, MAGIC_LEN);
    out.set(ct, MAGIC_LEN + IV_LEN);

    return {
      text: bytesToBraille(out),
      bytes: out
    };
  }

  async function decryptGlyphs(lang, text) {
    try {
      if (!lang || typeof text !== 'string') {
        return { ok: false };
      }

      var cleaned = text.replace(/[^\u2800-\u28ff]/g, '');

      var minLen = MAGIC_LEN + IV_LEN + TAG_LEN;
      if (cleaned.length < minLen) {
        return { ok: false };
      }

      if (cleaned.length > MAX_CIPHER_CHARS) {
        return { ok: false };
      }

      var bytes = brailleToBytes(cleaned);

      for (var i = 0; i < MAGIC_LEN; i++) {
        if (bytes[i] !== MAGIC[i]) return { ok: false };
      }

      var iv = bytes.slice(MAGIC_LEN, MAGIC_LEN + IV_LEN);
      var data = bytes.slice(MAGIC_LEN + IV_LEN);

      var key = await getKey(lang);

      var plain = await crypto.subtle.decrypt(
        {
          name: 'AES-GCM',
          iv: iv,
          additionalData: MAGIC
        },
        key,
        data
      );

      return {
        ok: true,
        text: T_dec.decode(plain)
      };
    } catch (e) {
      return { ok: false };
    }
  }

  // رمزگشایی با چند زبان همزمان (مفید برای گروه‌ها).
  // اولین زبانی که موفق شود برمی‌گردد.
  async function decryptAny(langs, text) {
    if (!Array.isArray(langs) || !langs.length) return { ok: false };

    var cleaned = text.replace(/[^\u2800-\u28ff]/g, '');
    var minLen = MAGIC_LEN + IV_LEN + TAG_LEN;
    if (cleaned.length < minLen || cleaned.length > MAX_CIPHER_CHARS) {
      return { ok: false };
    }

    for (var i = 0; i < langs.length; i++) {
      var r = await decryptGlyphs(langs[i], text);
      if (r.ok) {
        return { ok: true, text: r.text, lang: langs[i] };
      }
    }

    return { ok: false };
  }

  // ----------------------- export -----------------------
  globalThis.T_enc = T_enc;
  globalThis.ZB_CIPHER_VERSION = 4;
  globalThis.PROFILES = PROFILES;
  globalThis.LVL_FA = LVL_FA;
  globalThis.makeToken = makeToken;
  globalThis.buildLanguageFromToken = buildLanguageFromToken;
  globalThis.numericForm = numericForm;
  globalThis.looksCipher = looksCipher;
  globalThis.looksCipherAny = looksCipherAny;
  globalThis.encryptBytes = encryptBytes;
  globalThis.decryptGlyphs = decryptGlyphs;
  globalThis.decryptAny = decryptAny;
})();
