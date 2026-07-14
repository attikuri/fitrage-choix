"""
orientation/management/commands/seed_config.py

Populates DomainFormula and BacStreamPriority from the circulaire rules.
Run ONCE after load_admissions:
    python manage.py seed_config

Safe to re-run (uses update_or_create).
Update this file each year if the circulaire changes formulas or priorities.
"""
from django.core.management.base import BaseCommand
from orientation.models import DomainFormula, BacStreamPriority


# ─────────────────────────────────────────────────────────────
# 1. DOMAIN FORMULA MAP
#    domaine_code → (label, formula_type, langue_cible)
#
#    formula_type values:
#      'general'  → raw bac average
#      'snv'      → (bac×2 + note_SVT) / 3
#      'sm'       → (bac×2 + (physique + maths)/2) / 3
#      'mi'       → (bac×2 + maths) / 3
#      'lang'     → (bac×2 + note_langue_cible) / 3
#      'trad'     → (bac×2 + moy_3_langues) / 3
#      'st_spec'  → (bac×2 + (note_spécialité + maths)/2) / 3
# ─────────────────────────────────────────────────────────────
DOMAIN_FORMULAS = {
    # ── Sciences et Technologie (Ingénieur / Licence ST) ──────
    # تقني رياضي priority, specialization-weighted formula
    'A00': ('Sciences et Technologies',                     'st_spec', ''),
    'A01': ('Génie Minier',                                 'st_spec', ''),
    'A02': ('Automatique',                                  'st_spec', ''),
    'A03': ('Hydrocarbures',                                'st_spec', ''),
    'A04': ('Métallurgie',                                  'st_spec', ''),
    'A05': ('Génie Civil',                                  'sm', ''),
    'A06': ('Aéronautique',                                 'st_spec', ''),
    'A07': ('Électromécanique',                             'st_spec', ''),
    'A08': ('Génie des Procédés',                           'st_spec', ''),
    'A09': ('Énergies Renouvelables',                       'st_spec', ''),
    'A10': ('Génie Maritime',                               'st_spec', ''),
    'A11': ('Optique et Mécanique de Précision',            'st_spec', ''),
    'A12': ('Hydraulique',                                  'st_spec', ''),
    'A13': ('Industries Pétrochimiiques',                   'st_spec', ''),
    'A14': ('Ingénierie des Transports',                    'st_spec', ''),
    'A15': ('Travaux Publics',                              'st_spec', ''),
    'A16': ('Électrotechnique',                             'st_spec', ''),
    'A17': ('Électronique',                                 'st_spec', ''),
    'A18': ('Génie Industriel',                             'st_spec', ''),
    'A19': ('Génie Mécanique',                              'st_spec', ''),
    'A20': ('Télécommunications',                           'st_spec', ''),
    'A21': ('Hygiène et Sécurité Industrielle',             'st_spec', ''),
    'A22': ('Génie Biomédical',                             'st_spec', ''),

    # ── Sciences de la Matière ────────────────────────────────
    # (bac×2 + (physique + maths)/2) / 3
    'B00': ('Sciences de la Matière',                       'sm', ''),
    'B01': ('Chimie',                                       'sm', ''),
    'B02': ('Physique',                                     'sm', ''),

    # ── Mathématiques et Informatique ─────────────────────────
    # (bac×2 + maths) / 3
    'C00': ('Cycle Prépa Informatique (ENS)',                'mi', ''),
    'C01': ('Informatique',                                  'mi', ''),
    'C02': ('Mathématiques',                                 'mi', ''),
    'C03': ('Mathématiques Appliquées',                      'mi', ''),
    'CA0': ('Informatique + Automatique',                    'mi', ''),
    'CC1': ('Maths Appliquées — IA & Data Science',          'mi', ''),
    'CF0': ('Maths Appliquées + Sciences Éco.',              'mi', ''),
    'CF1': ('Maths & Info Appliquées — Éco. & Gestion',      'mi', ''),
    'CI1': ('Maths & Info Appliquées — SHS',                 'mi', ''),

    # ── Sciences de la Nature et de la Vie / Santé / Bio ─────
    # (bac×2 + note_SVT) / 3
    'D00': ('Sciences de la Nature et de la Vie',            'snv', ''),
    'D01': ('Biotechnologie',                                'snv', ''),
    'D02': ('Sciences Biologiques',                          'snv', ''),
    'D03': ('Sciences Agronomiques',                         'snv', ''),
    'D05': ('Hydrobiologie Marine et Continentale',          'snv', ''),
    'D06': ('Écologie et Environnement',                     'snv', ''),
    'D07': ('Sciences Alimentaires',                         'snv', ''),

    # ── Sciences de la Terre ──────────────────────────────────
    # Géologie/Géophysique: SE/SM priority, SVT formula is closest
    'E01': ('Géographie et Aménagement du Territoire',       'snv', ''),
    'E02': ('Géophysique',                                   'sm',  ''),
    'E03': ('Géologie',                                      'snv', ''),

    # ── Sciences Économiques, Gestion, Commerce ───────────────
    # Moyenne générale
    'F00': ('Cycle Prépa Commerce (ESC Koléa)',              'general', ''),
    'F01': ('Sciences de Gestion',                           'general', ''),
    'F02': ('Sciences Financières et Comptabilité',          'general', ''),
    'F03': ('Sciences Commerciales',                         'general', ''),
    'F04': ('Sciences Économiques',                          'general', ''),
    'FC1': ('Économie Quantitative et Informatique',         'general', ''),
    'FF1': ('Ingénierie Financière',                         'general', ''),
    'FH0': ('Sciences de Gestion + Langue Anglaise',         'general', ''),
    'FI1': ('Santé et Protection Sociale',                   'general', ''),

    # ── Droit et Sciences Politiques ──────────────────────────
    # Moyenne générale
    'G00': ('Cycle Prépa Sciences Politiques (ENS)',         'general', ''),
    'G01': ('Sciences Politiques',                           'general', ''),
    'G02': ('Droit',                                         'general', ''),
    'GC0': ('Droit + Informatique',                          'general', ''),
    'GF0': ('Droit + Sciences Financières',                  'general', ''),
    'GG0': ('Droit + Sciences Politiques',                   'general', ''),
    'GG1': ('Études Politiques et Innovation Publique',      'general', ''),
    'GH0': ('Sciences Politiques + Langue Anglaise',         'general', ''),

    # ── Langues Étrangères ────────────────────────────────────
    'H01': ('Langue Française',         'lang', 'francais'),
    'H02': ('Langue Espagnole',         'lang', 'espagnol'),
    'H03': ('Traduction',               'trad', ''),
    'H04': ('Langue Allemande',         'lang', 'allemand'),
    'H05': ('Langue Russe',             'general', ''),   # générale per circulaire
    'H06': ('Langue Anglaise',          'lang', 'anglais'),
    'H07': ('Langue Italienne',         'general', ''),   # générale per circulaire
    'H08': ('Langue Turque',            'general', ''),   # générale per circulaire
    'H09': ('Langue Chinoise',          'general', ''),   # générale per circulaire
    'HF0': ('Langues Étr. + Finances',  'lang', 'anglais'),
    'HG0': ('Langue Anglaise + Sciences Po.', 'lang', 'anglais'),

    # ── Sciences Humaines et Sociales ─────────────────────────
    'I00': ('Histoire-Géographie (Enseignement)',            'general', ''),
    'I02': ('Sciences Islamiques (Enseignement)',            'general', ''),
    'I03': ('Sciences Humaines — SIC',                       'general', ''),
    'I04': ('Histoire et Big Data',                          'general', ''),
    'I10': ('Sociologie des Loisirs',                        'general', ''),
    'I12': ('Archéologie',                                   'general', ''),
    'I13': ('Philosophie (Enseignement)',                     'general', ''),
    'I14': ('Bibliothéconomie',                              'general', ''),
    'I17': ('Sciences Humaines',                             'general', ''),
    'I19': ('Sciences Sociales',                             'general', ''),
    'I20': ('Sciences Islamiques',                           'general', ''),
    'IC0': ('Informatique + SIC',                            'general', ''),
    'IF0': ('Sciences Éco. + SIC',                           'general', ''),
    'IF1': ('Communication Digitale et Management',          'general', ''),
    'IG0': ('SIC + Sciences Politiques',                     'general', ''),
    'II1': ('Communication Touristique',                     'general', ''),
    'IJ0': ('SIC + Entraînement Sportif',                    'general', ''),

    # ── STAPS ─────────────────────────────────────────────────
    'J00': ('STAPS',                                         'general', ''),
    'JI1': ('Éducation Psychomotrice',                       'general', ''),

    # ── Arts ──────────────────────────────────────────────────
    'K00': ('Musique (Enseignement)',                         'general', ''),
    'K01': ('Écriture de Scénario',                          'general', ''),
    'K02': ('Art Dramatique',                                'general', ''),
    'KK1': ('Cinéma et Média Numérique',                     'general', ''),

    # ── Langue et Littérature Arabes / Amazigh ────────────────
    'L00': ('Langue et Littérature Arabes',                  'general', ''),
    'M00': ('Langue et Culture Amazighes',                   'general', ''),

    # ── Architecture et Urbanisme ─────────────────────────────
    # (bac×2 + (physique + maths)/2) / 3   (same as SM)
    'N00': ('Cycle Prépa Architecture (EPAU)',               'sm', ''),
    'N01': ('Gestion des Techniques Urbaines',               'sm', ''),
    'N02': ('Métiers de la Ville',                           'sm', ''),
    'N04': ('Urbanisme',                                     'sm', ''),
    'N05': ('Architecture',                                  'sm', ''),
    'NA0': ('Architecture + Génie Civil',                    'sm', ''),
    'NI0': ('Architecture + Sociologie',                     'sm', ''),

    # ── Médecine / Pharmacie / Vétérinaire ────────────────────
    # (bac×2 + SVT) / 3
    'P01': ('Médecine',                                      'snv', ''),
    'P02': ('Pharmacie',                                     'snv', ''),
    'P03': ('Médecine Dentaire',                             'snv', ''),
    'P04': ('Sciences Vétérinaires',                         'snv', ''),
    'P05': ('Pharmacie Industrie',                           'snv', ''),
    'P06': ('Pharmacie Auxiliaires',                         'snv', ''),
    'PC0': ('Médecine + Informatique',                       'snv', ''),
    'PD0': ('Médecine + Sciences Biologiques',               'snv', ''),
    'PF0': ('Médecine + Sciences Économiques',               'snv', ''),
    'PI0': ('Médecine + Psychologie',                        'snv', ''),

    # ── Santé Publique Paramédicale ───────────────────────────
    # Sage-femme, infirmier, kiné, labo, etc. → SNV formula
    'W01': ('Sage-Femme de Santé Publique',                  'snv', ''),
    'X01': ('Diététicien de Santé Publique',                 'snv', ''),
    'X02': ('Ergothérapeute de Santé Publique',              'snv', ''),
    'X03': ('Infirmier de Santé Publique',                   'snv', ''),
    'X04': ('Laborantin de Santé Publique',                  'snv', ''),
    'X05': ('Kinésithérapeute de Santé Publique',            'snv', ''),
    'X06': ('Hygiéniste de Santé Publique',                  'snv', ''),
    'X07': ('Préparateur en Pharmacie',                      'snv', ''),
    'X08': ('Assistant Médical de Santé Publique',           'snv', ''),
    'X09': ('Assistant Social de Santé Publique',            'general', ''),
    'X10': ('Opticien-Lunetier de Santé Publique',           'snv', ''),
    'X11': ('Manipulateur en Imagerie Médicale',             'snv', ''),
    'X12': ('Psychomotricien de Santé Publique',             'snv', ''),
    'X13': ('Appareilleur Orthopédiste',                     'snv', ''),
    'X14': ('Orthoptiste de Santé Publique',                 'snv', ''),
    'X15': ('Audioprothésiste de Santé Publique',            'snv', ''),
}


