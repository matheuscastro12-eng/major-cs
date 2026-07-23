# Importa a planilha de elencos ("Road to Major — Elencos (jogadores por time).xlsx")
# e regenera src/data/bo3-2026.json PRESERVANDO ids de times e jogadores existentes
# (crítico: saves guardam ids — trocar id quebraria squad/moves/extraOnTeam).
#
# Regras:
#   - Time casa por TAG (upper), fallback por nome normalizado. "Free agents"
#     (FREE) vira o time virtual __free__ (tag FA) — pool de free agents.
#   - Jogador casa por nick (lower) no mapa GLOBAL do json antigo (preferindo o
#     mesmo time). Casou → mantém id/name/country antigos quando a planilha não
#     traz. Não casou → id novo estável 'xls_<slug>'.
#   - Linhas em branco = vaga aberta: backfill com jogadores do elenco antigo do
#     time que NÃO aparecem em lugar nenhum da planilha; se ainda faltar, gera
#     filler procedural determinístico (id 'xls_regen_*') cobrindo função ausente.
#   - Saneamento: 'Riffler'→'Rifler', país lowercase (vazio → país do time),
#     idade/atributos int, nick numérico ('1962.0') vira string limpa, dedupe
#     por nick dentro do time.
#   - Coach: mantém o objeto antigo se o nick bate; senão gera (rating derivado
#     do entrosamento, style determinístico por hash).
#   - Coluna OVR é conferida contra a fórmula playerOvr (45% aim + 18% cons +
#     12% clutch + 25% spec) e reportada se divergir >1 — mas NÃO é gravada
#     (OVR é derivado no jogo).
#
# Uso: python3 scripts/import-rosters-xlsx.py "<caminho do xlsx>"

import json
import re
import sys
import hashlib
from collections import defaultdict

import openpyxl

XLSX = sys.argv[1] if len(sys.argv) > 1 else "/Users/matheuscastro/Downloads/Road to Major — Elencos (jogadores por time).xlsx"
JSON_PATH = "src/data/bo3-2026.json"

ROLES = {"AWP", "IGL", "Rifler", "Entry", "Support", "Lurker"}
ROLE_FIX = {"Riffler": "Rifler", "riffler": "Rifler"}
COACH_STYLES = ["tactical", "aggressive", "discipline"]

# paleta pra times novos (pares [primária, secundária]) — determinística por hash
PALETTE = [
    ["#1f2a44", "#f2b632"], ["#3a1f44", "#e05263"], ["#0f3d3e", "#7ee081"],
    ["#442a1f", "#f2994a"], ["#1f4436", "#9ae5c9"], ["#2c1f44", "#8f7ef2"],
    ["#44341f", "#e0c47a"], ["#1f3844", "#7ac8e0"], ["#441f2c", "#f27ea9"],
    ["#26441f", "#b6e07a"],
]


def norm_name(s):
    return re.sub(r"[^a-z0-9]", "", str(s).lower())


def slug(s):
    return re.sub(r"[^a-z0-9]", "", str(s).lower()) or "x"


def h(s):
    return int(hashlib.sha1(s.encode()).hexdigest(), 16)


def clean_nick(v):
    # openpyxl devolve float pra nick numérico ('1962' vira 1962.0) — e o import
    # ANTIGO tinha o mesmo bug, então '910.0' pode vir como string do json.
    if isinstance(v, float) and v.is_integer():
        return str(int(v))
    s = str(v).strip()
    if re.fullmatch(r"\d+\.0", s):
        return s[:-2]
    return s


def as_int(v, fallback=None):
    if v is None:
        return fallback
    try:
        return int(round(float(v)))
    except (TypeError, ValueError):
        return fallback


def player_ovr(p):
    spec = max(p["awp"], p["igl"], p["aim"])
    return round(p["aim"] * 0.45 + p["consistency"] * 0.18 + p["clutch"] * 0.12 + spec * 0.25)


