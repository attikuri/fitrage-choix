"""
orientation/recommender.py

Core logic of the app. No Django views here — pure functions that
take student data, query the DB, and return ranked recommendations.

Entry point:
    from orientation.recommender import get_recommendations
    results = get_recommendations(
        bac_stream   = 'SM',
        wilaya       = 'ALGER',
        moyenne      = 14.5,
        grades       = {'maths': 17.0, 'physique': 15.0, 'svt': 13.0,
                        'langue': 16.0, 'specialite': None},
        domain_codes = ['C01', 'C02', 'A05'],   # student's selected interests
    )
"""
from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional
from django.db.models import Avg, Min, Max, Count, Q
from orientation.models import (
    BacStreamPriority, DomainFormula,
    Etablissement, Filiere, ResultatAdmission,
)


# ──────────────────────────────────────────────────────────────
# 1.  WEIGHTED SCORE CALCULATOR
# ──────────────────────────────────────────────────────────────

def compute_score(
    moyenne: float,
    formula_type: str,
    grades: dict,
) -> float:
    """
    Apply the circulaire weighted-average formula for a given domain,
    then return max(weighted, moyenne) as per the official rule.

    grades keys expected (all optional, missing → fall back to moyenne):
        maths, physique, svt, langue, specialite, moy_3_langues
    """
    g = grades or {}

    def get(key):
        return g.get(key) or moyenne   # if grade not provided, use moyenne

    if formula_type == 'snv':
        weighted = (moyenne * 2 + get('svt')) / 3

    elif formula_type == 'sm':
        weighted = (moyenne * 2 + (get('physique') + get('maths')) / 2) / 3

    elif formula_type == 'mi':
        weighted = (moyenne * 2 + get('maths')) / 3

    elif formula_type == 'st_spec':
        weighted = (moyenne * 2 + (get('specialite') + get('maths')) / 2) / 3

    elif formula_type == 'lang':
        weighted = (moyenne * 2 + get('langue')) / 3

    elif formula_type == 'trad':
        weighted = (moyenne * 2 + get('moy_3_langues')) / 3

    else:   # 'general' or unknown
        return round(moyenne, 4)

    return round(max(weighted, moyenne), 4)


# ──────────────────────────────────────────────────────────────
# 2.  ACCEPTANCE PROBABILITY
# ──────────────────────────────────────────────────────────────

def compute_probability(score: float, history: list[float]) -> tuple[int, str]:
    """
    Given the student's effective score and a list of historical cutoffs
    (one per year, for the relevant priority min column), return:
        (probability_pct, label)

    Method:
      - Base = fraction of years where score >= cutoff
      - Trend penalty/bonus: if cutoffs rising → subtract, if falling → add
      - Clamped to [0, 97] (never show 100% — nothing is guaranteed)
    """
    if not history:
        return (0, 'Données insuffisantes')

    history = [h for h in history if h is not None]
    if not history:
        return (0, 'Données insuffisantes')

    # base probability
    cleared = sum(1 for h in history if score >= h)
    base_pct = cleared / len(history)

    # trend: slope of cutoffs over years (simple diff of first vs last)
    if len(history) >= 2:
        trend = (history[-1] - history[0]) / len(history)   # pts/year
    else:
        trend = 0.0

    # adjust: +/-5% per 0.5pt/year of trend
    trend_adj = -(trend / 0.5) * 0.05

    prob = base_pct + trend_adj
    prob = max(0.0, min(0.97, prob))
    pct  = round(prob * 100)

    if pct >= 80:
        label = 'Très probable'
    elif pct >= 55:
        label = 'Probable'
    elif pct >= 30:
        label = 'Risqué'
    elif pct > 0:
        label = 'Peu probable'
    else:
        label = 'Hors portée'

    return (pct, label)


# ──────────────────────────────────────────────────────────────
# 3.  RESULT DATACLASS
# ──────────────────────────────────────────────────────────────

