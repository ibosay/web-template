import {
  CandidateDecision,
  CandidateEvidence,
  IdentityDecision,
  IdentityField,
  IdentityMode,
  IdentityRequirement,
  ObjectIdentityInput,
} from './types';
import { categoryProfile } from './profiles';

const HARD_CONFLICT_FIELDS = new Set<IdentityField>([
  'modelNumber',
  'sku',
  'gtin',
  'isbn',
  'number',
  'toyNumber',
  'baseCode',
  'gradingCompany',
  'grade',
]);

const HIGH_VALUE_FIELDS = new Set<IdentityField>([
  'modelNumber',
  'sku',
  'gtin',
  'isbn',
  'number',
  'toyNumber',
  'baseCode',
]);

const CONFLICT_SENSITIVE_FIELDS = new Set<IdentityField>([
  'modelNumber',
  'sku',
  'gtin',
  'isbn',
  'number',
  'toyNumber',
  'baseCode',
  'gradingCompany',
  'grade',
]);

export type IdentityConflict = {
  field: IdentityField;
  values: string[];
};

export function identityConflicts(input: ObjectIdentityInput): IdentityConflict[] {
  const conflicts: IdentityConflict[] = [];
  CONFLICT_SENSITIVE_FIELDS.forEach(field => {
    const values = input.facts
      .filter(fact => fact.field === field && fact.observed && fact.confidence >= 0.55 && clean(fact.value))
      .map(fact => clean(fact.value));
    const unique: string[] = [];
    values.forEach(value => {
      const key = compact(value);
      if (!unique.some(existing => compact(existing) === key)) unique.push(value);
    });
    if (unique.length > 1) conflicts.push({ field, values: unique });
  });
  return conflicts;
}

const LABELS: Partial<Record<IdentityField, string>> = {
  brand: 'Marke',
  manufacturer: 'Hersteller',
  model: 'Modell',
  modelNumber: 'Modellnummer',
  sku: 'Artikelnummer',
  gtin: 'EAN/GTIN',
  isbn: 'ISBN',
  name: 'Name',
  number: 'Nummer',
  set: 'Set',
  language: 'Sprache',
  variant: 'Variante',
  gradingCompany: 'Grading Firma',
  grade: 'Note',
  casting: 'Casting',
  toyNumber: 'Toy Number',
  baseCode: 'Base Code',
  scale: 'Maßstab',
  vehicleBrand: 'Fahrzeugmarke',
  vehicleModel: 'Fahrzeugmodell',
  material: 'Material',
  shape: 'Form',
  color: 'Farbe',
  size: 'Größe',
  marking: 'Markierung',
  hallmark: 'Punze',
  year: 'Jahr',
  edition: 'Edition',
  pattern: 'Muster',
  movement: 'Werk',
  country: 'Herkunft',
  style: 'Stil',
};

function fold(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss');
}

function norm(value: string) {
  return fold(value).replace(/[^a-z0-9぀-ヿ一-鿿]+/g, ' ').trim();
}

function compact(value: string) {
  return norm(value).replace(/ /g, '');
}