# ─────────────────────────────────────────────────────────────
# 2. BAC STREAM PRIORITIES PER DOMAIN
#
#    (domaine_code, bac_stream) → priority (1, 2, or 3)
#    Absence = not eligible for that domain.
#
#    Bac stream codes:
#      SM   = Sciences et Mathématiques (رياضيات)
#      SE   = Sciences Expérimentales (علوم تجريبية)
#      TR   = Technique-Raisonnement / Taqni Riadhi (تقني رياضي)
#      GE   = Gestion et Économie (تسيير واقتصاد)
#      LL   = Langues Étrangères (لغات أجنبية)
#      LAL  = Lettres & Langue Arabe / Adab wa Falsafa (آداب وفلسفة)
#      ART  = Arts (فنون)
#      ALL  = All streams (STAPS, Arts priority 2)
# ─────────────────────────────────────────────────────────────

def _prios(codes, stream_prio_pairs):
    """Return list of (code, stream, priority) tuples."""
    return [(c, s, p) for c in codes for s, p in stream_prio_pairs]


BAC_PRIORITIES = []

# ── Sciences et Technologies (A codes) ──────────────────────
# Priority 1: TR (their natural stream), then SM/SE as 2
A_CODES = ['A00','A01','A02','A03','A04','A05','A06','A07','A08','A09',
           'A10','A11','A12','A13','A14','A15','A16','A17','A18','A19',
           'A20','A21','A22']
