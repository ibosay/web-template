import { IdentityFact, IdentityField } from './types';

export type PhotoFact = {
  field: IdentityField;
  value: string;
  confidence: number;
  source?: 'visible_text' | 'visible_feature';
};

export type PhotoObservation = {
  photoId: string;
  /** Freie Ansichtskennung, z. B. front, back, bottom, label, card_number. */
  view: string;
  facts: PhotoFact[];
};

export type FusedPhotoFact = IdentityFact & {
  evidence: {
    photoIds: string[];
    views: string[];
    occurrences: number;
  };
};

function fold(value: string) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ß/g, 'ss');
}

function compact(value: string) {
  return fold(value).replace(/[^a-z0-9぀-ヿ一-鿿]+/g, '');
}

function clean(value: string) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function clamp(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

/**
 * Verbindet direkte Beobachtungen mehrerer Fotos.
 *
 * Gleiche sichtbare Kennung auf mehreren Bildern wird stärker.
 * Unterschiedliche sichtbare Kennungen bleiben getrennt erhalten, damit
 * die bestehende Konfliktprüfung eine exakte Identität blockieren kann.
 */
export function fusePhotoEvidence(observations: PhotoObservation[]): FusedPhotoFact[] {
  const groups = new Map<string, {
    field: IdentityField;
    value: string;
    confidences: number[];
    photoIds: Set<string>;
    views: Set<string>;
    source: 'visible_text' | 'visible_feature';
  }>();

  observations.forEach(observation => {
    const photoId = clean(observation.photoId);
    const view = clean(observation.view);

    observation.facts.forEach(fact => {
      const value = clean(fact.value);
      const confidence = clamp(fact.confidence);
      if (!value || confidence < 0.55) return;

      const key = fact.field + '::' + compact(value);
      const current = groups.get(key);
      if (!current) {
        groups.set(key, {
          field: fact.field,
          value,
          confidences: [confidence],
          photoIds: new Set(photoId ? [photoId] : []),
          views: new Set(view ? [view] : []),
          source: fact.source === 'visible_text' ? 'visible_text' : 'visible_feature',
        });
        return;
      }

      current.confidences.push(confidence);
      if (photoId) current.photoIds.add(photoId);
      if (view) current.views.add(view);
      if (fact.source === 'visible_text') current.source = 'visible_text';
    });
  });

  return [...groups.values()].map(group => {
    const strongest = Math.max(...group.confidences);
    const repeatedViewBonus = Math.min(0.08, Math.max(0, group.views.size - 1) * 0.04);
    const repeatedPhotoBonus = Math.min(0.04, Math.max(0, group.photoIds.size - group.views.size) * 0.02);
    const confidence = Math.min(0.99, strongest + repeatedViewBonus + repeatedPhotoBonus);

    return {
      field: group.field,
      value: group.value,
      confidence,
      observed: true,
      source: group.source,
      evidence: {
        photoIds: [...group.photoIds],
        views: [...group.views],
        occurrences: group.confidences.length,
      },
    };
  });
}

export function capturedViewsFromPhotoEvidence(observations: PhotoObservation[] | null | undefined): string[] {
  if (!observations?.length) return [];
  const seen = new Set<string>();
  observations.forEach(observation => {
    const view = clean(observation.view);
    if (view) seen.add(view);
  });
  return [...seen];
}
