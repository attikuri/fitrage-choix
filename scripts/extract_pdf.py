"""
scripts/extract_pdf.py

Standalone script (no Django needed) that turns the PDF tables into a clean
CSV. Run this FIRST on a single PDF and look at the output before touching
the database — table extraction from real-world PDFs almost always needs a
round of tuning once you see real data.

Usage
-----
    python extract_pdf.py path/to/2023.pdf --annee 2023 --out 2023.csv
    python extract_pdf.py data/pdfs/*.pdf --out all_years.csv     # annee guessed from filename
    python extract_pdf.py path/to/2023.pdf --annee 2023 --debug   # dump raw table for page 1

Install:
    pip install pdfplumber pandas unidecode tqdm
"""
import argparse
import csv
import glob
import re
import sys
from pathlib import Path

import pdfplumber
from tqdm import tqdm
from unidecode import unidecode

# ---------------------------------------------------------------------------
# 1) WILAYA EXTRACTION ALGORITHM
#    -> this is the part you said you'd keep configuring. Everything related
#       to wilaya-matching lives in this section so it's easy to extend.
# ---------------------------------------------------------------------------

# The 58 wilayas of Algeria (post-2019 split), accents stripped, uppercase.
# Add aliases on the right whenever a PDF spells a wilaya differently than
# this canonical list (e.g. "M'SILA" vs "MSILA", "BBA" vs "BORDJ BOU ARRERIDJ").
WILAYAS = {
    "ADRAR": [], "CHLEF": [], "LAGHOUAT": [], "OUM EL BOUAGHI": ["OEB"],
    "BATNA": [], "BEJAIA": ["BEJAIA", "BEJAIA"], "BISKRA": [], "BECHAR": [],
    "BLIDA": [], "BOUIRA": [], "TAMANRASSET": ["TAMANGHASSET"], "TEBESSA": [],
    "TLEMCEN": [], "TIARET": [], "TIZI OUZOU": [], "ALGER": ["ALGIERS"],
    "DJELFA": [], "JIJEL": [], "SETIF": [], "SAIDA": [], "SKIKDA": [],
    "SIDI BEL ABBES": ["SIDI BELABBES"], "ANNABA": [], "GUELMA": [],
    "CONSTANTINE": [], "MEDEA": [], "MOSTAGANEM": [], "MSILA": ["M'SILA"],
    "MASCARA": [], "OUARGLA": [], "ORAN": [], "EL BAYADH": [],
    "ILLIZI": [], "BORDJ BOU ARRERIDJ": ["BBA", "BORDJ BOU ARRERIDJ"],
    "BOUMERDES": [], "EL TARF": [], "TINDOUF": [], "TISSEMSILT": [],
    "EL OUED": [], "KHENCHELA": [], "SOUK AHRAS": [], "TIPAZA": [],
    "MILA": [], "AIN DEFLA": [], "NAAMA": [], "AIN TEMOUCHENT": [],
    "GHARDAIA": [], "RELIZANE": [], "TIMIMOUN": [],
    "BORDJ BADJI MOKHTAR": [], "OULED DJELLAL": [], "BENI ABBES": [],
    "IN SALAH": [], "IN GUEZZAM": [], "TOUGGOURT": [], "DJANET": [],
    "EL MGHAIR": ["EL M'GHAIR"], "EL MENIAA": [],
}

# Flatten canonical-name + aliases -> canonical name, longest first so that
# e.g. "SIDI BEL ABBES" is tried before a shorter accidental partial match.
_WILAYA_LOOKUP = []
for canon, aliases in WILAYAS.items():
    for variant in [canon] + aliases:
        _WILAYA_LOOKUP.append((unidecode(variant).upper(), canon))
_WILAYA_LOOKUP.sort(key=lambda pair: len(pair[0]), reverse=True)


