"""
orientation/api.py

REST API endpoint for the recommendation engine.

URLs (add to filtrage_choix/urls.py):
    from orientation.api import router
    path('api/', include(router.urls)),

Then call:
    POST /api/recommendations/
    {
        "bac_stream":      "SM",
        "wilaya":          "ALGER",
        "moyenne":         14.5,
        "grades": {
            "maths":       17.0,
            "physique":    15.0,
            "svt":         13.0,
            "langue":      null,
            "specialite":  null,
            "moy_3_langues": null
        },
        "domain_codes":    ["C01", "C02", "C00"],
        "include_teaching": false,
        "max_choices":     10
    }
"""
import re
from rest_framework import serializers, status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework.routers import DefaultRouter

from django.db import models
from orientation.models import BacStreamPriority, DomainFormula
from orientation.recommender import get_recommendations, build_wish_card, Recommendation


# ──────────────────────────────────────────────
# CONSTANTS
# ──────────────────────────────────────────────

TEACHING_PATTERNS = re.compile(
    r'\b(P\.E\.M|P\.E\.S\.?|P\.E\.P|ENSEIGNEMENT|EDUCATION)\b',
    re.IGNORECASE,
)

VALID_BAC_STREAMS = ['SM', 'SE', 'TR', 'GE', 'LL', 'LAL', 'ART']


# ──────────────────────────────────────────────
# INPUT SERIALIZER
# ──────────────────────────────────────────────

class GradesSerializer(serializers.Serializer):
    maths         = serializers.FloatField(required=False, allow_null=True, min_value=0, max_value=20)
    physique      = serializers.FloatField(required=False, allow_null=True, min_value=0, max_value=20)
    svt           = serializers.FloatField(required=False, allow_null=True, min_value=0, max_value=20)
    langue        = serializers.FloatField(required=False, allow_null=True, min_value=0, max_value=20)
    specialite    = serializers.FloatField(required=False, allow_null=True, min_value=0, max_value=20)
    moy_3_langues = serializers.FloatField(required=False, allow_null=True, min_value=0, max_value=20)


class RecommendationRequestSerializer(serializers.Serializer):
    bac_stream       = serializers.ChoiceField(choices=VALID_BAC_STREAMS)
    wilaya           = serializers.CharField(max_length=100)
    moyenne          = serializers.FloatField(min_value=0, max_value=20)
    grades           = GradesSerializer(required=False)
    domain_codes     = serializers.ListField(
                           child=serializers.CharField(max_length=5),
                           min_length=1, max_length=30,
                       )
    include_teaching = serializers.BooleanField(default=False)
    max_choices      = serializers.IntegerField(default=10, min_value=6, max_value=10)

    def validate_wilaya(self, value):
        return value.strip().upper()

    def validate_domain_codes(self, value):
        existing = set(
            DomainFormula.objects.filter(domaine_code__in=value)
            .values_list('domaine_code', flat=True)
        )
        unknown = [c for c in value if c not in existing]
        if unknown:
            raise serializers.ValidationError(
                f"Unknown domain codes: {unknown}"
            )
        return value


# ──────────────────────────────────────────────
# OUTPUT SERIALIZER
# ──────────────────────────────────────────────

class RecommendationSerializer(serializers.Serializer):
    # identifiers
    code_etb          = serializers.CharField()
    code_fil          = serializers.CharField()
    wilaya_cible      = serializers.CharField()

    # display
    etablissement     = serializers.CharField()
    filiere           = serializers.CharField()
    wilaya_etb        = serializers.CharField()
    type_etablissement= serializers.CharField()
    domaine_code      = serializers.CharField()
    domaine_label     = serializers.CharField()
    type_inscription  = serializers.CharField()

    # scoring
    score             = serializers.FloatField()
    priority          = serializers.IntegerField()
    prob_pct          = serializers.IntegerField()
    prob_label        = serializers.CharField()
    tier              = serializers.CharField()

    # history
    cutoffs           = serializers.ListField(child=serializers.FloatField(allow_null=True))
    years             = serializers.ListField(child=serializers.IntegerField())


