# Generates (document, pointer) cases and resolves them with the Python jsonpointer package (3.1.1).
import random, json, sys, re
from urllib.parse import quote, unquote
import jsonpointer
seed=int(sys.argv[1]); N=int(sys.argv[2]); random.seed(seed)
KEYS=['','a','b','a/b','m~n','~0','~1','~01','~10','01','0','1','10','-',' ','é','日本','c%d','e^f','k"l','i\\j','foo','Foo','foo ','x/y/z','//','~','/','__proto__','constructor','length']
def scalar(): return random.choice([0,1,-5,3.5,True,False,None,'','s','bar','0','é'])
def gen(depth):
    r=random.random()
    if depth>=3 or r<.25: return scalar()
    if r<.6: return [gen(depth+1) for _ in range(random.choice([0,1,2,3,12]))]
    return {k:gen(depth+1) for k in random.sample(KEYS,random.choice([0,1,2,4,6]))}
def esc(t): return t.replace('~','~0').replace('/','~1')
def walk(d):
    toks=[]
    while True:
        if isinstance(d,dict) and d and random.random()<.85:
            k=random.choice(list(d)); toks.append(k); d=d[k]
        elif isinstance(d,list) and d and random.random()<.85:
            i=random.randrange(len(d)); toks.append(str(i)); d=d[i]
        else: return toks
def mutate(toks):
    t=list(toks); r=random.random()
    if r<.5 or not t: return t
    i=random.randrange(len(t))
    m=random.choice(['lead0','dash','extra','big','case','plus','float','space','join','drop','dup'])
    if m=='lead0': t[i]='0'+t[i]
    elif m=='dash': t[i]='-'
    elif m=='extra': t.append(random.choice(KEYS+['0','-']))
    elif m=='big': t[i]=str(random.choice([5,12,99,10**25]))
    elif m=='case': t[i]=t[i].swapcase()
    elif m=='plus': t[i]='+'+t[i]
    elif m=='float': t[i]=t[i]+'.0'
    elif m=='space': t[i]=' '+t[i]
    elif m=='join' and i+1<len(t): t[i:i+2]=['/'.join(t[i:i+2])]
    elif m=='drop': t.pop(i)
    elif m=='dup': t.insert(i,t[i])
    return t
def pointer_text(toks):
    s=''.join('/'+esc(t) for t in toks)
    r=random.random()
    if r<.03: s=s[1:]
    elif r<.05: s+='~'
    elif r<.07: s=s.replace('~0','~2',1) if '~0' in s else s+'~2'
    elif r<.08: s='$'+s.replace('/','.')
    return s
def frag(p):
    r=random.random()
    if r<.7: return '#'+quote(p,safe="-._~!$&'()*+,;=:@/?")
    if r<.8: return '#'+p                      # raw, unencoded characters
    if r<.85: return p                         # missing '#'
    if r<.9: return '#'+quote(p,safe="-._~!$&'()*+,;=:@/?")+'%'
    if r<.93: return '#'+quote(p,safe="-._~!$&'()*+,;=:@/?")+'%zz'
    if r<.96: return '#/%ff%fe'
    return '#'+quote(p,safe="-._~!$&'()*+,;=:@/?").lower()
def resolve(doc,p):
    """returns ('ok',value) | ('err',None) | ('skip',reason)"""
    try:
        jp=jsonpointer.JsonPointer(p)
    except Exception: return ('err',None)
    cur=doc
    for part in jp.parts:
        if isinstance(cur,str): return ('skip','string-descent')   # jsonpointer indexes into strings; RFC 6901 does not
        try:
            cur=jp.walk(cur,part)
        except Exception: return ('err',None)
        if isinstance(cur,jsonpointer.EndOfList): return ('err',None)
    return ('ok',cur)
def fragtext(f):
    if not f.startswith('#'): return None
    body=f[1:]
    if re.search(r'%(?![0-9A-Fa-f]{2})',body): return None
    try: return unquote(body,errors='strict')
    except Exception: return None
out=open(sys.argv[3],'w')
for _ in range(N):
    doc=gen(0)
    if not isinstance(doc,(dict,list)): doc={'a':doc}
    p=pointer_text(mutate(walk(doc)))
    mode='string' if random.random()<.6 else 'fragment'
    inp=p
    if mode=='fragment':
        inp=frag(p)
        t=fragtext(inp)
        res=('err',None) if t is None else resolve(doc,t)
    else: res=resolve(doc,p)
    out.write(json.dumps({'doc':json.dumps(doc,ensure_ascii=random.random()<.5),'ptr':inp,'mode':mode,'res':res[0],'val':json.dumps(res[1]) if res[0]=='ok' else res[1] if res[0]=='skip' else None})+'\n')
