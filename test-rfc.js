// Examples quoted from RFC 6901 sections 5 and 6 (fetched in full from rfc-editor.org), plus JSON parser agreement with JSON.parse.
const P = require('./engine.js'); let bad = 0;
function ok(n, c) { if (!c) { bad++; console.log('FAIL', n); } }
const doc = P.parseJson(`{"foo":["bar","baz"],"":0,"a/b":1,"c%d":2,"e^f":3,"g|h":4,"i\\\\j":5,"k\\"l":6," ":7,"m~n":8}`).value;
const S = [['', 'whole'], ['/foo', ['bar', 'baz']], ['/foo/0', 'bar'], ['/', 0], ['/a~1b', 1], ['/c%d', 2], ['/e^f', 3], ['/g|h', 4], ['/i\\j', 5], ['/k"l', 6], ['/ ', 7], ['/m~0n', 8]];
const F = ['#', '#/foo', '#/foo/0', '#/', '#/a~1b', '#/c%25d', '#/e%5Ef', '#/g%7Ch', '#/i%5Cj', '#/k%22l', '#/%20', '#/m~0n'];
S.forEach(([p, want], i) => {
  const a = P.parsePointer(p, 'string'), r = P.evaluate(doc, a.tokens, a.raw);
  ok('string ' + p, a.ok && r.ok && (want === 'whole' ? r.value === doc : JSON.stringify(r.value) === JSON.stringify(want)));
  const b = P.parsePointer(F[i], 'fragment'), r2 = P.evaluate(doc, b.tokens, b.raw);
  ok('fragment ' + F[i], b.ok && r2.ok && r2.value === r.value);
  ok('encodeFragment ' + p, P.encodeFragment(p) === F[i]);
});
ok('~01 becomes ~1 not /', P.parsePointer('/~01', 'string').tokens[0] === '~1');
ok('~10 becomes /0', P.parsePointer('/~10', 'string').tokens[0] === '/0');
// ABNF: unescaped excludes only / and ~
ok('bad escape ~2', !P.parsePointer('/a~2', 'string').ok);
ok('trailing ~', !P.parsePointer('/a~', 'string').ok);
// JSON parser agrees with JSON.parse on accept/reject for a small corpus
const corpus = ['{}', '[]', '[1,]', '{"a":1,}', '01', '1.', '.5', '-0', '1e5', '"\\x"', '"a\nb"', "{'a':1}", 'nul', 'true', ' [ 1 , 2 ] ', '[1 2]', '{"a" 1}', '"\\u12"', '"\\ud800"', '', '  ', '{"a":{"b":[null,false,1.5e-3]}}', '[1]]', '+1', 'NaN', '"\t"'];
corpus.forEach(s => { let a = true, b = true; try { JSON.parse(s); } catch (e) { a = false; } try { P.parseJson(s); } catch (e) { b = false; } ok('json ' + JSON.stringify(s), a === b); });
ok('dups', P.parseJson('{"a":1,"a":2,"b":{"c":1,"c":2}}').dups.length === 2);
ok('__proto__ key is a plain member', P.evaluate(P.parseJson('{"__proto__":5}').value, ['__proto__'], ['__proto__']).value === 5);
console.log(bad ? 'FAILED ' + bad : 'all RFC cases pass');
process.exit(bad ? 1 : 0);