@dataclass
class Recommendation:
    # identifiers
    code_etb:         str
    code_fil:         str
    wilaya_cible:     str       # '' if no restriction, else the target wilaya

    # display
    etablissement:    str
    filiere:          str
    wilaya_etb:       str
    type_etablissement: str     # 'grande_ecole', 'universite', etc.
    domaine_code:     str
    domaine_label:    str
    type_inscription: str       # 'local' or 'national'

    # scoring
    score:            float     # student's effective weighted score
    priority:         int       # 1, 2, or 3

    # history (4 years, ordered oldest → newest)
    cutoffs:          list[float]   # the relevant min column per year
    years:            list[int]

    # output
    prob_pct:         int
    prob_label:       str

    # tier assigned after sorting
    tier: str = ''   # 'ambitieux' | 'optimal' | 'sur' | 'garanti'


# ──────────────────────────────────────────────────────────────
# 4.  WILAYA FILTER HELPER
# ──────────────────────────────────────────────────────────────

def _wilaya_filter(wilaya: str):
    """
    Correct 3-branch filter:
      1. Unrestricted filière at a local etablissement (wilaya_cible must be '',
         so CHLEF-restricted slots at an ALGER etb are excluded)
      2. Filière explicitly reserved for this wilaya (wilaya_cible=wilaya), any etb
      3. Open national filière with no wilaya restriction
    """
    return (
        Q(etablissement__wilaya=wilaya, filiere__wilaya_cible='')          # local unrestricted
        | Q(filiere__wilaya_cible=wilaya)                                   # pour bacheliers <wilaya>
        | Q(filiere__wilaya_cible='', filiere__type_inscription='national') # open national
    )


# ──────────────────────────────────────────────────────────────
# 5.  MAIN ENTRY POINT
# ──────────────────────────────────────────────────────────────

