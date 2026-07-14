"""
scripts/fix_wilayas.py

You manually fixed the wilaya column in one extracted CSV (marking rows as
"vérifié" instead of "A_VERIFIER"). Since the same établissements show up
across years, this script takes that corrected file as a reference and
auto-applies the same fixes to your other extracted CSVs, matching rows by
code_etb (and falling back to a normalized établissement name if needed).

It also writes wilaya_overrides.csv, a clean (code_etb, etablissement,
wilaya) table you can keep reusing — including passing it to extract_pdf.py
via --overrides on every future PDF, so new years skip the guessing for
establishments you've already verified.

Usage
-----
    python fix_wilayas.py --reference ../data/extracted/2023.csv \
                           --targets ../data/extracted/2022.csv ../data/extracted/2021.csv

    # glob also works:
    python fix_wilayas.py --reference ../data/extracted/2023.csv \
                           --targets "../data/extracted/202*.csv"

By default each target is written next to the original as <name>.fixed.csv
(originals untouched). Pass --in-place to overwrite the targets directly.
"""
import argparse
import csv
import glob
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from extract_pdf import _clean_for_matching  # reuse the same normalization


def build_overrides(reference_path):
    """Reads the corrected reference CSV and returns:
    by_code  -> {code_etb: wilaya}
    by_name  -> {normalized_etablissement_name: wilaya}   (fallback key)
    """
    by_code, by_name = {}, {}
    with open(reference_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            wilaya = (row.get("wilaya") or "").strip()
            if not wilaya:
                continue  # nothing to propagate (still unresolved, or genuinely national)
            code = (row.get("code_etb") or "").strip()
            name_key = _clean_for_matching(row.get("etablissement") or "")
            if code:
                by_code[code] = wilaya
            if name_key:
                by_name.setdefault(name_key, wilaya)
    return by_code, by_name


def apply_to_target(target_path, by_code, by_name):
    with open(target_path, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        fieldnames = reader.fieldnames

    fixed, untouched_unresolved = 0, 0
    for row in rows:
        if (row.get("is_national") or "").strip().lower() in ("true", "1"):
            continue  # national rows are correctly wilaya-less, leave them be

        if (row.get("wilaya") or "").strip():
            continue  # already has a wilaya - don't touch rows that already matched

        code = (row.get("code_etb") or "").strip()
        name_key = _clean_for_matching(row.get("etablissement") or "")
        new_wilaya = by_code.get(code) or by_name.get(name_key)

        if new_wilaya:
            row["wilaya"] = new_wilaya
            if "wilaya_confidence" in row:
                row["wilaya_confidence"] = "propagated_from_reference"
            fixed += 1
        else:
            untouched_unresolved += 1

    return rows, fieldnames, fixed, untouched_unresolved


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", required=True, help="The CSV you manually corrected")
    parser.add_argument("--targets", required=True, nargs="+", help="Other CSV(s) to fix, glob ok")
    parser.add_argument("--in-place", action="store_true",
                         help="Overwrite the target files instead of writing <name>.fixed.csv")
    parser.add_argument("--overrides-out", default="wilaya_overrides.csv",
                         help="Where to save the reusable code_etb->wilaya mapping")
    args = parser.parse_args()

    by_code, by_name = build_overrides(args.reference)
    print(f"Reference {args.reference}: {len(by_code)} establishments with a verified wilaya "
          f"({len(by_name)} unique names as fallback).")

    # save the reusable mapping for extract_pdf.py --overrides next time
    with open(args.overrides_out, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["code_etb", "wilaya"])
        for code, wilaya in sorted(by_code.items()):
            writer.writerow([code, wilaya])
    print(f"Saved reusable mapping -> {args.overrides_out} "
          f"(pass this to extract_pdf.py via --overrides for future years)")

    target_paths = []
    for p in args.targets:
        matches = glob.glob(p)
        target_paths.extend(matches if matches else [p])

    for target in target_paths:
        rows, fieldnames, fixed, unresolved = apply_to_target(target, by_code, by_name)

        out_path = Path(target) if args.in_place else Path(target).parent / (Path(target).stem + ".fixed.csv")
        with open(out_path, "w", newline="", encoding="utf-8") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(rows)

        print(f"{target}: fixed {fixed} rows -> {out_path}  "
              f"({unresolved} still unresolved, still genuinely A_VERIFIER)")


if __name__ == "__main__":
    main()