class RecommendationResponseSerializer(serializers.Serializer):
    all_results  = RecommendationSerializer(many=True)
    wish_card    = RecommendationSerializer(many=True)
    meta = serializers.DictField()


# ──────────────────────────────────────────────
# HELPERS
# ──────────────────────────────────────────────

def _filter_teaching(results: list, include: bool) -> list:
    if include:
        return results
    return [r for r in results if not TEACHING_PATTERNS.search(r.filiere)]


def _build_meta(results: list, req_data: dict) -> dict:
    """Summary stats sent alongside the results."""
    tiers = {'ambitieux': 0, 'optimal': 0, 'sur': 0, 'garanti': 0}
    for r in results:
        tiers[r.tier] = tiers.get(r.tier, 0) + 1

    etb_types = {}
    for r in results:
        etb_types[r.type_etablissement] = etb_types.get(r.type_etablissement, 0) + 1

    return {
        'total_results':   len(results),
        'bac_stream':      req_data['bac_stream'],
        'wilaya':          req_data['wilaya'],
        'effective_scores': _effective_scores(req_data),
        'tiers':           tiers,
        'etb_types':       etb_types,
    }


def _effective_scores(req_data: dict) -> dict:
    """
    Return the student's effective score for each selected domain,
    so the frontend can show "Votre score pondéré pour MI: 15.33".
    """
    from orientation.recommender import compute_score
    grades = req_data.get('grades') or {}
    moyenne = req_data['moyenne']
    scores = {}
    formulas = {
        f.domaine_code: f
        for f in DomainFormula.objects.filter(domaine_code__in=req_data['domain_codes'])
    }
    for code, formula in formulas.items():
        scores[code] = {
            'label': formula.domaine_label,
            'score': compute_score(moyenne, formula.formula_type, grades),
            'formula_type': formula.formula_type,
        }
    return scores


# ──────────────────────────────────────────────
# VIEW
# ──────────────────────────────────────────────

