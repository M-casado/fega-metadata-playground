import { describe, expect, it, vi } from 'vitest';
import {
  buildValidationPayload,
  curlFor,
  isMixedContentBlocked,
  parseJsonEditorValue,
  postToBiovalidator
} from '../src/lib/validatorClient';

describe('validator client', () => {
  it('builds the wrapper payload around edited JSON', () => {
    const payload = buildValidationPayload({ schema: { $ref: 'schema.json' }, data: { old: true } }, { edited: true });
    expect(payload).toEqual({ schema: { $ref: 'schema.json' }, data: { edited: true } });
  });

  it('validates editor JSON syntax locally', () => {
    expect(parseJsonEditorValue('{"ok": true}')).toEqual({ ok: true, data: { ok: true } });
    expect(parseJsonEditorValue('{broken').ok).toBe(false);
  });

  it('classifies an empty array response as valid', async () => {
    const result = await postToBiovalidator(
      'http://validator.example/validate',
      {},
      vi.fn().mockResolvedValue(new Response('[]', { status: 200 })),
      'http:'
    );
    expect(result.status).toBe('valid');
  });

  it('classifies an error array response as invalid', async () => {
    const result = await postToBiovalidator(
      'http://validator.example/validate',
      {},
      vi.fn().mockResolvedValue(new Response('[{"message":"bad"}]', { status: 200 })),
      'http:'
    );
    expect(result.status).toBe('invalid');
  });

  it('returns raw text for malformed responses', async () => {
    const result = await postToBiovalidator(
      'http://validator.example/validate',
      {},
      vi.fn().mockResolvedValue(new Response('not json', { status: 200 })),
      'http:'
    );
    expect(result.status).toBe('unknown');
    expect(result.rawText).toBe('not json');
  });

  it('detects mixed content before fetch', async () => {
    const fetcher = vi.fn();
    const result = await postToBiovalidator('http://validator.example/validate', {}, fetcher, 'https:');
    expect(isMixedContentBlocked('http://validator.example/validate', 'https:')).toBe(true);
    expect(fetcher).not.toHaveBeenCalled();
    expect(result.status).toBe('mixed-content');
  });

  it('classifies rejected fetches as network or CORS failures', async () => {
    const result = await postToBiovalidator('https://validator.example/validate', {}, vi.fn().mockRejectedValue(new TypeError('Failed to fetch')), 'https:');
    expect(result.status).toBe('network-error');
    expect(result.message).toContain('CORS');
  });

  it('creates a reproducible curl command', () => {
    const curl = curlFor('http://validator.example/validate', { data: { label: "O'Brien" } });
    expect(curl).toContain('curl -sS');
    expect(curl).toContain('--data-raw');
    expect(curl).toContain("O'\"'\"'Brien");
  });
});
