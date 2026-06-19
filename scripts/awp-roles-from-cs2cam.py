#!/usr/bin/env python3
"""
Corrige as roles de AWP em src/data/bo3-2026.json usando a API da cs2.cam como
fonte (papel "Awper" por mapa/lado). IGL NÃO vem dessa API (os papéis são
posicionais), então só o AWP é tratado aqui.

Uso:
  CS2CAM_API_KEY=xxxxx python3 scripts/awp-roles-from-cs2cam.py          # dry-run (só mostra o diff)
  CS2CAM_API_KEY=xxxxx python3 scripts/awp-roles-from-cs2cam.py --apply  # aplica no JSON

Regras:
- awp_share de um jogador = fração das aparições de mapa/lado em que a role é "Awper".
- O AWPer do time = jogador casado (por nick) com maior share >= 0.5.
- Ao promover o AWPer real, troca o stat `awp` com o AWP antigo (coerência) e, se o
  novo AWPer era o IGL, o jogador rebaixado assume o IGL (mantém o slot + stat igl).
"""
import json, os, re, sys, urllib.request

API = 'https://cs2.cam/filters-api/public/teams-players-roles?months=12&min_maps=2'
DATA = os.path.join(os.path.dirname(__file__), '..', 'src', 'data', 'bo3-2026.json')


def norm(n: str) -> str:
    return re.sub(r'\s+', '', n.strip().lower())


def fetch_awp_shares(key: str) -> dict:
    req = urllib.request.Request(API, headers={'X-API-Key': key, 'Accept-Encoding': 'gzip'})
    import gzip
    with urllib.request.urlopen(req, timeout=120) as r:
        raw = r.read()
        if r.headers.get('Content-Encoding') == 'gzip':
            raw = gzip.decompress(raw)
    cs = json.loads(raw)
    shares: dict = {}
    for team in cs.get('teams', []):
        for p in team['players']:
            total = awpc = 0
            for m in p['maps']:
                n = m.get('total_maps', 1)
                total += 2 * n
                for side in ('t_role', 'ct_role'):
                    if 'awper' in (m['roles'].get(side) or '').lower():
                        awpc += n
            if total:
                k = norm(p['player_name'])
                shares[k] = max(shares.get(k, 0), awpc / total)
    return shares


def main() -> None:
    key = os.environ.get('CS2CAM_API_KEY')
    if not key:
        sys.exit('defina CS2CAM_API_KEY no ambiente')
    apply = '--apply' in sys.argv
    shares = fetch_awp_shares(key)
    raw = open(DATA, encoding='utf-8').read()
    bo = json.loads(raw)
    teams = bo if isinstance(bo, list) else bo['teams']
    changes = []
    for t in teams:
        ps = t.get('players', [])
        cand = sorted([(shares.get(norm(p['nick']), 0), p) for p in ps if shares.get(norm(p['nick']), 0) >= 0.5], key=lambda x: -x[0])
        if not cand:
            continue
        new = cand[0][1]
        if new['role'] == 'AWP':
            continue
        prev = new['role']
        old = next((p for p in ps if p['role'] == 'AWP'), None)
        if old:
            old['awp'], new['awp'] = new['awp'], old['awp']
            if prev == 'IGL':
                old['role'] = 'IGL'
                old['igl'], new['igl'] = new['igl'], old['igl']
            else:
                old['role'] = 'Rifler'
        else:
            new['awp'] = max(int(new.get('awp', 60)), 82)
        new['role'] = 'AWP'
        changes.append((t.get('team'), old['nick'] if old else '-', new['nick'], prev, int(cand[0][0] * 100)))

    for tm, old, new, prev, sh in changes:
        print(f'  {tm:20} AWP: {old} -> {new} (era {prev}, cs2cam {sh}%)')
    print(f'\n{len(changes)} times com AWP divergente.')
    if apply:
        open(DATA, 'w', encoding='utf-8').write(json.dumps(bo, ensure_ascii=False, indent=1) + ('\n' if raw.endswith('\n') else ''))
        print('aplicado em', DATA)
    else:
        print('(dry-run; rode com --apply pra gravar)')


if __name__ == '__main__':
    main()
