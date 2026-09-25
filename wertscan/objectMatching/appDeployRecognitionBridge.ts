import { PhotoObservation, PhotoFact } from './photoEvidence';
import { IdentityField } from './types';

export type PerPhotoObservation = {
  imageIndex: number;
  view:
    | 'front'
    | 'back'
    | 'bottom'
    | 'top'
    | 'side'
    | 'label'
    | 'model_plate'
    | 'barcode'
    | 'serial_area'
    | 'marking'
    | 'signature'
    | 'grading_label'
    | 'card_number'
    | 'packaging'
    | 'full_object'
    | 'detail'
    | 'size_reference'
    | 'movement'
    | 'unknown';
  readableText: string[];
  identifiers: string[];
  logosOrMarks: string[];
  formFeatures: string[];
  confidence: number;
};

const STABLE_PATTERNS: { field: IdentityField; test: (value: string) => boolean }[] = [
  { field: 'isbn', test: value => /^(?:97[89])?\d{9}[\dX]$/i.test(value.replace(/[^0-9X]/gi, '')) },
  { field: 'gtin', test: value => /^\d{8,14}$/.test(value.replace(/\D/g, '')) },
];

function clean(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function inferredStableField(value: string): IdentityField {
  for (const pattern of STABLE_PATTERNS) {
    if (pattern.test(value)) return pattern.field;
  }
  return 'custom';
}

function asFact(field: IdentityField, value: string, confidence: number, source: PhotoFact['source']): PhotoFact | null {
  const cleaned = clean(value);
  if (!cleaned) return null;
  return { field, value: cleaned, confidence: clamp(confidence), source };
}

/**
 * Brücke für die bestehende AppDeploy Erkennung.
 *
 * Wichtig: Diese Funktion braucht KEINEN zusätzlichen KI Aufruf. Die erste
 * multimodale observation kann pro Bild eine kleine strukturierte Liste liefern,
 * die hier in die allgemeine Mehrfoto Logik überführt wird.
 */
export function photoEvidenceFromPerPhotoObservation(rows: PerPhotoObservation[]): PhotoObservation[] {
  return rows.map((row, index) => {
    const confidence = clamp(row.confidence);
    const facts: PhotoFact[] = [];

    (row.readableText || []).forEach(value => {
      const fact = asFact('marking', value, confidence, 'visible_text');
      if (fact) facts.push(fact);
    });

    (row.logosOrMarks || []).forEach(value => {
      const fact = asFact('marking', value, confidence, 'visible_text');
      if (fact) facts.push(fact);
    });

    (row.identifiers || []).forEach(value => {
      const field = inferredStableField(value);
      const fact = asFact(field, value, confidence, 'visible_text');
      if (fact) facts.push(fact);
    });

    (row.formFeatures || []).forEach(value => {
      const fact = asFact('shape', value, Math.min(confidence, 0.9), 'visible_feature');
      if (fact) facts.push(fact);
    });

    return {
      photoId: 'image-' + String(Number.isFinite(row.imageIndex) ? row.imageIndex : index),
      view: row.view || 'unknown',
      facts,
    };
  });
}

export function perPhotoObservationSchema() {
  return {
    type: 'array',
    items: {
      type: 'object',
      properties: {
        imageIndex: { type: 'number' },
        view: {
          type: 'string',
          enum: [
            'front',
            'back',
            'bottom',
            'top',
            'side',
            'label',
            'model_plate',
            'barcode',
            'serial_area',
            'marking',
            'signature',
            'grading_label',
            'card_number',
            'packaging',
            'full_object',
            'detail',
            'size_reference',
            'movement',
            'unknown',
          ],
        },
        readableText: { type: 'array', items: { type: 'string' } },
        identifiers: { type: 'array', items: { type: 'string' } },
        logosOrMarks: { type: 'array', items: { type: 'string' } },
        formFeatures: { type: 'array', items: { type: 'string' } },
        confidence: { type: 'number' },
      },
      required: [
        'imageIndex',
        'view',
        'readableText',
        'identifiers',
        'logosOrMarks',
        'formFeatures',
        'confidence',
      ],
    },
  } as const;
}
