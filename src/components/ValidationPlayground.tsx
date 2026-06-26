import { CheckCircle2, Clipboard, Play } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { draftToValidationPayload, updateDraftSchemaAndData } from '../lib/draft';
import { formatJson, loadJsonAsset } from '../lib/examples';
import type { EntitySummary, ManifestExample, WorkingDraft, WrappedExample } from '../lib/types';
import {
  DEFAULT_BIOVALIDATOR_ENDPOINT,
  ENDPOINT_STORAGE_KEY,
  curlFor,
  parseJsonEditorValue,
  postToBiovalidator,
  type ValidatorResult
} from '../lib/validatorClient';
import { JsonEditor } from './JsonEditor';
import { ValidationResult } from './ValidationResult';

interface ValidationPlaygroundProps {
  example: ManifestExample;
  entities: EntitySummary[];
  draft: WorkingDraft | null;
  onDraftChange: (draft: WorkingDraft | null) => void;
}

export function ValidationPlayground({ example, entities, draft, onDraftChange }: ValidationPlaygroundProps) {
  const [source, setSource] = useState<WrappedExample | null>(null);
  const [schemaValue, setSchemaValue] = useState('');
  const [dataValue, setDataValue] = useState('');
  const [syntaxError, setSyntaxError] = useState('');
  const [endpoint, setEndpoint] = useState(() => localStorage.getItem(ENDPOINT_STORAGE_KEY) || DEFAULT_BIOVALIDATOR_ENDPOINT);
  const [result, setResult] = useState<ValidatorResult | null>(null);
  const [pending, setPending] = useState(false);
  const [copied, setCopied] = useState(false);
  const lastCommittedDraftKey = useRef('');

  useEffect(() => {
    localStorage.setItem(ENDPOINT_STORAGE_KEY, endpoint);
  }, [endpoint]);

  useEffect(() => {
    let cancelled = false;
    setResult(null);
    setSyntaxError('');
    if (draft) {
      const payload = draftToValidationPayload(draft);
      setSource(payload as WrappedExample);
      setSchemaValue(formatJson(payload.schema));
      setDataValue(formatJson(payload.data));
      lastCommittedDraftKey.current = draftKey(payload.schema, payload.data);
      return undefined;
    }
    loadJsonAsset<WrappedExample>(example.assets.source)
      .then((value) => {
        if (!cancelled) {
          const schema = value.schema ?? {};
          const data = value.data ?? value;
          setSource(value);
          setSchemaValue(formatJson(schema));
          setDataValue(formatJson(data));
          lastCommittedDraftKey.current = draftKey(schema, data);
        }
      })
      .catch((reason) => {
        if (!cancelled) {
          setSyntaxError(reason instanceof Error ? reason.message : String(reason));
        }
      });
    return () => {
      cancelled = true;
    };
  }, [draft?.id, example.id]);

  const parsedSchema = useMemo(() => parseJsonEditorValue(schemaValue), [schemaValue]);
  const parsedData = useMemo(() => parseJsonEditorValue(dataValue), [dataValue]);
  const payload = useMemo(() => (parsedSchema.ok && parsedData.ok ? { schema: parsedSchema.data, data: parsedData.data } : null), [parsedData, parsedSchema]);
  const curl = payload ? curlFor(endpoint, payload) : '';

  useEffect(() => {
    if (!payload) {
      return;
    }
    const key = draftKey(payload.schema, payload.data);
    if (key === lastCommittedDraftKey.current) {
      return;
    }
    lastCommittedDraftKey.current = key;
    onDraftChange(updateDraftSchemaAndData(draft, payload.schema, payload.data, entities));
  }, [draft, entities, onDraftChange, payload]);

  async function validate() {
    setResult(null);
    setSyntaxError('');
    if (!source) {
      setSyntaxError('The source example is still loading.');
      return;
    }
    if (!parsedSchema.ok) {
      setSyntaxError(`Schema JSON error: ${parsedSchema.error}`);
      return;
    }
    if (!parsedData.ok) {
      setSyntaxError(`Data JSON error: ${parsedData.error}`);
      return;
    }
    const requestPayload = { schema: parsedSchema.data, data: parsedData.data };
    onDraftChange(updateDraftSchemaAndData(draft, parsedSchema.data, parsedData.data, entities));
    setPending(true);
    try {
      setResult(await postToBiovalidator(endpoint, requestPayload));
    } finally {
      setPending(false);
    }
  }

  async function copyCurl() {
    if (!curl) {
      return;
    }
    await navigator.clipboard.writeText(curl);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <section className="validationLayout">
      <div className="validationEditor">
        <div className="fieldRow">
          <label>
            Endpoint
            <input value={endpoint} onChange={(event) => setEndpoint(event.target.value)} />
          </label>
          <button className="primaryButton" type="button" onClick={validate} disabled={pending}>
            <Play size={16} aria-hidden="true" />
            {pending ? 'Validating' : 'Validate'}
          </button>
          <button className="secondaryButton" type="button" onClick={copyCurl} disabled={!curl}>
            {copied ? <CheckCircle2 size={16} aria-hidden="true" /> : <Clipboard size={16} aria-hidden="true" />}
            {copied ? 'Copied' : 'Copy curl'}
          </button>
        </div>
        {endpoint === DEFAULT_BIOVALIDATOR_ENDPOINT ? (
          <p className="muted">
            Default endpoint: {DEFAULT_BIOVALIDATOR_ENDPOINT}. Browser validation from HTTPS pages requires an HTTPS endpoint or CORS-enabled HTTP access.
          </p>
        ) : null}
        {draft ? <div className="draftInlineState">Editing working draft: {draft.sourceLabel}</div> : null}
        {syntaxError ? <div className="warningLine">JSON syntax or loading error: {syntaxError}</div> : null}
        <label className="schemaEditorLabel">
          Schema
          <textarea className="schemaTextArea" value={schemaValue} onChange={(event) => setSchemaValue(event.target.value)} />
        </label>
        <label className="dataEditorLabel">
          Data
          <JsonEditor value={dataValue} onChange={setDataValue} />
        </label>
      </div>
      <div className="validationOutput">
        <ValidationResult result={result} />
        <details className="curlBox" open>
          <summary>Reproducible curl request</summary>
          <pre className="codeBlock small">{curl || 'Load an example to generate a curl command.'}</pre>
        </details>
      </div>
    </section>
  );
}

function draftKey(schema: unknown, data: unknown) {
  return JSON.stringify({ schema, data });
}
