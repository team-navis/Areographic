"""Minimal remote (HTTP range) TIFF/BigTIFF reader for uncompressed data. Stdlib + numpy."""
import struct, urllib.request, numpy as np
UA={'User-Agent':'Mozilla/5.0 research-client'}
class Remote:
    def __init__(s,url):
        s.url=url; s.n=0; s.bytes=0
        # resolve redirect once
        r=urllib.request.urlopen(urllib.request.Request(url,headers={**UA,'Range':'bytes=0-0'}),timeout=60); s.url=r.geturl(); r.read()
    def read(s,off,ln):
        r=urllib.request.urlopen(urllib.request.Request(s.url,headers={**UA,'Range':f'bytes={off}-{off+ln-1}'}),timeout=120)
        b=r.read(); s.n+=1; s.bytes+=len(b); assert len(b)==ln,(len(b),ln); return b
TYPES={1:'B',2:'c',3:'H',4:'I',5:'II',6:'b',7:'B',8:'h',9:'i',10:'ii',11:'f',12:'d',16:'Q',17:'q',18:'Q'}
def parse(src):
    h=src.read(0,16); bo='<' if h[:2]==b'II' else '>'
    magic=struct.unpack(bo+'H',h[2:4])[0]; big=magic==43
    if big: off=struct.unpack(bo+'Q',h[8:16])[0]
    else: off=struct.unpack(bo+'I',h[4:8])[0]
    if big:
        n=struct.unpack(bo+'Q',src.read(off,8))[0]; ent=src.read(off+8,n*20); es=20
    else:
        n=struct.unpack(bo+'H',src.read(off,2))[0]; ent=src.read(off+2,n*12); es=12
    tags={}
    for i in range(n):
        e=ent[i*es:(i+1)*es]
        if big: tag,typ,cnt=struct.unpack(bo+'HHQ',e[:12]); val=e[12:20]; inl=8
        else: tag,typ,cnt=struct.unpack(bo+'HHI',e[:8]); val=e[8:12]; inl=4
        f=TYPES[typ]; sz=struct.calcsize(f)*cnt
        tags[tag]=(typ,cnt,val,sz,inl)
    def get(tag,maxcnt=10**9):
        if tag not in tags: return None
        typ,cnt,val,sz,inl=tags[tag]; f=TYPES[typ]
        if sz<=inl: raw=val[:sz]
        else:
            o=struct.unpack(bo+('Q' if big else 'I'),val[:inl])[0]; raw=src.read(o,sz)
        if typ==2: return raw.decode('latin1').rstrip('\0')
        return struct.unpack(bo+f*cnt,raw)
    return dict(bo=bo,big=big,get=get,tags=tags)
def info(t):
    g=t['get']; d={}
    d['w']=g(256)[0]; d['h']=g(257)[0]; d['bps']=g(258); d['comp']=g(259)[0]; d['spp']=(g(277) or (1,))[0]
    d['fmt']=(g(339) or (1,))[0]; d['scale']=g(33550); d['tie']=g(33922); d['nodata']=g(42113); d['geoascii']=g(34737); d['geodbl']=g(34736)
    d['tiled']=322 in t['tags']
    if d['tiled']: d['tw']=g(322)[0]; d['th']=g(323)[0]
    else: d['rps']=(g(278) or (d['h'],))[0]
    return d
def window(src,t,d,c0,r0,w,h):
    g=t['get']; bo=t['bo']; assert d['comp']==1,'compressed'
    bps=d['bps'][0]; dt={(8,1):'u1',(16,1):'u2',(16,2):'i2',(32,3):'f4',(32,1):'u4'}[(bps,d['fmt'])]
    dt=np.dtype(dt).newbyteorder(bo); B=bps//8*d['spp']
    out=np.zeros((h,w,d['spp']),dtype=dt.newbyteorder('='))
    if d['tiled']:
        offs=g(324); tw,th=d['tw'],d['th']; tpr=(d['w']+tw-1)//tw
        for ty in range(r0//th,(r0+h-1)//th+1):
            for tx in range(c0//tw,(c0+w-1)//tw+1):
                raw=src.read(offs[ty*tpr+tx],tw*th*B); a=np.frombuffer(raw,dtype=dt).reshape(th,tw,d['spp'])
                y0=max(r0,ty*th); y1=min(r0+h,(ty+1)*th); x0=max(c0,tx*tw); x1=min(c0+w,(tx+1)*tw)
                out[y0-r0:y1-r0,x0-c0:x1-c0]=a[y0-ty*th:y1-ty*th,x0-tx*tw:x1-tx*tw]
    else:
        offs=g(273); rps=d['rps']
        for r in range(r0,r0+h):
            s=r//rps; o=offs[s]+((r-s*rps)*d['w']+c0)*B
            out[r-r0]=np.frombuffer(src.read(o,w*B),dtype=dt).reshape(w,d['spp'])
    return out[:,:,0] if d['spp']==1 else out