def get_recommendations(
    bac_stream:   str,
    wilaya:       str,
    moyenne:      float,
    grades:       dict,
    domain_codes: list[str],    # user-selected domains of interest
    years:        list[int] = None,
) -> list[Recommendation]:
    """
    Returns a ranked list of Recommendation objects for the given student.

    Parameters
    ----------
    bac_stream   : one of 'SM','SE','TR','GE','LL','LAL','ART'
    wilaya       : student's wilaya (must match wilaya values in DB)
    moyenne      : general bac average
    grades       : dict of subject grades (see compute_score docstring)
    domain_codes : list of domaine_code strings the student is interested in
    years        : which years to use for history (default: all 4 in DB)
    """
    if years is None:
        years = list(
            ResultatAdmission.objects.values_list('annee', flat=True)
            .distinct().order_by('annee')
        )

    # ── Step A: find eligible (domain, priority) pairs ────────
    eligible = BacStreamPriority.objects.filter(
        domaine_code__in=domain_codes,
        bac_stream=bac_stream,
    ).select_related()   # → {domaine_code: priority}

    domain_priority = {e.domaine_code: e.priority for e in eligible}

    if not domain_priority:
        return []   # student's stream has no access to any selected domain

    # ── Step B: load formulas for eligible domains ─────────────
    formulas = {
        f.domaine_code: f
        for f in DomainFormula.objects.filter(domaine_code__in=domain_priority.keys())
    }

    # ── Step C: compute effective score per domain ─────────────
    domain_score = {}
    for code, formula in formulas.items():
        domain_score[code] = compute_score(moyenne, formula.formula_type, grades)

    # ── Step D: query history for all eligible filières ────────
    history_qs = (
        ResultatAdmission.objects
        .filter(
            _wilaya_filter(wilaya),
            filiere__domaine_code__in=domain_priority.keys(),
            annee__in=years,
        )
        .select_related('etablissement', 'filiere', 'filiere__domaine_code')
        .exclude(filiere__nom__icontains='A DISTANCE')
        .values(
            'etablissement__code_etb',
            'etablissement__nom',
            'etablissement__wilaya',
            'etablissement__type_etablissement',
            'filiere__code_fil',
            'filiere__nom',
            'filiere__domaine_code',
            'filiere__type_inscription',
            'filiere__wilaya_cible',
            'annee', 'min1', 'min2', 'min3',
        )
        .order_by(
            'etablissement__code_etb',
            'filiere__code_fil',
            'filiere__wilaya_cible',
            'annee',
        )
    )

    # ── Step E: group by (etb, fil, wilaya_cible) ─────────────
    groups: dict[tuple, dict] = {}
    for row in history_qs:
        key = (
            row['etablissement__code_etb'],
            row['filiere__code_fil'],
            row['filiere__wilaya_cible'],
        )
        if key not in groups:
            groups[key] = {
                'code_etb':           row['etablissement__code_etb'],
                'etablissement':      row['etablissement__nom'],
                'wilaya_etb':         row['etablissement__wilaya'] or '',
                'type_etablissement': row['etablissement__type_etablissement'],
                'code_fil':           row['filiere__code_fil'],
                'filiere':            row['filiere__nom'],
                'domaine_code':       row['filiere__domaine_code'],
                'type_inscription':   row['filiere__type_inscription'],
                'wilaya_cible':       row['filiere__wilaya_cible'],
                'years':   [],
                'min1s':   [],
                'min2s':   [],
                'min3s':   [],
            }
        g = groups[key]
        g['years'].append(row['annee'])
        g['min1s'].append(row['min1'])
        g['min2s'].append(row['min2'])
        g['min3s'].append(row['min3'])

    # ── Step F: build Recommendation objects ──────────────────
    results: list[Recommendation] = []

    for key, g in groups.items():
        dom_code = g['domaine_code']
        priority = domain_priority.get(dom_code)
        formula  = formulas.get(dom_code)

        if priority is None or formula is None:
            continue

        score = domain_score.get(dom_code, moyenne)

        # pick the right min column based on priority
        if priority == 1:
            cutoffs = g['min1s']
        elif priority == 2:
            cutoffs = g['min2s']
        else:
            cutoffs = g['min3s']

        # need at least 1 year of data with a cutoff value
        valid_cutoffs = [c for c in cutoffs if c is not None]
        if not valid_cutoffs:
            continue

        prob_pct, prob_label = compute_probability(score, valid_cutoffs)

        # hard filter: if score is below the all-time minimum, skip
        # (completely out of reach — don't show as hopeless noise)
        if score < min(valid_cutoffs) * 0.90:   # 10% tolerance
            continue

        results.append(Recommendation(
            code_etb          = g['code_etb'],
            code_fil          = g['code_fil'],
            wilaya_cible      = g['wilaya_cible'],
            etablissement     = g['etablissement'],
            filiere           = g['filiere'],
            wilaya_etb        = g['wilaya_etb'],
            type_etablissement= g['type_etablissement'],
            domaine_code      = dom_code,
            domaine_label     = formula.domaine_label,
            type_inscription  = g['type_inscription'],
            score             = score,
            priority          = priority,
            cutoffs           = [c for c in cutoffs],
            years             = g['years'],
            prob_pct          = prob_pct,
            prob_label        = prob_label,
        ))

    # ── Step G: assign tiers ──────────────────────────────────
    ETB_RANK = {
        'grande_ecole': 0,
        'ens':          1,
        'universite':   2,
        'centre_universitaire': 3,
        'institut_sante': 4,
        'formation_continue': 5,
        'national':     6,
    }

    for r in results:
        if r.prob_pct >= 75:
            r.tier = 'garanti'
        elif r.prob_pct >= 50:
            r.tier = 'sur'
        elif r.prob_pct >= 25:
            r.tier = 'optimal'
        else:
            r.tier = 'ambitieux'

    # ── Step H: sort ─────────────────────────────────────────
    # Sort by tier first, then by prob_pct (highest first), then by etb quality.
    # prob_pct drives ordering within a tier — institution type is secondary
    # so that médecine at a université ranks above vétérinaire at a grande école
    # when the probability is higher.
    TIER_ORDER = {'ambitieux': 0, 'optimal': 1, 'sur': 2, 'garanti': 3}

    results.sort(key=lambda r: (
        TIER_ORDER[r.tier],
        -r.prob_pct,                             # highest probability first within tier
        ETB_RANK.get(r.type_etablissement, 9),   # institution quality as tiebreaker only
    ))

    return results


# ──────────────────────────────────────────────────────────────
# 6.  WISH CARD BUILDER
# ──────────────────────────────────────────────────────────────