BAC_PRIORITIES += _prios(A_CODES, [('TR',1), ('SM',2), ('SE',2)])

# ── Sciences de la Matière (B codes) ────────────────────────
# SM/SE/TR all priority 1 (all three listed on same priority in circulaire)
B_CODES = ['B00','B01','B02']
BAC_PRIORITIES += _prios(B_CODES, [('SM',1), ('SE',1), ('TR',1)])

# ── Mathématiques et Informatique (C codes) ─────────────────
# SM priority 1, SE and TR priority 2
C_CODES = ['C00','C01','C02','C03','CA0','CC1','CF0','CF1','CI1']
BAC_PRIORITIES += _prios(C_CODES, [('SM',1), ('SE',2), ('TR',2)])

# ── Sciences Nature et Vie / Bio / Agro (D codes) ───────────
# SE and SM priority 1, TR priority 2
D_CODES = ['D00','D01','D02','D03','D05','D06','D07']
BAC_PRIORITIES += _prios(D_CODES, [('SE',1), ('SM',1), ('TR',2)])

# ── Sciences de la Terre (E codes) ──────────────────────────
BAC_PRIORITIES += _prios(['E01'], [('SE',1), ('SM',1), ('TR',2)])  # Géographie
BAC_PRIORITIES += _prios(['E02'], [('SM',1), ('SE',1), ('TR',2)])  # Géophysique
BAC_PRIORITIES += _prios(['E03'], [('SE',1), ('SM',1), ('TR',2)])  # Géologie

