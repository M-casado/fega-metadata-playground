import { AlertTriangle } from 'lucide-react';
import jsonld from 'jsonld';
import { useEffect, useMemo, useState } from 'react';
import { formatJson, loadJsonAsset, loadTextAsset } from '../lib/examples';
import type { ManifestExample, WorkingDraft } from '../lib/types';

type ViewKey = 'source' | 'data' | 'expanded' | 'flattened' | 'framed' | 'nquads';

interface JsonLdViewsProps {
  example: ManifestExample;
  draft: WorkingDraft | null;
}

export function JsonLdViews({ example, draft }: JsonLdViewsProps) {
  const views = useMemo(
    () => {
      if (draft) {
        return [
          { key: 'source' as const, label: 'Draft wrapper', path: '', type: 'draft-json' },
          { key: 'data' as const, label: 'Draft data', path: '', type: 'draft-data' },
          { key: 'expanded' as const, label: 'Expanded JSON-LD', path: '', type: 'draft-expanded' },
          { key: 'flattened' as const, label: 'Flattened JSON-LD', path: '', type: 'draft-flattened' },
          { key: 'framed' as const, label: 'Framed JSON-LD', path: '', type: 'draft-framed' },
          { key: 'nquads' as const, label: 'N-Quads', path: '', type: 'draft-nquads' }
        ];
      }
      return [
        { key: 'source' as const, label: 'Source JSON', path: example.assets.source, type: 'json' },
        { key: 'expanded' as const, label: 'Expanded JSON-LD', path: example.assets.expanded, type: 'json' },
        { key: 'flattened' as const, label: 'Flattened JSON-LD', path: example.assets.flattened, type: 'json' },
        { key: 'framed' as const, label: 'Framed JSON-LD', path: example.assets.framed, type: 'json' },
        { key: 'nquads' as const, label: 'N-Quads', path: example.assets.nquads, type: 'text' }
      ].filter((view) => Boolean(view.path));
    },
    [draft, example]
  );
  const [active, setActive] = useState<ViewKey>('source');
  const [content, setContent] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setActive('source');
  }, [draft?.id, example.id]);

  useEffect(() => {
    const view = views.find((item) => item.key === active) || views[0];
    let cancelled = false;
    setContent('');
    setError('');
    if (!view) {
      return undefined;
    }
    const load =
      view.type === 'draft-json'
        ? Promise.resolve(formatJson({ schema: draft?.schema || {}, data: draft?.data ?? {} }))
        : view.type === 'draft-data'
          ? Promise.resolve(formatJson(draft?.data ?? {}))
          : view.type === 'draft-expanded'
            ? jsonld.expand(draft?.data ?? {}).then(formatJson)
            : view.type === 'draft-flattened'
              ? jsonld.flatten(draft?.data ?? {}).then(formatJson)
              : view.type === 'draft-framed'
                ? jsonld.frame(draft?.data ?? {}, frameForDraft(draft)).then(formatJson)
                : view.type === 'draft-nquads'
                  ? jsonld.toRDF(draft?.data ?? {}, { format: 'application/n-quads' })
                  : view.type === 'json'
                    ? loadJsonAsset(view.path || '').then(formatJson)
                    : loadTextAsset(view.path || '');
    load
      .then((value: string) => {
        if (!cancelled) {
          setContent(value);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [active, draft, views]);

  return (
    <section className="panel">
      <div className="tabs" role="tablist" aria-label="JSON-LD views">
        {views.map((view) => (
          <button
            key={view.key}
            type="button"
            role="tab"
            aria-selected={active === view.key}
            className={active === view.key ? 'activeTab' : ''}
            onClick={() => setActive(view.key)}
          >
            {view.label}
          </button>
        ))}
      </div>
      {draft ? (
        <div className="draftInlineState">Editing working draft: {draft.sourceLabel}</div>
      ) : null}
      {!draft && example.warningCount > 0 ? (
        <div className="warningLine">
          <AlertTriangle size={16} aria-hidden="true" />
          This example generated warnings. See the graph view or build warnings for details.
        </div>
      ) : null}
      {error ? <div className="warningLine">{error}</div> : <pre className="codeBlock">{content || 'Loading…'}</pre>}
    </section>
  );
}

function frameForDraft(draft: WorkingDraft | null) {
  const data = draft?.data;
  const context = firstContext(data) || schemaRef(draft?.schema);
  const type = firstEgaType(data);
  return {
    ...(context ? { '@context': context } : {}),
    ...(type ? { '@type': type } : {})
  };
}

function firstContext(value: unknown): unknown {
  if (Array.isArray(value)) {
    for (const item of value) {
      const context = firstContext(item);
      if (context) {
        return context;
      }
    }
    return undefined;
  }
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const record = value as Record<string, unknown>;
  if (record['@context']) {
    return record['@context'];
  }
  if (Array.isArray(record['@graph'])) {
    return firstContext(record['@graph']);
  }
  return undefined;
}

function firstEgaType(value: unknown): string {
  if (Array.isArray(value)) {
    for (const item of value) {
      const type = firstEgaType(item);
      if (type) {
        return type;
      }
    }
    return '';
  }
  if (!value || typeof value !== 'object') {
    return '';
  }
  const record = value as Record<string, unknown>;
  const types = Array.isArray(record['@type']) ? record['@type'] : [record['@type']];
  const egaType = types.find((type) => typeof type === 'string' && type.startsWith('ega:'));
  if (typeof egaType === 'string') {
    return egaType;
  }
  if (Array.isArray(record['@graph'])) {
    return firstEgaType(record['@graph']);
  }
  return '';
}

function schemaRef(schema: unknown): string {
  return schema && typeof schema === 'object' && typeof (schema as Record<string, unknown>).$ref === 'string' ? String((schema as Record<string, unknown>).$ref) : '';
}
