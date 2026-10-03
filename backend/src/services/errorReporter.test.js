import test from 'node:test';
import assert from 'node:assert/strict';
import { env } from '../config/env.js';
import { reportError } from './errorReporter.js';

test('error reporter sends only bounded diagnostic metadata, never exception messages', async () => {
  const priorConfig = { ...env.errorReporting };
  const priorFetch = globalThis.fetch;
  let captured;
  try {
    env.errorReporting.provider = 'http';
    env.errorReporting.endpoint = 'https://errors.example.test/events';
    env.errorReporting.apiKey = 'test-secret';
    globalThis.fetch = async (_url, options) => {
      captured = options;
      return { ok: true, status: 202 };
    };
    assert.equal(await reportError(new Error('private-token-and-question-content'), {
      code: 'UPLOAD_FAILED', requestId: 'req-1', route: '/api/uploads?token=secret', method: 'POST', statusCode: 500,
    }), true);
    const body = JSON.parse(captured.body);
    assert.equal(body.route, '/api/uploads');
    assert.equal(body.errorCode, 'UPLOAD_FAILED');
    assert.equal(Object.hasOwn(body, 'message'), false);
    assert.doesNotMatch(captured.body, /private-token-and-question-content|secret/);
    assert.equal(captured.headers.Authorization, 'Bearer test-secret');
  } finally {
    env.errorReporting.provider = priorConfig.provider;
    env.errorReporting.endpoint = priorConfig.endpoint;
    env.errorReporting.apiKey = priorConfig.apiKey;
    globalThis.fetch = priorFetch;
  }
});
