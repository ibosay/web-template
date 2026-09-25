import { identityConflicts } from './engine';
import { IdentityFact, IdentityField, ObjectIdentityInput } from './types';

export type RecognitionIssueCode =
  | 'unsupported_stable_identifier'
  | 'conflicting_visible_identifier'
  | 'weak_brand_evidence'
  | 'insufficient_visible_identity';

export type RecognitionIssue = {
  code: RecognitionIssueCode;
  severity: 'block_exact' | 'warn';
  field: IdentityField | null;
  value: string | null;
  message: string;
};

export type RecognitionAudit = {
  safeForExactIdentity: boolean;
  observedFields: IdentityField[];
  unsupportedStableFields: IdentityField[];
  issues: RecognitionIssue[];
};

const STABLE_FIELDS = new Set<IdentityField>([
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

function bestFacts(input: ObjectIdentityInput) {
  const byField = new Map<IdentityField, IdentityFact[]>();
  input.facts.forEach(fact => {
    if (!fact.value.trim()) return;
    const current = byField.get(fact.field) || [];
    current.push(fact);
    byField.set(fact.field, current);
  });
  return byField;
}

export function auditRecognition(input: ObjectIdentityInput): RecognitionAudit {
  const issues: RecognitionIssue[] = [];
  const byField = bestFacts(input);

  const observedFields = [...byField.entries()]
    .filter(([, facts]) => facts.some(fact => fact.observed && fact.confidence >= 0.55))
    .map(([field]) => field);

  const unsupportedStableFields: IdentityField[] = [];
  STABLE_FIELDS.forEach(field => {
    const facts = byField.get(field) || [];
    const hasHighConfidenceClaim = facts.some(fact => fact.confidence >= 0.75);
    const hasObservedSupport = facts.some(fact => fact.observed && fact.confidence >= 0.55);
    if (hasHighConfidenceClaim && !hasObservedSupport) {
      unsupportedStableFields.push(field);
      const value = facts.sort((a, b) => b.confidence - a.confidence)[0]?.value || null;
      issues.push({
        code: 'unsupported_stable_identifier',
        severity: 'block_exact',
        field,
        value,
        message: 'Stabile Kennung wurde erkannt, ist aber nicht direkt im Foto belegt.',
      });
    }
  });

  identityConflicts(input).forEach(conflict => {
    issues.push({
      code: 'conflicting_visible_identifier',
      severity: 'block_exact',
      field: conflict.field,
      value: conflict.values.join(' / '),
      message: 'Mehrere unterschiedliche sichtbare Kennungen widersprechen sich.',
    });
  });

  const brandFacts = byField.get('brand') || byField.get('manufacturer') || [];
  if (brandFacts.length && !brandFacts.some(fact => fact.observed && fact.confidence >= 0.55)) {
    issues.push({
      code: 'weak_brand_evidence',
      severity: 'warn',
      field: 'brand',
      value: brandFacts[0]?.value || null,
      message: 'Marke oder Hersteller ist nicht direkt durch sichtbare Fotoevidenz belegt.',
    });
  }

  if (observedFields.length < 2) {
    issues.push({
      code: 'insufficient_visible_identity',
      severity: 'warn',
      field: null,
      value: null,
      message: 'Es liegen weniger als zwei belastbare sichtbare Identitätsmerkmale vor.',
    });
  }

  return {
    safeForExactIdentity: !issues.some(issue => issue.severity === 'block_exact'),
    observedFields,
    unsupportedStableFields,
    issues,
  };
}
