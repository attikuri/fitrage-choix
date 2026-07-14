import { WILAYA_NAMES } from '../i18n'

/**
 * Institution names in the CSV are French and structured, mostly following
 * a handful of patterns ("UNIV. <WILAYA>", "ECOLE NATIONALE SUPERIEURE DE X
 * <VILLE>", "CENTRE DE FORMATION CONTINUE <WILAYA>", etc.). With 293 unique
 * names, hand-translating each individually would mean a second 300-line
 * dictionary. Instead this translates the *structure* (institution type +
 * place name, reusing WILAYA_NAMES already in this file) and leaves
 * acronyms (USTHB, ESI, ENP, I.S.T.A...) and numbering (Alger 1/2/3)
 * untouched — which is how these are conventionally written even in
 * Arabic-language contexts in Algeria. Anything that doesn't match a known
 * pattern falls back to the raw French name rather than guessing.
 */

// Extra place names in institution names that aren't wilaya capitals
// (communes, Algiers suburbs, satellite campuses).
const EXTRA_PLACES = {
  'BOU SAADA': 'بوسعادة', 'BOUZAREAH': 'بوزريعة', 'KOUBA': 'الكبة',
  'BAB EZZOUAR': 'باب الزوار', 'BEN AKNOUN': 'بن عكنون',
  'EL KHARROUBA': 'الخروبة', 'MAGHNIA': 'مغنية', 'AFLOU': 'أفلو',
  'BARIKA': 'بريكة', 'KHEMIS MILIANA': 'خميس مليانة',
  'SIDI ABDELLAH': 'سيدي عبد الله', 'KSAR CHELLALA': 'قصر الشلالة',
  'SOUGHEUR': 'الصوغر', 'GUEABI DJEDIA': 'قاعبي جديدة', 'HAI SALAM': 'حي السلام',
  'SIDI BEL ABBES': 'سيدي بلعباس',
}

function placeName(word) {
  const key = word.trim().toUpperCase()
  return WILAYA_NAMES[key] || EXTRA_PLACES[key] || null
}

// Ordered longest-prefix-first so specific patterns are tried before generic ones.
const PATTERNS = [
  ['ECOLE NATIONALE POLYTECHNIQUES', 'المدرسة الوطنية المتعددة التقنيات'],
  ['ECOLE NATIONALE POLYTECHNIQUE', 'المدرسة الوطنية المتعددة التقنيات'],
  ['ECOLE NATIONALE SUPERIEURE', 'المدرسة الوطنية العليا'],
  ['ECOLE NATIONALE SUP.', 'المدرسة الوطنية العليا'],
  ['ECOLE NORMALE SUPERIEURE', 'المدرسة العليا للأساتذة'],
  ['ECOLE DES HAUTES ETUDES COMMERCIALES', 'مدرسة الدراسات التجارية العليا'],
  ['ECOLE POLYTECHNIQUE', 'المدرسة المتعددة التقنيات'],
  ['ECOLE SUP.', 'المدرسة العليا'],
  ['ECOLE SUPERIEURE', 'المدرسة العليا'],
  ['E.N.S.', 'المدرسة العليا للأساتذة'],
  ['E.N.S', 'المدرسة العليا للأساتذة'],
  ['E.S EN', 'المدرسة العليا في'],
  ['CENTRE UNIVERSITAIRE', 'مركز جامعي'],
  ['CENTRE DE FORMATION CONTINUE', 'مركز التكوين المتواصل'],
  ['INSTITUT VETERINAIRE', 'المعهد البيطري'],
  ['UNIVERSITE', 'جامعة'],
  ['UNIV.', 'جامعة'],
  ['UNIV', 'جامعة'],
  ['C . UNIV', 'مركز جامعي'],
  ['C. UNIV', 'مركز جامعي'],
  ['C.UNIV', 'مركز جامعي'],
  ['ANNEXE', 'ملحقة'],
  ['INFSPM', 'المعهد الوطني للتكوين شبه الطبي العالي'],
  ['INFSSF', 'المعهد الوطني العالي لتكوين القابلات'],
]

const DIRECT_LABEL_OVERRIDES = {
  'RECRUTEMENT NATIONAL': 'توظيف وطني',
}

// Known acronym institutions kept verbatim in every language, as Algerian
// users conventionally refer to them, in Latin script, even in Arabic text.
const ACRONYM_OVERRIDES = new Set(['USTHB', 'USTO', 'ESI', 'ENP', 'ENPO', 'EPAU'])

// A token is treated as an acronym (left untouched) only if it visibly looks
// like one — contains a period, e.g. "I.S.T.A", "E.N.S.E.T" — never a plain
// all-caps word, since place names (ORAN, BLIDA, MILA...) are also all-caps
// in this dataset and must still go through the place-name dictionary.
function looksLikeAcronym(word) {
  return word.includes('.') && /^[A-Z.]+$/.test(word)
}

function translatePlaceInPhrase(phrase) {
  // try the whole phrase as one place first ("SIDI BEL ABBES", "OUM EL BOUAGHI"...)
  const whole = placeName(phrase)
  if (whole) return whole
  // otherwise translate word by word, passing through numbers/acronyms
  return phrase
    .split(' ')
    .filter(Boolean)
    .map((w) => {
      if (/^\d+$/.test(w)) return w
      if (looksLikeAcronym(w)) return w
      return placeName(w) || w
    })
    .join(' ')
}

function translateOne(raw) {
  const trimmed = raw.trim()
  if (ACRONYM_OVERRIDES.has(trimmed.toUpperCase())) return trimmed
  if (DIRECT_LABEL_OVERRIDES[trimmed.toUpperCase()]) return DIRECT_LABEL_OVERRIDES[trimmed.toUpperCase()]

  const upper = trimmed.toUpperCase()
  for (const [fr, ar] of PATTERNS) {
    if (upper.startsWith(fr)) {
      let rest = trimmed.slice(fr.length).trim()
      rest = rest.replace(/^(DE |D['’ ]|DES |EN )/i, '')

      const parenMatch = rest.match(/^([^()]*)(\(.*\))?$/)
      const mainPart = parenMatch ? parenMatch[1].trim() : rest
      const parenPart = parenMatch && parenMatch[2] ? parenMatch[2] : ''

      const translatedMain = mainPart ? translatePlaceInPhrase(mainPart) : ''
      // recurse into the parenthetical — it's often another institution name
      const translatedParen = parenPart
        ? '(' + translateOne(parenPart.slice(1, -1)) + ')'
        : ''

      return [ar, translatedMain].filter(Boolean).join(' ') +
        (translatedParen ? ' ' + translatedParen : '')
    }
  }
  return raw // unmatched pattern — safe fallback, still shows correctly in French
}

export function translateEtablissement(lang, raw) {
  if (!raw || lang !== 'ar') return raw // French data is already French; English keeps French proper nouns (standard practice)
  if (raw.includes(' + ')) {
    return raw.split(' + ').map((part) => translateOne(part.trim())).join(' + ')
  }
  return translateOne(raw)
}