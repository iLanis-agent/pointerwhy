/* PointerWhy engine: RFC 6901 JSON Pointer syntax, evaluation (section 4), string and URI-fragment forms (sections 5, 6). */
(function (root) {
  'use strict';
  var HAS = Object.prototype.hasOwnProperty;

  /* strict RFC 8259 JSON parser that also records duplicate member names */
  function parseJson(src) {
    var i = 0, n = src.length, dups = [];
    function pos() { var l = 1, c = 1; for (var k = 0; k < i && k < n; k++) { if (src[k] === '\n') { l++; c = 1; } else c++; } return 'line ' + l + ', column ' + c; }
    function err(m) { var e = new Error(m + ' (' + pos() + ')'); e.jsonError = true; throw e; }
    function ws() { while (i < n && (src[i] === ' ' || src[i] === '\t' || src[i] === '\n' || src[i] === '\r')) i++; }
    function str() {
      i++; var out = '';
      for (;;) {
        if (i >= n) err('Unterminated string');
        var c = src[i];
        if (c === '"') { i++; return out; }
        if (c.charCodeAt(0) < 0x20) err('Control character in string');
        if (c === '\\') {
          var e = src[i + 1];
          if (e === 'u') { var h = src.substr(i + 2, 4); if (!/^[0-9A-Fa-f]{4}$/.test(h)) err('Bad \\u escape'); out += String.fromCharCode(parseInt(h, 16)); i += 6; }
          else { var m = { '"': '"', '\\': '\\', '/': '/', b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }[e]; if (m === undefined) err('Bad escape \\' + (e || '')); out += m; i += 2; }
        } else { out += c; i++; }
      }
    }
    function val(path) {
      ws(); var c = src[i];
      if (c === '{') {
        i++; var o = Object.create(null); ws();
        if (src[i] === '}') { i++; return o; }
        for (;;) {
          ws(); if (src[i] !== '"') err('Expected a string member name');
          var k = str(); ws(); if (src[i] !== ':') err('Expected ":"'); i++;
          if (HAS.call(o, k)) dups.push({ path: path, key: k });
          o[k] = val(path + '/' + k.replace(/~/g, '~0').replace(/\//g, '~1')); ws();
          if (src[i] === ',') { i++; continue; }
          if (src[i] === '}') { i++; return o; }
          err('Expected "," or "}"');
        }
      }
      if (c === '[') {
        i++; var a = []; ws();
        if (src[i] === ']') { i++; return a; }
        for (;;) { a.push(val(path + '/' + a.length)); ws(); if (src[i] === ',') { i++; continue; } if (src[i] === ']') { i++; return a; } err('Expected "," or "]"'); }
      }
      if (c === '"') return str();
      var m = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?/.exec(src.slice(i, i + 400));
      if (m) { i += m[0].length; return parseFloat(m[0]); }
      if (src.substr(i, 4) === 'true') { i += 4; return true; }
      if (src.substr(i, 5) === 'false') { i += 5; return false; }
      if (src.substr(i, 4) === 'null') { i += 4; return null; }
      err(i >= n ? 'Unexpected end of input' : 'Unexpected character "' + c + '"');
    }
    var v = val(''); ws(); if (i < n) err('Extra content after the JSON value');
    return { value: v, dups: dups };
  }

  var SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/;
  function unescapeToken(t) { return t.replace(/~1/g, '/').replace(/~0/g, '~'); }
  function escapeToken(k) { return String(k).replace(/~/g, '~0').replace(/\//g, '~1'); }
  var FRAG_OK = /[A-Za-z0-9\-._~!$&'()*+,;=:@\/?]/;
  function encodeFragment(ptr) {
    var out = '', bytes = new TextEncoder().encode(ptr);
    for (var k = 0; k < bytes.length; k++) { var ch = String.fromCharCode(bytes[k]); if (bytes[k] < 128 && FRAG_OK.test(ch)) out += ch; else out += '%' + (bytes[k] < 16 ? '0' : '') + bytes[k].toString(16).toUpperCase(); }
    return '#' + out;
  }
  function decodeFragment(s) {
    var body = s.slice(1), bytes = [], warn = [];
    for (var k = 0; k < body.length; k++) {
      var c = body[k];
      if (c === '%') { var h = body.substr(k + 1, 2); if (!/^[0-9A-Fa-f]{2}$/.test(h)) return { err: 'A "%" in a URI fragment must be followed by two hex digits (a literal % is written %25)' }; bytes.push(parseInt(h, 16)); k += 2; }
      else { var enc = new TextEncoder().encode(c); for (var q = 0; q < enc.length; q++) bytes.push(enc[q]); if (enc.length > 1 || !FRAG_OK.test(c)) { var shown = c === ' ' ? 'a space' : '"' + c + '"'; if (warn.indexOf(shown) < 0) warn.push(shown); } }
    }
    try { return { text: new TextDecoder('utf-8', { fatal: true }).decode(new Uint8Array(bytes)), warn: warn }; }
    catch (e) { return { err: 'The percent-encoded bytes are not valid UTF-8, so they cannot be turned into characters' }; }
  }

  /* mode: 'string' (JSON string representation, section 5) or 'fragment' (section 6) */
  function parsePointer(input, mode) {
    var warn = [], text = input;
    if (mode === 'fragment') {
      if (input[0] !== '#') return { ok: false, err: 'The URI fragment form starts with "#" (for example #/foo/0).', warn: warn };
      var d = decodeFragment(input); if (d.err) return { ok: false, err: d.err, warn: warn };
      text = d.text;
      if (d.warn.length) warn.push('The fragment contains ' + d.warn.join(', ') + ' unencoded. Section 6 asks for those to be percent-encoded; the pointer is still read as written.');
    }
    if (text === '') return { ok: true, tokens: [], raw: [], warn: warn };
    if (text[0] !== '/') {
      var hint = '';
      if (mode === 'string' && text[0] === '#') hint = ' This looks like the URI fragment form: switch the mode to "URI fragment", or remove the "#".';
      else if (text[0] === '$') hint = ' This looks like JSONPath. A JSON Pointer writes $.a.b[0] as /a/b/0.';
      else if (/[.\[]/.test(text)) hint = ' Pointers separate steps with "/" (write /a/b/0, not a.b[0]).';
      else hint = ' Write /' + text + ' to select the member "' + text + '".';
      return { ok: false, err: 'A non-empty pointer must start with "/".' + hint, warn: warn };
    }
    var raw = text.slice(1).split('/'), tokens = [];
    for (var k = 0; k < raw.length; k++) {
      var bad = /~(?![01])/.exec(raw[k]);
      if (bad) { var at = bad.index; return { ok: false, err: 'Invalid escape in step ' + (k + 1) + ' ("' + raw[k] + '"): "~" must be followed by 0 (for ~) or 1 (for /)' + (at === raw[k].length - 1 ? ', but it ends the step.' : ', found "~' + raw[k][at + 1] + '".') + ' A literal "~" is written ~0.', warn: warn }; }
      tokens.push(unescapeToken(raw[k]));
    }
    return { ok: true, tokens: tokens, raw: raw, warn: warn };
  }

  var ARRAY_INDEX = /^(0|[1-9][0-9]*)$/;
  function kindOf(v) { return v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'object' ? 'object' : typeof v; }

  function evaluate(doc, tokens, raw) {
    var cur = doc, steps = [];
    for (var k = 0; k < tokens.length; k++) {
      var t = tokens[k], kind = kindOf(cur), st = { raw: raw[k], token: t, into: kind, ok: false, note: '' };
      steps.push(st);
      if (kind === 'object') {
        if (HAS.call(cur, t)) { st.ok = true; st.note = 'member "' + t + '"'; cur = cur[t]; continue; }
        var keys = Object.keys(cur), hint = '';
        for (var j = k + 1; j <= tokens.length && !hint; j++) { var joined = tokens.slice(k, j).join('/'); if (j - k > 1 && HAS.call(cur, joined)) hint = ' The object has a member named "' + joined + '" - a "/" inside a name is written ~1, so use "/' + raw.slice(0, k).concat([escapeToken(joined)]).join('/').replace(/^\//, '') + (j < tokens.length ? '/' + raw.slice(j).join('/') : '') + '".'; }
        if (!hint) { var lower = keys.filter(function (x) { return x.toLowerCase() === t.toLowerCase(); })[0]; if (lower !== undefined) hint = ' Member names are case-sensitive; there is "' + lower + '".'; }
        if (!hint) { var trimmed = keys.filter(function (x) { return x.trim() === t.trim() && x !== t; })[0]; if (trimmed !== undefined) hint = ' A member named "' + trimmed + '" exists but differs in surrounding spaces.'; }
        if (!hint && ARRAY_INDEX.test(t) === false && keys.length) hint = ' Members here: ' + keys.slice(0, 8).map(function (x) { return '"' + x + '"'; }).join(', ') + (keys.length > 8 ? ', ...' : '') + '.';
        st.note = 'no member named "' + t + '".' + hint; return { ok: false, steps: steps, failAt: k };
      }
      if (kind === 'array') {
        if (t === '-') { st.note = '"-" names the position after the last element (index ' + cur.length + '), which does not exist, so reading it is always an error.'; return { ok: false, steps: steps, failAt: k }; }
        if (!ARRAY_INDEX.test(t)) {
          var why = /^[0-9]+$/.test(t) ? 'leading zeros are not allowed in an array index (use ' + String(parseInt(t, 10)) + ')' : /^[+-]?[0-9]+$/.test(t) ? 'signs are not allowed in an array index' : 'an array step must be digits or "-"';
          st.note = '"' + t + '" is not a valid array index: ' + why + '.'; return { ok: false, steps: steps, failAt: k };
        }
        var idx = Number(t);
        if (idx >= cur.length) { st.note = 'index ' + t + ' is out of range; the array has ' + cur.length + ' element' + (cur.length === 1 ? '' : 's') + (cur.length ? ' (0 to ' + (cur.length - 1) + ')' : '') + '.'; return { ok: false, steps: steps, failAt: k }; }
        st.ok = true; st.note = 'element ' + t; cur = cur[idx]; continue;
      }
      st.note = 'cannot step into ' + (kind === 'null' ? 'null' : 'a ' + kind) + '; only objects and arrays have children.'; return { ok: false, steps: steps, failAt: k };
    }
    return { ok: true, steps: steps, value: cur };
  }

  function listPointers(v, limit) {
    var out = [];
    (function walk(x, p) { if (out.length >= limit) return; out.push(p); if (Array.isArray(x)) x.forEach(function (e, i) { walk(e, p + '/' + i); }); else if (x && typeof x === 'object') Object.keys(x).forEach(function (k) { walk(x[k], p + '/' + escapeToken(k)); }); })(v, '');
    return out;
  }

  var api = { parseJson: parseJson, parsePointer: parsePointer, evaluate: evaluate, escapeToken: escapeToken, unescapeToken: unescapeToken, encodeFragment: encodeFragment, decodeFragment: decodeFragment, listPointers: listPointers, kindOf: kindOf };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PointerWhy = api;
})(typeof window !== 'undefined' ? window : globalThis);
