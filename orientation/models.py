"""
orientation/models.py  —  v2
Run after replacing this file:
    python manage.py makemigrations orientation
    python manage.py migrate
"""
from django.db import models


# ─────────────────────────────────────────────
# STATIC CONFIG TABLES  (encoded once per year from the circulaire)
# ─────────────────────────────────────────────

class DomainFormula(models.Model):
    """
    Weighted-average formula for each ميدان, as published in the circulaire.
    One row per domain (e.g. domaine_code='C01' → MI, formula uses note_maths).

    formula_type choices:
        'general'   → use raw bac average (no weighting possible / not applicable)
        'snv'       → (bac×2 + note_svt)         / 3
        'sm'        → (bac×2 + (phys+maths)/2)   / 3
        'mi'        → (bac×2 + note_maths)        / 3
        'arch'      → (bac×2 + (phys+maths)/2)   / 3   (same as SM)
        'lang'      → (bac×2 + note_langue)       / 3
        'trad'      → (bac×2 + moy_3_langues)     / 3
        'st_spec'   → (bac×2 + (note_spec+maths)/2)/3  (ST engineering tracks)
    """
    FORMULA_CHOICES = [
        ('general',  'Moyenne générale uniquement'),
        ('snv',      'Bac×2 + SVT / 3'),
        ('sm',       'Bac×2 + (Physique+Maths)/2 / 3'),
        ('mi',       'Bac×2 + Maths / 3'),
        ('arch',     'Bac×2 + (Physique+Maths)/2 / 3'),
        ('lang',     'Bac×2 + Note langue demandée / 3'),
        ('trad',     'Bac×2 + Moy 3 langues / 3'),
        ('st_spec',  'Bac×2 + (Spécialité+Maths)/2 / 3'),
    ]

    domaine_code   = models.CharField(max_length=5, unique=True, db_index=True)
    domaine_label  = models.CharField(max_length=255)   # human-readable, e.g. "Informatique & Maths"
    formula_type   = models.CharField(max_length=20, choices=FORMULA_CHOICES)
    # which language slot to use for 'lang' formula (e.g. 'francais', 'anglais', 'espagnol')
    langue_cible   = models.CharField(max_length=50, blank=True)

    class Meta:
        verbose_name = "Formule de domaine"

    def __str__(self):
        return f"{self.domaine_code} — {self.domaine_label} ({self.formula_type})"


class BacStreamPriority(models.Model):
    """
    Maps (domaine_code, bac_stream) → priority level (1, 2, or 3).
    Priority determines which min column to compare against (min1/min2/min3).
    Rows only exist for eligible combinations; absence = not eligible.
    """
    BAC_STREAMS = [
        ('SM',    'Sciences et Mathématiques (Riadhiyat)'),
        ('SE',    'Sciences Expérimentales (علوم تجريبية)'),
        ('TR',    'Technique et Raisonnement (Taqni Riadhi)'),
        ('GE',    'Gestion et Économie (Tasyir wa Iqtisad)'),
        ('LL',    'Langues et Littérature (Loghate)'),
        ('LAL',   'Lettres et Langue Arabe (Adab wa Falsafa)'),
        ('ART',   'Arts'),
        ('STAPS', 'Sport (جميع الشعب)'),
    ]

    domaine_code = models.CharField(max_length=5, db_index=True)
    bac_stream   = models.CharField(max_length=10, choices=BAC_STREAMS)
    priority     = models.PositiveSmallIntegerField()   # 1, 2, or 3

    class Meta:
        unique_together = ('domaine_code', 'bac_stream')
        verbose_name = "Priorité par filière de bac"

    def __str__(self):
        return f"{self.domaine_code} | {self.bac_stream} → priorité {self.priority}"


# ─────────────────────────────────────────────
# CORE DATA TABLES  (populated from PDF extraction)
# ─────────────────────────────────────────────

class Etablissement(models.Model):
    ETB_TYPES = [
        ('universite',           'Université'),
        ('centre_universitaire', 'Centre Universitaire'),
        ('grande_ecole',         'Grande École / École Nationale Supérieure'),
        ('ens',                  'École Normale Supérieure (Formation enseignants)'),
        ('institut_sante',       'Institut de Santé Publique (INFSSF…)'),
        ('formation_continue',   'Centre de Formation Continue'),
        ('national',             'Recrutement National'),
    ]

    code_etb           = models.CharField(max_length=20, unique=True, db_index=True)
    nom                = models.CharField(max_length=255)
    wilaya             = models.CharField(max_length=100, null=True, blank=True, db_index=True)
    is_national        = models.BooleanField(default=False)
    type_etablissement = models.CharField(max_length=30, choices=ETB_TYPES, default='universite')

    class Meta:
        indexes = [models.Index(fields=['wilaya', 'type_etablissement'])]

    def __str__(self):
        return f"{self.code_etb} — {self.nom}"


class Filiere(models.Model):
    INSCRIPTION_TYPES = [
        ('local',    'Local / Régional'),
        ('national', 'National'),
    ]

    code_fil       = models.CharField(max_length=20, db_index=True)
    nom            = models.CharField(max_length=255)
    domaine_code   = models.CharField(max_length=5, db_index=True)   # links to DomainFormula
    type_inscription = models.CharField(max_length=10, choices=INSCRIPTION_TYPES, default='local')
    # Wilaya this slot is reserved for (from "-- pour bacheliers X" in PDF)
    # Empty string = no restriction (open to all eligible wilayas)
    wilaya_cible = models.CharField(max_length=100, blank=True, default='', db_index=True)

    class Meta:
        # same code_fil can appear with slightly different noms (geo variants)
        # keep unique on code_fil only; nom variations are cosmetic
        unique_together = ('code_fil', 'wilaya_cible')
        indexes = [
            models.Index(fields=['domaine_code']),
            models.Index(fields=['type_inscription']),
        ]

    def __str__(self):
        return f"{self.code_fil} — {self.nom}"


class ResultatAdmission(models.Model):
    """
    One row = one (etablissement × filiere × annee).

    min1 = cutoff for priority-1 bac streams
    min2 = cutoff for priority-2 bac streams  (NULL if filiere only has 1 priority)
    min3 = cutoff for priority-3 bac streams  (NULL if filiere has ≤2 priorities)

    The student compares their effective score against the min that matches
    their priority for that domain (from BacStreamPriority).
    """
    etablissement = models.ForeignKey(Etablissement, on_delete=models.CASCADE, related_name='resultats')
    filiere       = models.ForeignKey(Filiere,       on_delete=models.CASCADE, related_name='resultats')
    annee         = models.PositiveIntegerField(db_index=True)

    min1 = models.FloatField(null=True, blank=True)
    min2 = models.FloatField(null=True, blank=True)
    min3 = models.FloatField(null=True, blank=True)

    source_pdf  = models.CharField(max_length=255, blank=True)
    source_page = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['etablissement', 'filiere', 'annee'],
                name='unique_resultat_par_annee',
            )
        ]
        indexes = [
            models.Index(fields=['annee']),
            models.Index(fields=['etablissement', 'annee']),
        ]

    def __str__(self):
        return f"{self.etablissement.nom} / {self.filiere.nom} ({self.annee})"