def build_wish_card(
    recommendations: list[Recommendation],
    wilaya: str,
    max_choices: int = 10,
    moyenne: float = 0,
) -> list[Recommendation]:
    """
    Build the optimal wish card:
    - Slots 1-8: mix of tiers from the student's selected domains
    - Slots 9-10: ALWAYS 2 safe local LMD Licence choices from the student's
      wilaya, taken from the selected results if available, otherwise fetched
      from the DB across the most common fallback domains (info, maths, bio, eco).
    - Order: ambitieux → garanti (PROGRES matches the highest qualifying choice)
    """
    by_tier = {'ambitieux': [], 'optimal': [], 'sur': [], 'garanti': []}
    for r in recommendations:
        by_tier[r.tier].append(r)

    card: list[Recommendation] = []
    used_keys: set = set()

    def add(r) -> bool:
        key = (r.code_etb, r.code_fil, r.wilaya_cible)
        if key not in used_keys:
            card.append(r)
            used_keys.add(key)
            return True
        return False

    def remove_last_non_local():
        for i in range(len(card) - 1, -1, -1):
            if card[i].type_inscription != 'local':
                used_keys.discard((card[i].code_etb, card[i].code_fil, card[i].wilaya_cible))
                card.pop(i)
                return True
        return False

    # ── Slots 1-8: best mix from selected domains ──────────
    targets = [('ambitieux', 2), ('optimal', 3), ('sur', 2), ('garanti', 1)]
    for tier, n in targets:
        count = 0
        for r in by_tier[tier]:
            if count >= n:
                break
            if add(r):
                count += 1

    # Fill up to 8 with remaining garanti
    for r in by_tier['garanti']:
        if len(card) >= 8:
            break
        add(r)

    # ── Slots 9-10: mandatory local LMD in student's wilaya ──
    # Priority 1: local choices already in the recommendations
    local_from_results = [
        r for r in recommendations
        if r.type_inscription == 'local'
        and r.wilaya_etb == wilaya
        and 'LAL' in r.code_fil
        and r.prob_pct >= 50
    ]

    lmd_added = 0
    for r in local_from_results:
        if lmd_added >= 2:
            break
        key = (r.code_etb, r.code_fil, r.wilaya_cible)
        if key not in used_keys:
            if len(card) >= max_choices:
                remove_last_non_local()
            if add(r):
                lmd_added += 1

    # Priority 2: if not enough, query DB for safe local LAL across
    # fallback domains (info, maths, bio, eco) in this wilaya
    if lmd_added < 2:
        from orientation.models import ResultatAdmission
        FALLBACK_DOMAINS = ['C01', 'C02', 'D00', 'F04', 'G02', 'B00', 'A05']
        fallback_qs = (
            ResultatAdmission.objects
            .filter(
                etablissement__wilaya=wilaya,
                filiere__type_inscription='local',
                filiere__code_fil__contains='LAL',
                filiere__domaine_code__in=FALLBACK_DOMAINS,
                min1__isnull=False,
            )
            .select_related('etablissement', 'filiere')
            .order_by('-min1')
            .exclude(filiere__nom__icontains='A DISTANCE')
        )
        seen_fils = set()
        for row in fallback_qs:
            if lmd_added >= 2:
                break
            fil_key = row.filiere.code_fil
            if fil_key in seen_fils:
                continue
            seen_fils.add(fil_key)

            key = (row.etablissement.code_etb, row.filiere.code_fil, row.filiere.wilaya_cible)
            if key in used_keys:
                continue

            # Build a minimal Recommendation to add as fallback
            from orientation.recommender import Recommendation, compute_probability
            cutoffs = list(
                ResultatAdmission.objects
                .filter(etablissement=row.etablissement, filiere=row.filiere)
                .order_by('annee')
                .values_list('min1', flat=True)
            )
            valid = [c for c in cutoffs if c is not None]
            prob_pct, prob_label = compute_probability(moyenne, valid) if valid else (50, 'Probable')

            fallback_r = Recommendation(
                code_etb=row.etablissement.code_etb,
                code_fil=row.filiere.code_fil,
                wilaya_cible=row.filiere.wilaya_cible,
                etablissement=row.etablissement.nom,
                filiere=row.filiere.nom,
                wilaya_etb=row.etablissement.wilaya or '',
                type_etablissement=row.etablissement.type_etablissement,
                domaine_code=row.filiere.domaine_code,
                domaine_label=row.filiere.domaine_code,
                type_inscription='local',
                score=moyenne,
                priority=1,
                cutoffs=cutoffs,
                years=[],
                prob_pct=prob_pct,
                prob_label=prob_label,
                tier='garanti' if prob_pct >= 75 else 'sur',
            )
            if len(card) >= max_choices:
                remove_last_non_local()
            if add(fallback_r):
                lmd_added += 1

    return card[:max_choices]