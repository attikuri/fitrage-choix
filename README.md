# filtrage-choix — setup guide

## 0) What you're building

```
filtrage-choix/
├── venv/                          <- virtual env (don't commit this)
├── manage.py
├── filtrage_choix/                <- Django project (settings, urls)
├── orientation/                   <- Django app (models + the loader command)
│   ├── models.py
│   └── management/commands/load_admissions.py
├── scripts/
│   └── extract_pdf.py             <- standalone PDF -> CSV extractor (no Django)
├── data/
│   ├── pdfs/                      <- put your raw PDFs here (gitignore this)
│   └── extracted/                 <- CSVs go here before loading into the DB
└── requirements.txt
```

The PDF→DB pipeline is split in two steps **on purpose**:
`PDF -> CSV` (scripts/extract_pdf.py), then `CSV -> DB` (manage.py load_admissions).
With 1200-1400 pages you want to eyeball/fix the CSV before it ever touches
the database — re-running a Python script is free, re-cleaning a messy DB is not.

---

## 1) Create the folder + venv

Open a terminal in VS Code (`` Ctrl+` ``) wherever you want the project.

**Windows (PowerShell):**
```powershell
mkdir filtrage-choix; cd filtrage-choix
py -3 -m venv venv
venv\Scripts\Activate.ps1
```
> If you get a "running scripts is disabled" error, run this once:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

**macOS / Linux:**
```bash
mkdir filtrage-choix && cd filtrage-choix
python3 -m venv venv
source venv/bin/activate
```

Once activated, your terminal prompt should show `(venv)`. In VS Code, also
hit `Ctrl+Shift+P` → "Python: Select Interpreter" → pick the one inside
`venv/` so the editor's IntelliSense matches what's actually installed.

---

## 2) Install packages

Save the `requirements.txt` below into the project root, then:
```bash
pip install --upgrade pip
pip install -r requirements.txt
```

`requirements.txt`:
```
Django>=5.0,<6.0
pdfplumber>=0.11.0
pandas>=2.2.0
openpyxl>=3.1.0
tqdm>=4.66.0
unidecode>=1.3.8
```

- **Django** — the web framework / ORM you'll query your data with later.
- **pdfplumber** — reads the PDF tables (works well for ruled/bordered tables like yours).
- **pandas / openpyxl** — handy for inspecting/cleaning CSVs, exporting to Excel.
- **tqdm** — progress bar (you'll want this for 1400 pages).
- **unidecode** — strips accents so "Bélgaïa" / "Bejaia" / "BÉJAÏA" all match.

You do **not** need PostgreSQL/MySQL to start — SQLite (Django's default) is
fine for a dataset this size and needs zero setup.

---

## 3) Bootstrap the Django project

Still inside the activated venv, from the `filtrage-choix/` folder:
```bash
django-admin startproject filtrage_choix .
python manage.py startapp orientation
```
The trailing `.` matters — it puts `manage.py` directly in `filtrage-choix/`
instead of nesting another folder.

Then:
1. Open `filtrage_choix/settings.py` and add `"orientation"` to `INSTALLED_APPS`.
2. Replace `orientation/models.py` with the one provided.
3. Create `orientation/management/commands/load_admissions.py` (and the two
   empty `__init__.py` files in `orientation/management/` and
   `orientation/management/commands/` — Python needs these to treat the
   folders as packages).
4. Create the migrations and apply them:
```bash
python manage.py makemigrations orientation
python manage.py migrate
```

---

## 4) Extract one PDF first (don't run all 1400 pages blind)

```bash
mkdir -p data/pdfs data/extracted
# put one PDF in data/pdfs/, e.g. data/pdfs/2023.pdf

cd scripts
python extract_pdf.py ../data/pdfs/2023.pdf --annee 2023 --debug
```

`--debug` prints the raw table pdfplumber sees on page 1, **before** any
cleanup — check that the 7 columns line up with Code Etb / Etablissement /
Code Fil / Filiere / Min1 / Min2 / Min3. If columns are shifted or empty,
that's the table-detection settings (`TABLE_SETTINGS` near the top of the
script) that need tuning, not the parsing logic further down.

Once it looks right, drop `--debug` and write the CSV:
```bash
python extract_pdf.py ../data/pdfs/2023.pdf --annee 2023 --out ../data/extracted/2023.csv
```

Open that CSV and check a few rows manually, especially:
- the `wilaya` column for "UNIV. ..." establishments — fix `extract_wilaya()`
  for any wilaya spelling it doesn't catch (it logs unmatched ones to
  `2023.to_review.csv` automatically)
- `min1/min2/min3` — make sure French decimal commas got converted properly
- rows where Filiere wrapped onto two lines — make sure they got merged into
  one row instead of becoming two

Once you trust it, run it on everything:
```bash
python extract_pdf.py ../data/pdfs/*.pdf --out ../data/extracted/all.csv
# year is auto-detected from each filename if it contains a 4-digit year,
# e.g. orientation_2022.pdf, 2023.pdf, etc. Otherwise pass --annee explicitly
# per file (one call per file in that case).
```

---

## 5) Load the CSV(s) into the database

```bash
cd ..   # back to filtrage-choix/
python manage.py load_admissions data/extracted/all.csv
```

This is idempotent — re-running it won't duplicate rows for the same
(établissement, filière, année) combo, so you can re-load after fixing a CSV.

---

## 6) Quick sanity check

```bash
python manage.py shell
```
```python
from orientation.models import ResultatAdmission
ResultatAdmission.objects.count()
ResultatAdmission.objects.filter(etablissement__wilaya="ALGER").count()
ResultatAdmission.objects.filter(etablissement__wilaya__isnull=True, etablissement__is_national=False).count()  # should shrink to 0 as you refine extract_wilaya()
```

---

## Next steps (once the data's in)

- Build the actual "filtrage / simulation" logic as Django views/serializers
  on top of `ResultatAdmission` (e.g. given a student's average + wilaya +
  filière interests, rank their realistic options across the last 3-4 years).
- Decide what "optimizing acceptance chances" means quantitatively — e.g.
  average of `min1` over the last N years per filière, trend (rising/falling),
  variance — so the recommendation isn't just "last year's cutoff."
