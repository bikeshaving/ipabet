#!/usr/bin/env python3
# Reconstruct the JSON view of the mapping from the LDML source, for the website
# and the /ipabet.json endpoint. ipabet.xml is the source; this is a generated
# artifact. Python because it needs Unicode names (JS has no UCD names).
#
#   python3 spec/tools/ldml-to-json.py > spec/ipabet.gen.json
#
# Verify with --check: diffs the site-used fields against the old spec/ipabet.json.

import sys, re, json, unicodedata as ud
import xml.etree.ElementTree as ET

HERE = __file__.rsplit('/', 1)[0]
XML = f"{HERE}/../ipabet.xml"

def local(tag): return tag.rsplit('}', 1)[-1]
root = ET.parse(XML).getroot()
def all_(t): return [e for e in root.iter() if local(e.tag) == t]

keys = {e.get('id'): (e.get('output') or '') for e in all_('key')}
layers = {}
for layer in all_('layer'):
    layers[layer.get('modifiers')] = [r.get('keys').split() for r in layer if local(r.tag) == 'row']
transforms = [(e.get('from'), e.get('to')) for e in all_('transform')]
sets = {e.get('id'): e.get('value').split() for e in all_('set')}

# marker name -> combining char, from each dead-key rule
marker_char = {}
for f, t in transforms:
    m = re.match(r'^\\m\{([^}]+)\}\(\.\)$', f)
    u = re.match(r'^\$1\\u\{([0-9A-Fa-f]+)\}$', t or '')
    if m and u:
        marker_char[m.group(1)] = chr(int(u.group(1), 16))

names = {n.get('cp'): n.get('text') for n in all_('name')}
def name(g):
    return names.get(' '.join('%04x' % ord(c) for c in g), '')

def cps(g):
    return ' '.join('U+%04X' % ord(c) for c in g)

# ---- letters ----
nonipa = set((all_('nonipa')[0].get('glyphs') if all_('nonipa') else '').split())
letters = []
for c in 'abcdefghijklmnopqrstuvwxyz':
    if f'b_{c}' in keys:
        g = keys[f'b_{c}']; e = {'key': c, 'glyph': g, 'cp': cps(g), 'name': name(g)}
        if g in nonipa: e['ipa'] = False
        letters.append(e)
for f, t in transforms:
    if '(\\p{M}*)' not in f: continue
    base = f[:f.index('(')]
    if not re.match(r'^[a-z0-9]$', base): continue
    op = f[f.index(')') + 1:]
    g = re.sub(r'\$1$', '', t)
    e = {'key': base + op, 'glyph': g, 'cp': cps(g), 'name': name(g)}
    if g in nonipa: e['ipa'] = False
    letters.append(e)

# ---- marks ----
ROWS = ['`1234567890-=', 'qwertyuiop[]\\', "asdfghjkl;'", 'zxcvbnm,./']
def grid(layer):
    out = {}
    for ri, ids in enumerate(layers.get(layer, [])):
        for ci, kid in enumerate(ids):
            if ci < len(ROWS[ri]): out[ROWS[ri][ci]] = kid
    return out
altR, altRS = grid('altR'), grid('altR shift')
def char_of(kid):
    if kid.startswith('mk_'): return marker_char.get(kid[3:])
    if kid.startswith('sp_'): return keys.get(kid)
    return None
disp = {}
for d in all_('display'):
    mm = re.match(r'^\\m\{([^}]+)\}$', d.get('output') or '')
    if mm: disp[mm.group(1)] = d.get('display')
cyc = {c.get('marker'): c.get('family').split() for c in all_('cycle')}
def fam(nm): return [marker_char[n] for n in cyc.get(nm, [])[1:] if n in marker_char]
excl = {p.get('a') for p in all_('pair')}
ann = {a.get('cp'): a for a in all_('mark')}   # editorial tags keyed by cp

