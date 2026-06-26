import type { WrappedExample } from './types';

export const DEFAULT_BIOVALIDATOR_ENDPOINT = 'http://biovalidator.ega.ebi.ac.uk/validate';
export const ENDPOINT_STORAGE_KEY = 'fega-playground.biovalidatorEndpoint';

export type ValidatorStatus = 'valid' | 'invalid' | 'unknown' | 'network-error' | 'mixed-content';

export interface ValidatorResult {
  status: ValidatorStatus;
  message: string;
  response?: unknown;
  rawText?: string;
  httpStatus?: number;
  warning?: string;
}

export function parseJsonEditorValue(value: string): { ok: true; data: unknown } | { ok: false; error: string } {
  try {
    return { ok: true, data: JSON.parse(value) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}

export function buildValidationPayload(source: WrappedExample, editedData: unknown): WrappedExample {
  return {
    schema: source.schema || {},
    data: editedData
  };
}

export function isMixedContentBlocked(endpoint: string, pageProtocol = globalThis.location?.protocol): boolean {
  try {
    return pageProtocol === 'https:' && new URL(endpoint).protocol === 'http:';
  } catch {
    return false;
  }
}

export async function postToBiovalidator(
  endpoint: string,
  payload: unknown,
  fetcher: typeof fetch = fetch,
  pageProtocol = globalThis.location?.protocol
): Promise<ValidatorResult> {
  if (isMixedContentBlocked(endpoint, pageProtocol)) {
    return {
      status: 'mixed-content',
      message:
        'This page is served over HTTPS but the configured Biovalidator endpoint uses HTTP. Browsers block that as mixed content before the request reaches the server.',
      warning: 'Use the copy curl fallback, run the playground over local HTTP, or expose the validation endpoint over HTTPS.'
    };
  }

  let response: Response;
  try {
    response = await fetcher(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    return {
      status: 'network-error',
      message:
        'The browser could not complete the request. For a cross-origin endpoint this is commonly a CORS policy failure; otherwise check endpoint reachability.',
      warning: error instanceof Error ? error.message : String(error)
    };
  }

  const rawText = await response.text();
  let parsed: unknown;
  try {
    parsed = rawText ? JSON.parse(rawText) : null;
  } catch {
    return {
      status: 'unknown',
      httpStatus: response.status,
      rawText,
      message: 'The endpoint responded, but the response was not valid JSON.',
      warning: 'Raw response is shown for debugging.'
    };
  }

  if (Array.isArray(parsed) && parsed.length === 0) {
    return {
      status: 'valid',
      httpStatus: response.status,
      response: parsed,
      rawText,
      message: 'Biovalidator returned an empty error array.'
    };
  }

  if (Array.isArray(parsed)) {
    return {
      status: 'invalid',
      httpStatus: response.status,
      response: parsed,
      rawText,
      message: 'Biovalidator returned validation errors.'
    };
  }

  return {
    status: 'unknown',
    httpStatus: response.status,
    response: parsed,
    rawText,
    message: 'Biovalidator returned a response shape the playground does not classify.'
  };
}

export function curlFor(endpoint: string, payload: unknown): string {
  const body = JSON.stringify(payload, null, 2);
  return [
    'curl -sS',
    `-X POST ${shellQuote(endpoint)}`,
    "-H 'Content-Type: application/json'",
    `--data-raw ${shellQuote(body)}`
  ].join(' \\\n  ');
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\"'\"'")}'`;
}