function clean(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function factsFor(input: ObjectIdentityInput, field: IdentityField) {
  return input.facts
    .filter(fact => fact.field === field && clean(fact.value))
    .sort((a, b) => {
      if (a.observed !== b.observed) return a.observed ? -1 : 1;
      return b.confidence - a.confidence;
    });
}

function bestFact(input: ObjectIdentityInput, field: IdentityField) {
  return factsFor(input, field)[0] || null;
}

function requirementMet(input: ObjectIdentityInput, requirement: IdentityRequirement) {
  const fact = bestFact(input, requirement.field);
  if (!fact) return false;
  if (requirement.observedRequired && !fact.observed) return false;
  return fact.confidence >= 0.55;
}

function groupMet(
  input: ObjectIdentityInput,
  group: { fields: IdentityField[]; min: number; observedRequired?: boolean },
) {
  const count = group.fields.filter(field => {
    const fact = bestFact(input, field);
    return Boolean(
      fact &&
      fact.confidence >= 0.55 &&
      (!group.observedRequired || fact.observed),
    );
  }).length;
  return count >= group.min;
}

function requirementsSatisfied(
  input: ObjectIdentityInput,
  all: IdentityRequirement[] | undefined,
  groups: { fields: IdentityField[]; min: number; observedRequired?: boolean }[] | undefined,
  groupMode: 'any' | 'all' = 'any',
) {
  const allOk = (all || []).every(requirement => requirementMet(input, requirement));
  const groupOk =
    !groups?.length ||
    (groupMode === 'all'
      ? groups.every(group => groupMet(input, group))
      : groups.some(group => groupMet(input, group)));
  return allOk && groupOk;
}

function scoreField(field: IdentityField) {
  if (HIGH_VALUE_FIELDS.has(field)) return 0.35;
  if (['brand', 'manufacturer', 'model', 'name', 'casting', 'vehicleModel', 'hallmark'].includes(field)) return 0.15;
  return 0.1;
}

function identityScore(
  input: ObjectIdentityInput,
  strongFields: IdentityField[],
  supportingFields: IdentityField[],
  exactSatisfied: boolean,
  comparableSatisfied: boolean,
) {
  let score = 0;
  const seen = new Set<IdentityField>();
  strongFields.forEach(field => {
    const fact = bestFact(input, field);
    if (!fact || fact.confidence < 0.55 || !fact.observed || seen.has(field)) return;
    seen.add(field);
    score += scoreField(field) * Math.max(0.6, Math.min(1, fact.confidence));
  });
  supportingFields.forEach(field => {
    const fact = bestFact(input, field);
    if (!fact || fact.confidence < 0.55 || !fact.observed || seen.has(field)) return;
    seen.add(field);
    score += 0.05 * Math.max(0.6, Math.min(1, fact.confidence));
  });
  if (exactSatisfied) score += 0.55;
  else if (comparableSatisfied) score += 0.25;
  return Math.min(1, Math.round(score * 100) / 100);
}

function fieldsUsed(input: ObjectIdentityInput, fields: IdentityField[]) {
  return fields.filter(field => Boolean(bestFact(input, field)));
}

function missingExactFields(input: ObjectIdentityInput) {
  const profile = categoryProfile(input);
  const missing: IdentityField[] = [];
  (profile.exactAll || []).forEach(req => {
    if (!requirementMet(input, req)) missing.push(req.field);
  });
  if (profile.exactAnyGroups?.length) {
    const mode = profile.exactGroupMode || 'any';
    if (mode === 'any') {
      if (!profile.exactAnyGroups.some(group => groupMet(input, group))) {
        const smallest = [...profile.exactAnyGroups].sort((a, b) => a.min - b.min)[0];
        smallest.fields.slice(0, smallest.min).forEach(field => missing.push(field));
      }
    } else {
      profile.exactAnyGroups.forEach(group => {
        if (!groupMet(input, group)) {
          group.fields
            .filter(field => !bestFact(input, field))
            .slice(0, Math.max(1, group.min))
            .forEach(field => missing.push(field));
        }
      });
    }
  }
  return Array.from(new Set(missing));
}

function factValue(input: ObjectIdentityInput, field: IdentityField) {
  const fact = factsFor(input, field).find(row => row.observed && row.confidence >= 0.55);
  return clean(fact?.value || '');
}

function dedupe(values: string[]) {
  const seen = new Set<string>();
  return values.filter(value => {
    const key = norm(value);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function minimumFieldsFromProfile(
  input: ObjectIdentityInput,
  all: IdentityRequirement[] | undefined,
  groups: { fields: IdentityField[]; min: number; observedRequired?: boolean }[] | undefined,
  groupMode: 'any' | 'all',
) {
  const required = new Set<IdentityField>();
  (all || []).forEach(req => {
    if (requirementMet(input, req)) required.add(req.field);
  });

  const eligibleGroups =
    groupMode === 'all'
      ? (groups || []).filter(group => groupMet(input, group))
      : [(groups || []).find(group => groupMet(input, group))].filter(Boolean);

  eligibleGroups.forEach(group => {
    if (!group) return;
    group.fields
      .filter(field => {
        const fact = bestFact(input, field);
        return Boolean(
          fact &&
          fact.confidence >= 0.55 &&
          (!group.observedRequired || fact.observed),
        );
      })
      .slice(0, group.min)
      .forEach(field => required.add(field));
  });

  return [...required];
}

function searchPlan(input: ObjectIdentityInput, mode: IdentityMode) {
  const profile = categoryProfile(input);

  // Nur die Mindestanker kommen in jede Suchanfrage. Weitere sichtbare Merkmale bleiben optional,
  // damit seltene Flohmarktware nicht durch eine überlange Suchphrase unsichtbar wird.
  const requiredFields =
    mode === 'comparable_object'
      ? minimumFieldsFromProfile(
          input,
          profile.comparableAll,
          profile.comparableAnyGroups,
          profile.comparableGroupMode || 'all',
        )
      : minimumFieldsFromProfile(
          input,
          profile.exactAll,
          profile.exactAnyGroups,
          profile.exactGroupMode || 'any',
        );

  const required = dedupe(
    requiredFields
      .map(field => factValue(input, field))
      .filter(Boolean),
  ).slice(0, 5);

  const optional = dedupe(
    [...profile.strongFields, ...profile.supportingFields]
      .map(field => factValue(input, field))
      .filter(Boolean)
      .filter(value => !required.some(requiredValue => norm(requiredValue) === norm(value))),
  ).slice(0, 6);

  const all = dedupe([...required, ...optional]);
  return { required, optional, all };
}

function labelFor(mode: IdentityMode, score: number) {
  if (mode !== 'comparable_object') {
    return {
      quality: 'exact' as const,
      label: 'Exakt identifiziert' as const,
      marketValueAllowed: true,
      comparisonRangeAllowed: true,
      minimumComparableCount: 2,
    };
  }
  if (score >= 0.68) {
    return {
      quality: 'strong_comparable' as const,
      label: 'Sehr gut vergleichbar' as const,
      marketValueAllowed: false,
      comparisonRangeAllowed: true,
      minimumComparableCount: 3,
    };
  }
  return {
    quality: 'similar_only' as const,
    label: 'Nur ähnliche Marktobjekte' as const,
    marketValueAllowed: false,
    comparisonRangeAllowed: true,
    minimumComparableCount: 3,
  };
}

export function decideIdentity(input: ObjectIdentityInput): IdentityDecision {
  const profile = categoryProfile(input);
  const conflicts = identityConflicts(input);
  const exactSatisfied =
    conflicts.length === 0 &&
    requirementsSatisfied(input, profile.exactAll, profile.exactAnyGroups, profile.exactGroupMode || 'any');
  const comparableSatisfied = requirementsSatisfied(
    input,
    profile.comparableAll,
    profile.comparableAnyGroups,
    profile.comparableGroupMode || 'all',
  );
  const score = identityScore(input, profile.strongFields, profile.supportingFields, exactSatisfied, comparableSatisfied);

  let mode: IdentityMode = 'comparable_object';
  if (exactSatisfied && score >= profile.exactMinScore) mode = profile.exactMode;

  const qualityInfo = labelFor(mode, score);
  const plan = searchPlan(input, mode);
  const matchedFields = fieldsUsed(input, [...profile.strongFields, ...profile.supportingFields]);

  const explanation: string[] = [];
  if (mode === 'exact_product') explanation.push('Stabile Produktkennung ausreichend belegt.');
  if (mode === 'exact_collectible') explanation.push('Sammleridentität ausreichend durch sichtbare Merkmale belegt.');
  if (mode === 'comparable_object') {
    explanation.push('Keine ausreichend sichere exakte Produktkennung vorhanden.');
    if (conflicts.length) {
      explanation.push(
        'Widersprüchliche sichtbare Kennungen: ' +
          conflicts.map(conflict => (LABELS[conflict.field] || conflict.field) + ' (' + conflict.values.join(' / ') + ')').join(', ') +
          '.'
      );
    }
    if (comparableSatisfied) explanation.push('Vergleichssuche über mehrere beobachtete Merkmale ist zulässig.');
    else explanation.push('Merkmalsbasis ist noch schwach, Treffer müssen besonders konservativ behandelt werden.');
  }
  explanation.push(...profile.notes);

  return {
    mode,
    quality: qualityInfo.quality,
    category: input.category,
    score,
    matchedFields,
    missingExactFields: missingExactFields(input),
    searchTerms: plan.all,
    requiredSearchTerms: plan.required,
    optionalSearchTerms: plan.optional,
    explanation,
    valuationPolicy: {
      marketValueAllowed: qualityInfo.marketValueAllowed,
      comparisonRangeAllowed: qualityInfo.comparisonRangeAllowed,
      minimumComparableCount: qualityInfo.minimumComparableCount,
      label: qualityInfo.label,
    },
  };
}

function candidateValues(candidate: CandidateEvidence, field: IdentityField) {
  const raw = candidate.fields[field];
  const values = Array.isArray(raw) ? raw : raw ? [raw] : [];
  return values.map(clean).filter(Boolean);
}

const FLEXIBLE_TEXT_FIELDS = new Set<IdentityField>([
  'material',
  'shape',
  'color',
  'size',
  'marking',
  'hallmark',
  'pattern',
  'country',
  'condition',
  'style',
]);

function tokenClose(expected: string, actual: string) {
  if (expected === actual) return true;
  const shorter = expected.length <= actual.length ? expected : actual;
  const longer = expected.length <= actual.length ? actual : expected;
  return shorter.length >= 5 && longer.startsWith(shorter);
}

function titleContains(title: string, value: string, field?: IdentityField) {
  const haystack = compact(title);
  const needle = compact(value);
  if (needle.length >= 2 && haystack.includes(needle)) return true;
  if (!field || !FLEXIBLE_TEXT_FIELDS.has(field)) return false;

  const titleTokens = norm(title).split(' ').filter(Boolean);
  const expectedTokens = norm(value)
    .split(' ')
    .filter(token => token.length >= 2);
  if (!expectedTokens.length) return false;
  return expectedTokens.every(expected => titleTokens.some(actual => tokenClose(expected, actual)));
}

function candidateMatchesFact(candidate: CandidateEvidence, field: IdentityField, value: string) {
  const explicit = candidateValues(candidate, field);
  if (explicit.length) return explicit.some(candidateValue => compact(candidateValue) === compact(value));
  return titleContains(candidate.title, value, field);
}

function candidateConflictsFact(candidate: CandidateEvidence, field: IdentityField, value: string) {
  const explicit = candidateValues(candidate, field);
  if (!explicit.length) return false;
  return explicit.every(candidateValue => compact(candidateValue) !== compact(value));
}

function requiredFieldsForDecision(input: ObjectIdentityInput, decision: IdentityDecision) {
  const profile = categoryProfile(input);
  return decision.mode === 'comparable_object'
    ? minimumFieldsFromProfile(
        input,
        profile.comparableAll,
        profile.comparableAnyGroups,
        profile.comparableGroupMode || 'all',
      )
    : minimumFieldsFromProfile(
        input,
        profile.exactAll,
        profile.exactAnyGroups,
        profile.exactGroupMode || 'any',
      );
}

export function evaluateCandidate(input: ObjectIdentityInput, candidate: CandidateEvidence): CandidateDecision {
  const decision = decideIdentity(input);
  const profile = categoryProfile(input);
  const requiredFields = requiredFieldsForDecision(input, decision);
  const matchedFields: IdentityField[] = [];
  const conflicts: IdentityField[] = [];
  const missingRequired: IdentityField[] = [];

  const fieldsToCheck = Array.from(new Set([
    ...requiredFields,
    ...profile.strongFields,
    ...profile.supportingFields,
  ]));

  fieldsToCheck.forEach(field => {
    const fact = bestFact(input, field);
    if (!fact || fact.confidence < 0.55) return;
    if (candidateConflictsFact(candidate, field, fact.value)) {
      if (HARD_CONFLICT_FIELDS.has(field) || requiredFields.includes(field) || field === 'brand' || field === 'manufacturer') {
        conflicts.push(field);
      }
      return;
    }
    if (candidateMatchesFact(candidate, field, fact.value)) matchedFields.push(field);
  });

  requiredFields.forEach(field => {
    const fact = bestFact(input, field);
    if (!fact) return;
    if (!candidateMatchesFact(candidate, field, fact.value)) missingRequired.push(field);
  });

  let accepted = false;
  let quality: CandidateDecision['quality'] = 'insufficient';

  if (!conflicts.length) {
    if (decision.mode !== 'comparable_object') {
      accepted = missingRequired.length === 0;
      quality = accepted ? 'exact' : 'insufficient';
    } else {
      const strongMatches = matchedFields.filter(field => profile.strongFields.includes(field)).length;
      const anchorMatched = ['brand', 'manufacturer', 'name', 'vehicleModel', 'casting']
        .some(field => matchedFields.includes(field as IdentityField));
      accepted = missingRequired.length === 0 && strongMatches >= 2 && (anchorMatched || strongMatches >= 3);
      quality = accepted ? (strongMatches >= 4 ? 'strong_comparable' : 'similar_only') : 'insufficient';
    }
  }

  const weightedMatches = matchedFields.reduce((sum, field) => sum + scoreField(field), 0);
  const score = Math.min(1, Math.round((weightedMatches + (accepted ? 0.25 : 0)) * 100) / 100);

  const explanation: string[] = [];
  if (conflicts.length) {
    explanation.push('Widerspruch bei: ' + conflicts.map(field => LABELS[field] || field).join(', ') + '.');
  }
  if (missingRequired.length) {
    explanation.push('Pflichtmerkmale fehlen im Treffer: ' + missingRequired.map(field => LABELS[field] || field).join(', ') + '.');
  }
  if (accepted && quality === 'exact') explanation.push('Treffer bestätigt die erforderliche Identität.');
  if (accepted && quality !== 'exact') explanation.push('Treffer ist nur als Vergleichsobjekt zulässig, nicht als exakt identisches Produkt.');

  return {
    accepted,
    quality,
    score,
    matchedFields: Array.from(new Set(matchedFields)),
    conflicts: Array.from(new Set(conflicts)),
    missingRequired: Array.from(new Set(missingRequired)),
    explanation,
  };
}

export function buildSearchQueries(input: ObjectIdentityInput): string[] {
  const decision = decideIdentity(input);
  const required = decision.requiredSearchTerms;
  const optional = decision.optionalSearchTerms;

  const queries: string[] = [];
  const add = (parts: string[]) => {
    const value = clean(parts.filter(Boolean).join(' '));
    if (!value) return;
    if (!queries.some(existing => norm(existing) === norm(value))) queries.push(value);
  };

  add([...required, ...optional.slice(0, 2)]);
  add(required);
  if (decision.mode === 'comparable_object') add([...required.slice(0, 2), ...optional.slice(0, 3)]);

  return queries.slice(0, 3);
}