marks = []
for phys, kid in altR.items():
    if not (kid.startswith('mk_') or kid.startswith('sp_')): continue
    nm = kid[3:]; combining = kid.startswith('mk_')
    ch = char_of(kid)
    if ch is None: continue
    e = {'opt': phys, 'mark': ch, 'type': 'combining' if combining else 'spacing',
         'cp': cps(ch), 'name': name(ch)}
    did = altRS.get(phys)
    if did and (did.startswith('mk_') or did.startswith('sp_')):
        e['double'] = char_of(did); e['doubleCp'] = cps(e['double'])
        if did.startswith('sp_'): e['doubleSpacing'] = True
        if did.startswith('mk_') and disp.get(did[3:]): e['doubleClone'] = disp[did[3:]]
        if fam(did[3:]): e['doubleCycle'] = fam(did[3:]); e['doubleCycleCp'] = [cps(c) for c in fam(did[3:])]
    if combining and disp.get(nm): e['clone'] = disp[nm]
    if fam(nm): e['cycle'] = fam(nm); e['cycleCp'] = [cps(c) for c in fam(nm)]
    if nm in excl: e['exclusive'] = True
    tag = ann.get(f'{ord(ch):04x}')
    if tag is not None:
        e['group'] = tag.get('group')
        if tag.get('shiftSense'): e['shiftSense'] = tag.get('shiftSense')
        if tag.get('ipa') == 'false': e['ipa'] = False
        if tag.get('beyond'): e['beyond'] = tag.get('beyond')
        if tag.get('arbitraryKey'): e['arbitraryKey'] = True
    marks.append(e)

# ---- modifiers, classes, sup/sub, optShift, quotes ----
modifiers = {m.get('key'): m.get('meaning') for m in all_('modifier')}
classes = {}
for t in all_('term'):
    cat, tid, note = t.get('cat'), t.get('id'), t.get('note')
    if cat == 'classes': classes[tid] = note
    else: classes.setdefault(cat, {})[tid] = note
pr = all_('prose')[0] if all_('prose') else None
def prose(a): return pr.get(a) if pr is not None else ''
superscripts = {'operator': prose('supOperator'), 'table': [{'base': b, 'sup': s} for b, s in zip(sets['sup_in'], sets['sup_out'])], 'rule': prose('supRule')}
subscripts = {'operator': prose('subOperator'), 'table': [{'base': b, 'sub': s} for b, s in zip(sets['sub_in'], sets['sub_out'])], 'rule': prose('subRule')}
optShift = {'about': prose('optShiftAbout'), **{kid[3:]: out for kid, out in keys.items() if re.match(r'^os_\d$', kid)}}
locales = {}
for l in all_('locale'):
    locales[l.get('id')] = [l.get('open1'), l.get('close1'), l.get('open2'), l.get('close2')]
qdef = all_('quotes')[0].get('default') if all_('quotes') else 'en'

spec = {'modifiers': modifiers, 'letters': letters, 'marks': marks,
        'superscripts': superscripts, 'subscripts': subscripts, 'classes': classes,
        'optShift': optShift, 'quotes': {'about': prose('quotesAbout'), 'default': qdef, 'locales': locales}}


if __name__ == '__main__':
    if '--check' in sys.argv:
        a = json.load(open(f'{HERE}/../ipabet.json'))
        # the fields the website actually reads
        def L(s): return {e['key']: {k: e.get(k) for k in ('glyph', 'name', 'ipa')} for e in s['letters']}
        def M(s): return {m['opt']: {k: m.get(k) for k in ('mark', 'type', 'double', 'cycle', 'doubleCycle', 'name', 'doubleClone', 'exclusive', 'ipa', 'beyond', 'shiftSense', 'arbitraryKey')} for m in s['marks']}
        diffs = 0
        for label, fa, fb in [('letters', L(a), L(spec)), ('marks', M(a), M(spec))]:
            for k in set(fa) | set(fb):
                if fa.get(k) != fb.get(k):
                    diffs += 1
                    if diffs <= 20: print(f"{label} {k!r}: {fa.get(k)} != {fb.get(k)}", file=sys.stderr)
        for label in ('modifiers', 'optShift'):
            if a[label] != spec[label] and not (label == 'optShift'):
                pass
        if a['modifiers'] != spec['modifiers']: print("modifiers differ", file=sys.stderr); diffs += 1
        if {k: v for k, v in a['optShift'].items() if k != 'about'} != spec['optShift']: print("optShift differ", file=sys.stderr); diffs += 1
        if a['classes'].get('beyond') != spec['classes'].get('beyond'): print("classes.beyond differ", file=sys.stderr); diffs += 1
        if a['superscripts']['table'] != spec['superscripts']['table']: print("superscripts.table differ", file=sys.stderr); diffs += 1
        if a['subscripts']['table'] != spec['subscripts']['table']: print("subscripts.table differ", file=sys.stderr); diffs += 1
        print(f"site-used field diffs: {diffs}", file=sys.stderr)
        sys.exit(1 if diffs else 0)
    json.dump(spec, sys.stdout, ensure_ascii=False, indent=1)
    sys.stdout.write('\n')
