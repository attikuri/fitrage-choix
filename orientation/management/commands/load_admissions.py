"""
orientation/management/commands/load_admissions.py  —  v2

    python manage.py load_admissions path/to/all_enriched.csv
"""
import csv
from django.core.management.base import BaseCommand
from django.db import transaction
from orientation.models import Etablissement, Filiere, ResultatAdmission


def to_float(val):
    try:
        return float(val) if str(val) not in ('', 'nan', 'None') else None
    except (ValueError, TypeError):
        return None


class Command(BaseCommand):
    help = "Load enriched admission CSV into the database (v2)"

    def add_arguments(self, parser):
        parser.add_argument('csv_path', help="Path to all_enriched.csv")

    def handle(self, *args, **options):
        path = options['csv_path']
        self.stdout.write(f"Loading {path} ...")

        with open(path, newline='', encoding='utf-8') as f:
            rows = list(csv.DictReader(f))

        self.stdout.write(f"  {len(rows)} rows to process")

        etb_cache = {}   # code_etb → Etablissement
        fil_cache = {}   # (code_fil, wilaya_cible) → Filiere

        created_etb = created_fil = created_res = skipped_res = 0

        with transaction.atomic():
            for row in rows:

                # ── Etablissement ──────────────────────────────
                code_etb = row['code_etb'].strip()
                if code_etb not in etb_cache:
                    etb, created = Etablissement.objects.get_or_create(
                        code_etb=code_etb,
                        defaults={
                            'nom':                row['etablissement'].strip(),
                            'wilaya':             row['wilaya'].strip() if row.get('wilaya', '') not in ('', 'nan') else None,
                            'is_national':        row['is_national'] in ('True', 'true', '1'),
                            'type_etablissement': row.get('type_etablissement', 'universite').strip(),
                        }
                    )
                    etb_cache[code_etb] = etb
                    if created:
                        created_etb += 1
                else:
                    etb = etb_cache[code_etb]

                # ── Filiere ────────────────────────────────────
                code_fil     = row['code_fil'].strip()
                type_insc    = row.get('type_inscription', 'local').strip()
                wilaya_cible = row.get('wilaya_cible', '').strip()
                fil_key      = (code_fil, wilaya_cible)

                if fil_key not in fil_cache:
                    fil, created = Filiere.objects.get_or_create(
                        code_fil=code_fil,
                        wilaya_cible=wilaya_cible,
                        defaults={
                            'nom':             row['filiere'].strip(),
                            'domaine_code':    row.get('domaine_code', code_fil[:3]).strip(),
                            'type_inscription': type_insc,
                        }
                    )
                    fil_cache[fil_key] = fil
                    if created:
                        created_fil += 1
                else:
                    fil = fil_cache[fil_key]

                # ── ResultatAdmission ──────────────────────────
                _, created = ResultatAdmission.objects.get_or_create(
                    etablissement=etb,
                    filiere=fil,
                    annee=int(row['annee']),
                    defaults={
                        'min1':        to_float(row.get('min1')),
                        'min2':        to_float(row.get('min2')),
                        'min3':        to_float(row.get('min3')),
                        'source_pdf':  row.get('source_pdf', ''),
                        'source_page': int(row['source_page']) if str(row.get('source_page', '')).isdigit() else None,
                    }
                )
                if created:
                    created_res += 1
                else:
                    skipped_res += 1

        self.stdout.write(self.style.SUCCESS(
            f"\nDone.\n"
            f"  Etablissements : {created_etb} created\n"
            f"  Filieres       : {created_fil} created\n"
            f"  Resultats      : {created_res} created, {skipped_res} already existed"
        ))