def main():
    old = json.load(open(JSON_PATH))
    old_by_tag = {t["tag"].upper(): t for t in old}
    old_by_name = {norm_name(t["team"]): t for t in old}
    # mapa global nick→(teamId, player) do json antigo (pra preservar id em
    # transferência). Nicks passam pelo clean_nick: import antigo tinha o mesmo
    # bug de float ('910' salvo como '910.0') — normalizar os DOIS lados casa.
    old_nick = {}
    for t in old:
        for p in t["players"]:
            old_nick.setdefault(clean_nick(p["nick"]).lower(), []).append((t["id"], p))
    # renomes conhecidos (nick da planilha → nick antigo) pra não perder o id
    NICK_ALIAS = {"guty": "fraguty"}

    wb = openpyxl.load_workbook(XLSX)
    ws = wb.active
    rows = [r for r in ws.iter_rows(min_row=2, values_only=True) if r[0]]

    # agrupa por time preservando a ordem da planilha
    order = []
    by_team = defaultdict(list)
    for r in rows:
        key = (str(r[0]).strip(), str(r[1]).strip())
        if key not in by_team:
            order.append(key)
        by_team[key].append(r)

    # nicks usados em QUALQUER lugar da planilha (times + FREE) — quem está aqui
    # não pode ser backfillado em outro time
    used_nicks = {clean_nick(r[5]).lower() for r in rows if r[5]}
    # nicks com TIME na planilha: o pool FREE não pode repetir quem tem clube
    # (ex.: ztr listado no FOKUS e também no FREE → vale o clube)
    team_nicks = {clean_nick(r[5]).lower() for r in rows if r[5] and str(r[1]).strip().upper() != "FREE"}

    report = {"ovr_mismatch": [], "new_teams": [], "removed": [], "backfilled": [], "fillers": [], "moved": 0, "kept": 0, "new_players": 0}

    sheet_names = {norm_name(n) for (n, _t) in by_team}

    def find_old_team(name, tag):
        if tag.upper() == "FREE":
            return next((t for t in old if t["id"] == "__free__"), None)
        # NOME primeiro: tags colidem na planilha (METANOIA e Metizport = 'MET');
        # o nome normalizado é o identificador confiável, tag é fallback — e o
        # fallback só vale se o time antigo não pertence a OUTRA linha da planilha.
        by_name = old_by_name.get(norm_name(name))
        if by_name:
            return by_name
        by_tag = old_by_tag.get(tag.upper())
        if by_tag and norm_name(by_tag["team"]) in sheet_names:
            return None  # esse antigo casa por nome com outro time da planilha
        return by_tag

    def build_player(r, team_country, old_team):
        nick = clean_nick(r[5])
        name = str(r[6]).strip() if r[6] else None
        country = str(r[7]).strip().lower() if r[7] else None
        role = ROLE_FIX.get(str(r[8]).strip(), str(r[8]).strip()) if r[8] else None
        role2 = ROLE_FIX.get(str(r[9]).strip(), str(r[9]).strip()) if r[9] else None
        age = as_int(r[10])
        aim = as_int(r[12]); cons = as_int(r[13]); clutch = as_int(r[14])
        awp = as_int(r[15]); igl = as_int(r[16])
        # casa com o antigo: preferindo o mesmo time, senão global (transferido)
        cands = old_nick.get(nick.lower(), []) or old_nick.get(NICK_ALIAS.get(nick.lower(), ""), [])
        same = [p for tid, p in cands if old_team and tid == old_team["id"]]
        oldp = same[0] if same else (cands[0][1] if cands else None)
        if oldp is not None:
            report["kept" if same else "moved"] = report["kept" if same else "moved"] + (1 if same else 1)
        else:
            report["new_players"] += 1
        pid = oldp["id"] if oldp else f"xls_{slug(nick)}"
        out = {
            "id": pid,
            # planilha manda no nick (cobre renome tipo FraGuTy→GuTy); clean_nick
            # já saneou o float-bug. Se a planilha só difere em caixa, mantém a antiga.
            "nick": clean_nick(oldp["nick"]) if (oldp and clean_nick(oldp["nick"]).lower() == nick.lower()) else nick,
            "name": name or (oldp["name"] if oldp else nick),
            "country": country or (oldp["country"] if oldp else team_country),
            "role": role if role in ROLES else (oldp["role"] if oldp and oldp.get("role") in ROLES else "Rifler"),
            "aim": aim if aim is not None else (oldp["aim"] if oldp else 70),
            "consistency": cons if cons is not None else (oldp["consistency"] if oldp else 70),
            "clutch": clutch if clutch is not None else (oldp["clutch"] if oldp else 68),
            "awp": awp if awp is not None else (oldp["awp"] if oldp else 45),
            "igl": igl if igl is not None else (oldp["igl"] if oldp else 45),
        }
        if role2 in ROLES and role2 != out["role"]:
            out["role2"] = role2
        elif oldp and oldp.get("role2") in ROLES and not role2:
            out["role2"] = oldp["role2"]
        if age is not None:
            out["age"] = age
        elif oldp and isinstance(oldp.get("age"), int):
            out["age"] = oldp["age"]
        # O OVR do jogo é DERIVADO (playerOvr) — a coluna OVR da planilha é a
        # intenção do editor. Quando diverge, ajusta aim/cons/clutch em passos
        # de ±1 até o derivado bater (cap ±4 por atributo, pra não deformar).
        sheet_ovr = as_int(r[11])
        if sheet_ovr is not None:
            base = {k: out[k] for k in ("aim", "consistency", "clutch")}
            steps = 0
            while player_ovr(out) != sheet_ovr and steps < 12:
                d = 1 if player_ovr(out) < sheet_ovr else -1
                # sobe/desce o atributo que menos se afastou do original
                k = min(("aim", "consistency", "clutch"), key=lambda k: abs(out[k] + d - base[k]))
                if abs(out[k] + d - base[k]) > 4:
                    break
                out[k] = max(30, min(99, out[k] + d))
                steps += 1
            if player_ovr(out) != sheet_ovr:
                report["ovr_mismatch"].append((nick, sheet_ovr, player_ovr(out)))
        return out

    def filler_player(team, tag, team_country, roles_present, idx):
        # filler procedural determinístico: cobre a função que falta, nível modesto
        need = [x for x in ["IGL", "AWP", "Entry", "Support", "Rifler"] if x not in roles_present]
        role = need[0] if need else "Rifler"
        seed = h(f"{tag}:{idx}")
        syl = ["zor", "nex", "kra", "vyn", "dux", "mir", "tal", "rek", "bly", "fen"]
        nick = (syl[seed % 10] + syl[(seed // 10) % 10]).capitalize() + str(seed % 90 + 10)
        lvl = 62 + (seed % 7)  # 62-68: nível de vaga aberta, sem inflar tier baixo
        return {
            "id": f"xls_regen_{slug(tag)}_{idx}",
            "nick": nick, "name": nick, "country": team_country,
            "role": role,
            "aim": lvl, "consistency": lvl - 1, "clutch": lvl - 2,
            "awp": lvl + 10 if role == "AWP" else 40 + (seed % 8),
            "igl": lvl + 12 if role == "IGL" else 40 + (seed % 8),
            "age": 19 + (seed % 6),
        }

    out_teams = []
    for (name, tag) in order:
        trs = by_team[(name, tag)]
        ot = find_old_team(name, tag)
        team_country = next((str(r[2]).strip().lower() for r in trs if r[2]), (ot["country"] if ot else "br"))
        teamwork = next((as_int(r[3]) for r in trs if r[3] is not None), (ot["teamwork"] if ot else 55))
        coach_nick = next((str(r[4]).strip() for r in trs if r[4]), None)

        is_free = tag.upper() == "FREE" or (ot and ot["id"] == "__free__")
        players = []
        seen = set()
        for r in trs:
            if not r[5]:
                continue
            p = build_player(r, team_country, ot)
            if p["nick"].lower() in seen:
                continue  # dedupe (ex.: Ag1l 2x no FREE)
            if is_free and p["nick"].lower() in team_nicks:
                continue  # tem clube na planilha → não entra no pool FREE
            seen.add(p["nick"].lower())
            players.append(p)
        if not is_free:
            # backfill: ex-jogadores do time que não foram realocados na planilha
            if ot:
                for p in ot["players"]:
                    if len(players) >= 5:
                        break
                    if p["nick"].lower() in used_nicks or p["nick"].lower() in seen:
                        continue
                    seen.add(p["nick"].lower())
                    players.append(dict(p))
                    report["backfilled"].append((name, p["nick"]))
            # fillers procedurais até fechar 5
            i = 0
            while len(players) < 5:
                fp = filler_player(name, tag, team_country, {p["role"] for p in players}, i)
                players.append(fp)
                report["fillers"].append((name, fp["nick"], fp["role"]))
                i += 1

        # coach: preserva se o nick bate; senão gera
        if ot and coach_nick and ot.get("coach", {}).get("nick", "").lower() == coach_nick.lower():
            coach = ot["coach"]
        elif not coach_nick and ot:
            coach = ot["coach"]
        else:
            cseed = h(f"coach:{coach_nick}:{tag}")
            coach = {
                "nick": coach_nick or "coach",
                "name": coach_nick or "coach",
                "country": team_country,
                "rating": max(55, min(90, (teamwork or 55) - 2 + (cseed % 7))),
                "style": COACH_STYLES[cseed % 3],
            }

        if is_free and ot:
            team = {**ot, "players": players}  # __free__: mantém id/tag FA/shape
        else:
            tseed = h(f"team:{tag}")
            team = {
                "id": ot["id"] if ot else f"xls_team_{slug(tag)}",
                "team": ot["team"] if ot else name,
                "tag": ot["tag"] if ot else tag,
                "era": "2026",
                "game": "CS2",
                "country": team_country,
                "teamwork": teamwork if teamwork is not None else 55,
                "honors": ot.get("honors", "") if ot else "",
                "colors": ot["colors"] if ot else PALETTE[tseed % len(PALETTE)],
                "mapPrefs": ot.get("mapPrefs", {}) if ot else {},
                "coach": coach,
                "players": players,
            }
            if ot and ot.get("logoUrl"):
                team["logoUrl"] = ot["logoUrl"]
            if ot and ot.get("liquipediaUrl"):
                team["liquipediaUrl"] = ot["liquipediaUrl"]
            if not ot:
                report["new_teams"].append(f"{name} ({tag})")
        out_teams.append(team)

    kept_ids = {t["id"] for t in out_teams}
    report["removed"] = [f"{t['team']} ({t['tag']})" for t in old if t["id"] not in kept_ids]

    # rede de segurança: jogador antigo cujo id SUMIRIA do dataset (cortado sem
    # destino na planilha, time removido) vai pro pool de free agents — saves
    # existentes resolvem o id normalmente e ele fica assinável (está sem clube).
    new_pids = {p["id"] for t in out_teams for p in t["players"]}
    all_nicks = {p["nick"].lower() for t in out_teams for p in t["players"]}
    free_team = next((t for t in out_teams if t["id"] == "__free__"), None)
    if free_team:
        for t in old:
            for p in t["players"]:
                if p["id"] in new_pids or clean_nick(p["nick"]).lower() in all_nicks:
                    continue
                fp = dict(p)
                fp["nick"] = clean_nick(fp["nick"])
                free_team["players"].append(fp)
                all_nicks.add(fp["nick"].lower())
                report.setdefault("rescued_to_fa", []).append((t["team"], fp["nick"]))

    json.dump(out_teams, open(JSON_PATH, "w"), ensure_ascii=False, indent=1)

    print(f"teams: {len(out_teams)} (antes {len(old)})")
    print(f"players kept (mesmo time): {report['kept']} | transferidos: {report['moved']} | novos: {report['new_players']}")
    print(f"new teams ({len(report['new_teams'])}): {', '.join(report['new_teams'])}")
    print(f"removed ({len(report['removed'])}): {', '.join(report['removed'])}")
    print(f"backfilled ({len(report['backfilled'])}): {report['backfilled']}")
    print(f"fillers ({len(report['fillers'])}): {report['fillers']}")
    print(f"resgatados pro FA ({len(report.get('rescued_to_fa', []))}): {report.get('rescued_to_fa', [])}")
    if report["ovr_mismatch"]:
        print(f"OVR divergente (planilha vs derivado) ({len(report['ovr_mismatch'])}):")
        for n, s, c in report["ovr_mismatch"][:20]:
            print(f"  {n}: planilha {s} vs derivado {c}")


if __name__ == "__main__":
    main()