# ── Économie / Gestion / Commerce (F codes) ─────────────────
# GE and LAL priority 1, SM/SE/TR priority 2, LL priority 3
F_CODES = ['F00','F01','F02','F03','F04','FC1','FF1','FH0','FI1']
BAC_PRIORITIES += _prios(F_CODES, [('GE',1), ('LAL',1), ('SM',2), ('SE',2), ('TR',2), ('LL',3)])

# ── Droit et Sciences Politiques (G codes) ──────────────────
# LAL/LL/GE/ART priority 1, SE/SM priority 2, TR priority 3
G_CODES = ['G00','G01','G02','GC0','GF0','GG0','GG1','GH0']
BAC_PRIORITIES += _prios(G_CODES, [('LAL',1), ('LL',1), ('GE',1), ('ART',1),
                                    ('SE',2), ('SM',2), ('TR',3)])

# ── Langues Étrangères (H codes) ────────────────────────────
# FR / EN / ES / DE: LL=1, LAL=2, SE/GE/ART=3
for code in ['H01','H02','H04','H06','HF0','HG0']:
    BAC_PRIORITIES += [(code,'LL',1), (code,'LAL',2),
                       (code,'SE',3), (code,'GE',3), (code,'ART',3)]

# IT: LL=1, LAL=2, SE/SM/TR/GE/ART=3
BAC_PRIORITIES += [('H07','LL',1), ('H07','LAL',2),
                   ('H07','SE',3), ('H07','SM',3), ('H07','TR',3),
                   ('H07','GE',3), ('H07','ART',3)]

# RU/CN/TR: LL+LAL=1, SE/GE/ART=2
for code in ['H05','H08','H09']:
    BAC_PRIORITIES += [(code,'LL',1), (code,'LAL',1),
                       (code,'SE',2), (code,'GE',2), (code,'ART',2)]

