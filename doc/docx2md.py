import zipfile,sys
from xml.etree import ElementTree as ET
W='{http://schemas.openxmlformats.org/wordprocessingml/2006/main}'
def para_text(p):
    out=[]
    for n in p.iter():
        if n.tag==W+'t': out.append(n.text or '')
        elif n.tag==W+'tab': out.append('\t')
        elif n.tag==W+'br': out.append('\n')
    return ''.join(out)
def style(p):
    pr=p.find(W+'pPr')
    if pr is None: return ''
    s=pr.find(W+'pStyle')
    return s.get(W+'val') if s is not None else ''
def walk(el,depth=0):
    for ch in el:
        if ch.tag==W+'p':
            t=para_text(ch)
            st=style(ch)
            if not t.strip(): continue
            if st.startswith('Heading') or st.startswith('Title'):
                lvl=st.replace('Heading','').replace('Title','1')
                try: lvl=int(lvl)
                except: lvl=1
                print('\n'+'#'*lvl+' '+t)
            else:
                print(t)
        elif ch.tag==W+'tbl':
            print('\n[TABLE]')
            for tr in ch.findall(W+'tr'):
                cells=[]
                for tc in tr.findall(W+'tc'):
                    cells.append(' '.join(para_text(p).strip() for p in tc.findall(W+'p')).strip())
                print(' | '.join(cells))
            print('[/TABLE]\n')
z=zipfile.ZipFile(sys.argv[1])
root=ET.fromstring(z.read('word/document.xml'))
body=root.find(W+'body')
walk(body)
