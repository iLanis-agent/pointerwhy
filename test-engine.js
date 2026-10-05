// node test-engine.js file.jsonl ...: engine vs Python jsonpointer 3.1.1 on generated documents and pointers (oracle.py).
const P = require('./engine.js'), fs = require('fs');
function canon(v) { if (Array.isArray(v)) return '[' + v.map(canon).join(',') + ']'; if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + canon(v[k])).join(',') + '}'; return JSON.stringify(v); }
let n = 0, ok = 0, okV = 0, skipped = 0, mism = []; const sk = {};
for (const f of process.argv.slice(2)) for (const l of fs.readFileSync(f, 'utf8').split('\n').filter(Boolean)) {
  const r = JSON.parse(l); n++;
  let eng;
  const d = P.parseJson(r.doc), a = P.parsePointer(r.ptr, r.mode);
  if (!a.ok) eng = { res: 'err' }; else { const e = P.evaluate(d.value, a.tokens, a.raw); eng = e.ok ? { res: 'ok', val: canon(e.value) } : { res: 'err' }; }
  if (r.res === 'skip') { skipped++; sk[r.val] = (sk[r.val] || 0) + 1; continue; }
  const want = r.res === 'ok' ? canon(JSON.parse(r.val)) : null;
  if (eng.res === 'ok') okV++;
  if (eng.res === r.res && eng.val === (want === null ? undefined : want)) ok++;
  else mism.push({ doc: r.doc.slice(0, 200), ptr: r.ptr, mode: r.mode, oracle: r.res, want, engine: eng });
}
console.log(JSON.stringify({ cases: n, comparedCases: n - skipped, agree: ok, resolvedByEngine: okV, mismatches: mism.length, skippedOracleDeviations: sk }));
mism.slice(0, +process.env.SHOW || 0).forEach(m => console.log(JSON.stringify(m)));
process.exit(mism.length ? 1 : 0);