# Traduction: LL=1, LAL=2
BAC_PRIORITIES += [('H03','LL',1), ('H03','LAL',2)]

# ── Sciences Humaines et Sociales (I codes) ─────────────────
# LAL/LL/ART=1, SE=2  (Islamic sciences also accept SM/GE at priority 2)
I_STANDARD = ['I03','I04','I10','I12','I14','I17','I19','IC0','IF0','IF1','IG0','II1','IJ0']
I_ENS      = ['I00','I13']   # Histoire/Philo enseignement: same
I_ISLAMIC  = ['I02','I20']   # Sciences islamiques: also SM/GE priority 1

BAC_PRIORITIES += _prios(I_STANDARD + I_ENS,
                          [('LAL',1), ('LL',1), ('ART',1), ('SE',2)])
BAC_PRIORITIES += _prios(I_ISLAMIC,
                          [('LAL',1), ('LL',1), ('SM',1), ('ART',1),
                           ('SE',2), ('GE',2)])

# ── STAPS (J codes) ─────────────────────────────────────────
# All streams, all priority 1
for code in ['J00','JI1']:
    for s in ['SM','SE','TR','GE','LL','LAL','ART']:
        BAC_PRIORITIES.append((code, s, 1))

# ── Arts (K codes) ──────────────────────────────────────────
# ART priority 1, all others priority 2
for code in ['K00','K01','K02','KK1']:
    BAC_PRIORITIES.append((code, 'ART', 1))
    for s in ['SM','SE','TR','GE','LL','LAL']:
        BAC_PRIORITIES.append((code, s, 2))

# ── Langue Arabe / Amazigh (L, M codes) ─────────────────────
# LAL/LL/ART=1, SE/GE=2
for code in ['L00','M00']:
    BAC_PRIORITIES += [(code,'LAL',1), (code,'LL',1), (code,'ART',1),
                       (code,'SE',2), (code,'GE',2)]

# ── Architecture et Urbanisme (N codes) ─────────────────────
# SM/TR/SE all priority 1
N_CODES = ['N00','N01','N02','N04','N05','NA0','NI0']
BAC_PRIORITIES += _prios(N_CODES, [('SM',1), ('TR',1), ('SE',1)])

# ── Médecine / Pharmacie / Vétérinaire (P codes) ────────────
# SE/SM priority 1, TR priority 2
P_CODES = ['P01','P02','P03','P04','P05','P06','PC0','PD0','PF0','PI0']
BAC_PRIORITIES += _prios(P_CODES, [('SE',1), ('SM',1), ('TR',2)])

# ── Santé Publique Paramédicale (W, X codes) ────────────────
# SE/SM priority 1, TR priority 2
HEALTH_CODES = ['W01','X01','X02','X03','X04','X05','X06','X07',
                'X08','X09','X10','X11','X12','X13','X14','X15']
BAC_PRIORITIES += _prios(HEALTH_CODES, [('SE',1), ('SM',1), ('TR',2)])


# ─────────────────────────────────────────────────────────────
# MANAGEMENT COMMAND
# ─────────────────────────────────────────────────────────────
class Command(BaseCommand):
    help = "Seed DomainFormula and BacStreamPriority from circulaire rules"

    def handle(self, *args, **options):
        # ── DomainFormula ──────────────────────────────────────
        created_f = updated_f = 0
        for code, (label, formula_type, langue) in DOMAIN_FORMULAS.items():
            _, created = DomainFormula.objects.update_or_create(
                domaine_code=code,
                defaults={
                    'domaine_label': label,
                    'formula_type':  formula_type,
                    'langue_cible':  langue,
                }
            )
            if created:
                created_f += 1
            else:
                updated_f += 1

        # ── BacStreamPriority ──────────────────────────────────
        created_p = updated_p = 0
        for code, stream, priority in BAC_PRIORITIES:
            _, created = BacStreamPriority.objects.update_or_create(
                domaine_code=code,
                bac_stream=stream,
                defaults={'priority': priority}
            )
            if created:
                created_p += 1
            else:
                updated_p += 1

        self.stdout.write(self.style.SUCCESS(
            f"\nDone.\n"
            f"  DomainFormula    : {created_f} created, {updated_f} updated\n"
            f"  BacStreamPriority: {created_p} created, {updated_p} updated"
        ))