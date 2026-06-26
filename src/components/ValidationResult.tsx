import type { ValidatorResult } from '../lib/validatorClient';
import { formatJson } from '../lib/examples';

interface ValidationResultProps {
  result: ValidatorResult | null;
}

export function ValidationResult({ result }: ValidationResultProps) {
  if (!result) {
    return <p className="muted">No validation request has been sent for the current editor contents.</p>;
  }

  const rows = Array.isArray(result.response) ? result.response : [];

  return (
    <section className={`resultBox status-${result.status}`}>
      <div className="resultHeader">
        <strong>{titleForStatus(result.status)}</strong>
        {result.httpStatus ? <span>HTTP {result.httpStatus}</span> : null}
      </div>
      <p>{result.message}</p>
      {result.warning ? <p className="warningText">{result.warning}</p> : null}
      {rows.length > 0 ? (
        <div className="tableWrap">
          <table>
            <thead>
              <tr>
                <th>Path</th>
                <th>Message</th>
                <th>Schema</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const record = asRecord(row);
                return (
                  <tr key={index}>
                    <td>{stringFrom(record.instancePath ?? record.dataPath ?? record.path ?? '')}</td>
                    <td>{stringFrom(record.message ?? record.error ?? row)}</td>
                    <td>{stringFrom(record.schemaPath ?? record.keyword ?? '')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}
      {result.response !== undefined ? <pre className="codeBlock small">{formatJson(result.response)}</pre> : null}
      {result.rawText && result.response === undefined ? <pre className="codeBlock small">{result.rawText}</pre> : null}
    </section>
  );
}

function titleForStatus(status: ValidatorResult['status']) {
  switch (status) {
    case 'valid':
      return 'Valid';
    case 'invalid':
      return 'Validation errors';
    case 'mixed-content':
      return 'Mixed content blocked';
    case 'network-error':
      return 'Network or CORS failure';
    default:
      return 'Unclassified response';
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function stringFrom(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (value === null || value === undefined) {
    return '';
  }
  return JSON.stringify(value);
}