@api_view(['POST'])
def recommend(request):
    """
    Main recommendation endpoint.

    Returns:
        all_results  — full ranked list (for the "explore" screen)
        wish_card    — the optimal 10-choice card (for the "ma liste" screen)
        meta         — summary stats and per-domain effective scores
    """
    req_serializer = RecommendationRequestSerializer(data=request.data)
    if not req_serializer.is_valid():
        return Response(req_serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    data = req_serializer.validated_data
    grades = dict(data.get('grades') or {})

    # run the engine
    results = get_recommendations(
        bac_stream   = data['bac_stream'],
        wilaya       = data['wilaya'],
        moyenne      = data['moyenne'],
        grades       = grades,
        domain_codes = data['domain_codes'],
    )

    # apply teaching filter
    results = _filter_teaching(results, data['include_teaching'])

    # build wish card
    card = build_wish_card(results, data['wilaya'], max_choices=data['max_choices'], moyenne=data['moyenne'])

    return Response({
        'all_results': RecommendationSerializer(results, many=True).data,
        'wish_card':   RecommendationSerializer(card,    many=True).data,
        'meta':        _build_meta(results, data),
    })


@api_view(['GET'])
def domains(request):
    """
    Returns all available domains with their formula type and
    which bac streams can access them — for populating the
    domain selection screen in the frontend.

    Query param: ?bac_stream=SM  (optional — filters to eligible domains only)
    """
    bac_stream = request.query_params.get('bac_stream')

    if bac_stream:
        eligible_codes = set(
            BacStreamPriority.objects
            .filter(bac_stream=bac_stream)
            .values_list('domaine_code', flat=True)
        )
        formulas = DomainFormula.objects.filter(domaine_code__in=eligible_codes)
    else:
        formulas = DomainFormula.objects.all()

    result = []
    for f in formulas.order_by('domaine_code'):
        entry = {
            'domaine_code':  f.domaine_code,
            'domaine_label': f.domaine_label,
            'formula_type':  f.formula_type,
        }
        if bac_stream:
            priority = BacStreamPriority.objects.get(
                domaine_code=f.domaine_code, bac_stream=bac_stream
            ).priority
            entry['priority'] = priority
        result.append(entry)

    return Response(result)


@api_view(['GET'])
def wilayas(request):
    """
    Returns all wilayas that exist in the DB — for the wilaya dropdown.
    """
    from orientation.models import Etablissement
    wl = (
        Etablissement.objects
        .exclude(wilaya__isnull=True)
        .exclude(wilaya='')
        .values_list('wilaya', flat=True)
        .distinct()
        .order_by('wilaya')
    )
    return Response(sorted(wl))


# ──────────────────────────────────────────────
# URL REGISTRATION (import this in urls.py)
# ──────────────────────────────────────────────
# Add to filtrage_choix/urls.py:
#
#   from django.urls import path, include
#   from orientation.api import recommend, domains, wilayas
#
#   urlpatterns = [
#       ...
#       path('api/recommend/',  recommend),
#       path('api/domains/',    domains),
#       path('api/wilayas/',    wilayas),
#   ]


@api_view(['GET'])
def search(request):
    """
    Search for établissements or filières by name.
    Returns matching (etablissement, filiere) pairs with their 4-year history.

    Query params:
        q       — search term (min 2 chars)
        annees  — comma-separated years to include (default: all)

    Example: GET /api/search/?q=informatique
    """
    from orientation.models import ResultatAdmission
    q = (request.query_params.get('q') or '').strip()
    if len(q) < 2:
        return Response({'error': 'Search term must be at least 2 characters.'}, status=400)

    # Search filiere name or etablissement name (case-insensitive)
    matching = (
        ResultatAdmission.objects
        .filter(
            models.Q(filiere__nom__icontains=q) |
            models.Q(etablissement__nom__icontains=q)
        )
        .select_related('etablissement', 'filiere')
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

    # Group by (etb, fil, wilaya_cible)
    groups = {}
    for row in matching:
        key = (row['etablissement__code_etb'], row['filiere__code_fil'], row['filiere__wilaya_cible'])
        if key not in groups:
            groups[key] = {
                'code_etb':           row['etablissement__code_etb'],
                'etablissement':      row['etablissement__nom'],
                'wilaya':             row['etablissement__wilaya'] or '',
                'type_etablissement': row['etablissement__type_etablissement'],
                'code_fil':           row['filiere__code_fil'],
                'filiere':            row['filiere__nom'],
                'domaine_code':       row['filiere__domaine_code'],
                'type_inscription':   row['filiere__type_inscription'],
                'wilaya_cible':       row['filiere__wilaya_cible'],
                'years': [], 'min1s': [], 'min2s': [], 'min3s': [],
            }
        g = groups[key]
        g['years'].append(row['annee'])
        g['min1s'].append(row['min1'])
        g['min2s'].append(row['min2'])
        g['min3s'].append(row['min3'])

    results = []
    for g in list(groups.values())[:50]:  # cap at 50 results
        results.append({
            'code_etb':           g['code_etb'],
            'etablissement':      g['etablissement'],
            'wilaya':             g['wilaya'],
            'type_etablissement': g['type_etablissement'],
            'code_fil':           g['code_fil'],
            'filiere':            g['filiere'],
            'domaine_code':       g['domaine_code'],
            'type_inscription':   g['type_inscription'],
            'wilaya_cible':       g['wilaya_cible'],
            'years':              g['years'],
            'min1s':              g['min1s'],
            'min2s':              g['min2s'],
            'min3s':              g['min3s'],
        })

    return Response({'results': results, 'total': len(groups), 'query': q})