/**
 * Mirror of orientation/recommender.py::compute_score
 * Computes max(weighted_average, generale) for a given domain formula.
 */

// domain code prefix → formula type
const DOMAIN_FORMULA_MAP = {
  A: 'sm',       // Sciences & Tech (we fixed A codes to sm)
  B: 'sm',       // Sciences de la Matière
  C: 'mi',       // Maths & Informatique
  D: 'snv',      // Sciences Nature & Vie
  E: 'snv',      // Sciences Terre (E03 Géologie = snv, E02 = sm but close enough)
  F: 'general',  // Économie
  G: 'general',  // Droit
  H: 'lang',     // Langues
  I: 'general',  // Sciences Humaines
  J: 'general',  // STAPS
  K: 'general',  // Arts
  L: 'general',  // Littérature Arabe
  M: 'general',  // Amazigh
  N: 'sm',       // Architecture
  P: 'snv',      // Médecine
  W: 'snv',      // Sage-femme
  X: 'snv',      // Paramédical
}

export function getFormulaType(domaine_code) {
  if (!domaine_code) return 'general'
  return DOMAIN_FORMULA_MAP[domaine_code[0]] || 'general'
}

export function computeScore(moyenne, grades, formulaType) {
  if (!moyenne) return null
  const g = grades || {}
  const get = (key) => (g[key] != null && g[key] !== '') ? Number(g[key]) : moyenne

  let weighted
  switch (formulaType) {
    case 'snv':
      weighted = (moyenne * 2 + get('svt')) / 3
      break
    case 'sm':
      weighted = (moyenne * 2 + (get('physique') + get('maths')) / 2) / 3
      break
    case 'mi':
      weighted = (moyenne * 2 + get('maths')) / 3
      break
    case 'st_spec':
      weighted = (moyenne * 2 + (get('specialite') + get('maths')) / 2) / 3
      break
    case 'lang':
      weighted = (moyenne * 2 + get('langue')) / 3
      break
    case 'trad':
      weighted = (moyenne * 2 + get('moy_3_langues')) / 3
      break
    default:
      return Number(moyenne)
  }
  return Math.max(weighted, moyenne)
}

export function computeScoreForDomain(domaine_code, moyenne, grades) {
  const formula = getFormulaType(domaine_code)
  return computeScore(Number(moyenne), grades, formula)
}