def _clean_for_matching(text: str) -> str:
    """Uppercase, strip accents, collapse whitespace — used only for matching,
    never for what we actually store."""
    text = unidecode(text or "").upper()
    text = re.sub(r"[\.\-_/]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def extract_wilaya(etablissement_text: str):
    """
    Returns (wilaya: str|None, is_national: bool, confidence: str)

    Rules (as described):
      1. "RECRUTEMENT NATIONAL"  -> applies to every wilaya, no specific one.
      2. "UNIV. <wilaya>"        -> whatever comes right after UNIV is the wilaya.
      3. Anything else           -> fall back to scanning the whole string for
                                     a known wilaya name (covers "C.UNIV ...",
                                     "ECOLE ... ", "INSTITUT ...", etc.)
      If nothing matches, wilaya=None and confidence="A_VERIFIER" so you can
      collect these and decide how to handle them later.
    """
    clean = _clean_for_matching(etablissement_text)

    if "RECRUTEMENT NATIONAL" in clean:
        return None, True, "national"

    # Rule 2: text right after UNIV / UNIVERSITE
    m = re.search(r"\bUNIV(?:ERSITE)?\b\.?\s*(.*)", clean)
    if m:
        remainder = m.group(1).strip()
        for variant, canon in _WILAYA_LOOKUP:
            if remainder.startswith(variant):
                return canon, False, "univ_prefix"

    # Rule 3: fallback - look for any known wilaya name anywhere in the string
    for variant, canon in _WILAYA_LOOKUP:
        if re.search(rf"\b{re.escape(variant)}\b", clean):
            return canon, False, "fallback_scan"

    return None, False, "A_VERIFIER"


# ---------------------------------------------------------------------------
# 2) PDF TABLE EXTRACTION
# ---------------------------------------------------------------------------

HEADER_HINTS = {"CODE ETB", "CODEETB", "ETABLISSEMENT", "CODE FIL", "FILIERE"}

# Tune these if your PDF's grid isn't detected well. "lines" works when the
# table has visible ruling lines (which yours does, per the screenshot).
TABLE_SETTINGS = {
    "vertical_strategy": "lines",
    "horizontal_strategy": "lines",
}


def _is_header_row(cells) -> bool:
    joined = _clean_for_matching(" ".join(c or "" for c in cells))
    return any(hint in joined for hint in HEADER_HINTS)


def _to_float(value):
    if value is None:
        return None
    value = value.strip().replace(",", ".")
    if value == "" or value == "-":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _clean_cell(value) -> str:
    return re.sub(r"\s+", " ", (value or "").replace("\n", " ")).strip()


def parse_pdf(pdf_path: str, annee: int, debug: bool = False):
    """Yields one dict per (etablissement, filiere) row found in the PDF."""
    records = []
    pending = None  # holds the last record, in case the next row is a
                     # text-wrap continuation rather than a new record

    with pdfplumber.open(pdf_path) as pdf:
        pages = pdf.pages
        iterator = tqdm(pages, desc=Path(pdf_path).name, unit="page")
        for page_num, page in enumerate(iterator, start=1):
            table = page.extract_table(TABLE_SETTINGS)
            if not table:
                continue

            if debug and page_num == 1:
                print("\n--- RAW TABLE, PAGE 1 (first 8 rows) ---")
                for row in table[:8]:
                    print(row)
                print("--- END RAW TABLE ---\n")

            for row in table:
                cells = [_clean_cell(c) for c in row]
                # pad/truncate defensively in case a row has a stray extra
                # column from a merged cell
                if len(cells) < 7:
                    cells += [""] * (7 - len(cells))
                code_etb, etab, code_fil, filiere, min1, min2, min3 = cells[:7]

                if _is_header_row(cells):
                    continue

                is_continuation = not code_etb and not code_fil and not min1 and not min2 and not min3
                if is_continuation and pending is not None:
                    # wrapped text from the row above - glue it back on
                    if etab:
                        pending["etablissement"] += " " + etab
                    if filiere:
                        pending["filiere"] += " " + filiere
                    continue

                if not code_etb and not code_fil:
                    # empty/decorative row, nothing to salvage
                    continue

                if pending is not None:
                    records.append(pending)

                wilaya, is_national, confidence = extract_wilaya(etab)
                pending = {
                    "code_etb": code_etb,
                    "etablissement": etab,
                    "wilaya": wilaya,
                    "is_national": is_national,
                    "wilaya_confidence": confidence,
                    "code_fil": code_fil,
                    "filiere": filiere,
                    "min1": _to_float(min1),
                    "min2": _to_float(min2),
                    "min3": _to_float(min3),
                    "annee": annee,
                    "source_pdf": Path(pdf_path).name,
                    "source_page": page_num,
                }

        if pending is not None:
            records.append(pending)

    return records


def guess_annee_from_filename(path: str):
    m = re.search(r"(20\d{2})", Path(path).stem)
    return int(m.group(1)) if m else None


# ---------------------------------------------------------------------------
# 3) CLI
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("pdfs", nargs="+", help="One or more PDF paths (glob ok)")
    parser.add_argument("--annee", type=int, default=None,
                         help="Force the year for ALL given PDFs. If omitted, "
                              "the year is guessed from each filename (needs a 4-digit year in it).")
    parser.add_argument("--out", default="extracted.csv", help="Output CSV path")
    parser.add_argument("--debug", action="store_true",
                         help="Print the raw table for page 1 of each PDF before parsing")
    args = parser.parse_args()

    # expand globs in case the shell didn't (e.g. on Windows cmd)
    pdf_paths = []
    for p in args.pdfs:
        matches = glob.glob(p)
        pdf_paths.extend(matches if matches else [p])

    all_records = []
    to_review = []

    for pdf_path in pdf_paths:
        annee = args.annee or guess_annee_from_filename(pdf_path)
        if annee is None:
            print(f"!! Could not determine 'annee' for {pdf_path}. "
                  f"Pass --annee or rename the file to include a 4-digit year.")
            sys.exit(1)
        records = parse_pdf(pdf_path, annee, debug=args.debug)
        all_records.extend(records)
        to_review.extend(r for r in records if r["wilaya_confidence"] == "A_VERIFIER")

    if not all_records:
        print("No rows extracted. Run with --debug on one PDF to inspect the raw table output.")
        return

    fieldnames = list(all_records[0].keys())
    with open(args.out, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(all_records)

    print(f"\nWrote {len(all_records)} rows to {args.out}")
    if to_review:
        review_path = Path(args.out).with_suffix(".to_review.csv")
        with open(review_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(to_review)
        print(f"{len(to_review)} rows had no wilaya match -> see {review_path} "
              f"and extend WILAYAS / extract_wilaya() accordingly.")


if __name__ == "__main__":
    main()