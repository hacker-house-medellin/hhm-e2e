import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// Static source-contract admission only; no Atto compiler or HTTP guest execution.
const CLIENT_ROUTES = Object.freeze({
  health: ['GET', '/healthz'],
  ready: ['GET', '/readyz'],
  config: ['GET', '/api/config'],
  emit_event: ['POST', '/api/events'],
  create_lead: ['POST', '/api/leads'],
  create_alert: ['POST', '/api/alerts'],
});
const VISITOR_ROUTES = Object.freeze({
  visitor_qr: '/v1/visitor-qr/{action}',
  visit_check_in: '/v1/visits/check-in',
  visit_check_out: '/v1/visits/check-out',
  presence_submission_nonce: '/v1/presence/submission-nonces',
  presence_observation: '/v1/presence/observations',
});

function equal(actual, expected, label) {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`);
  }
}

const DESCRIPTOR = /\bpub\s+fnc\s+([a-z][a-z0-9_]*)\s*\(\s*\)\s*:\s*string\s*\{\s*return\s+"([^"\r\n]+)";\s*\}/g;

export function parse_atto_descriptors(source) {
  const clean = source.replace(/"(?:\\.|[^"\\])*"|\/\/[^\r\n]*/g,
    piece => piece.startsWith('//') ? '' : piece);
  const matches = [...clean.matchAll(DESCRIPTOR)];
  const residual = clean.replace(DESCRIPTOR, '').trim();
  if (residual.length !== 0 || matches.length === 0) {
    throw new Error('unsupported or missing Atto descriptor declaration');
  }
  const result = new Map();
  for (const [, name, literal] of matches) {
    if (result.has(name)) throw new Error(`duplicate Atto descriptor: ${name}`);
    result.set(name, literal);
  }
  return result;
}

function inventory(actual, expected, label) {
  equal([...actual.keys()].sort().join(','), [...expected].sort().join(','), label + ' descriptor inventory');
}

function load(root, path) {
  return readFileSync(join(root, path), 'utf8');
}

export function verify_atto_surfaces(clients_root, interfaces_root) {
  if (!clients_root || !interfaces_root) throw new Error('client and interface roots required');

  const sdk = parse_atto_descriptors(load(clients_root, 'clients/atto/src/hhm_client.atto'));
  inventory(sdk, Object.keys(CLIENT_ROUTES).flatMap(n => [`${n}_path`, `${n}_method`]), 'SDK');
  for (const [name, [method, path]] of Object.entries(CLIENT_ROUTES)) {
    equal(sdk.get(`${name}_path`), path, name + ' path');
    equal(sdk.get(`${name}_method`), method, name + ' method');
  }

  const matrix = JSON.parse(load(clients_root, 'clients/matrix.json'));
  equal(matrix.languages?.atto?.dir, 'clients/atto', 'SDK matrix dir');
  equal(matrix.languages?.atto?.sentinel, 'src/hhm_client.atto', 'SDK matrix sentinel');
  const sdk_matrix = JSON.parse(load(clients_root, 'clients/sdk-matrix.json'));
  equal(sdk_matrix.targets?.atto?.zed_target, 'atto', 'SDK target');
  equal(sdk_matrix.targets?.atto?.dir, 'clients/atto', 'SDK target dir');

  const visitor = parse_atto_descriptors(load(interfaces_root, 'bindings/atto/src/visitor_access.atto'));
  inventory(visitor, Object.keys(VISITOR_ROUTES).flatMap(n => [`${n}_path`, `${n}_method`]), 'visitor');
  const openapi = JSON.parse(load(interfaces_root, 'openapi/openapi.json'));
  for (const [name, path] of Object.entries(VISITOR_ROUTES)) {
    equal(visitor.get(`${name}_path`), path, name + ' path');
    equal(visitor.get(`${name}_method`), 'POST', name + ' method');
    const operation = openapi.paths?.[path]?.post;
    if (!operation || typeof operation !== 'object' || Array.isArray(operation)) {
      throw new Error('missing OpenAPI POST: ' + path);
    }
    if (typeof operation.operationId !== 'string' || !operation.operationId.trim()) {
      throw new Error('missing OpenAPI operationId: ' + path);
    }
    if (!operation.requestBody?.content?.['application/json'] ||
        !operation.responses || Object.keys(operation.responses).length === 0) {
      throw new Error('incomplete OpenAPI POST request/response: ' + path);
    }
  }

  const statuses = parse_atto_descriptors(load(interfaces_root, 'bindings/atto/src/reservation_status.atto'));
  const schema = JSON.parse(load(interfaces_root, 'schemas/reservation.json'));
  const allowed = schema.properties?.status?.enum;
  if (schema.properties?.status?.type !== 'string' || !Array.isArray(allowed) || allowed.length === 0) {
    throw new Error('missing reservation status enum');
  }
  const canonical = ['requested', 'confirmed', 'checked_in', 'completed', 'cancelled'];
  if (allowed.length !== canonical.length) throw new Error('reservation status enum length drift');
  equal([...new Set(allowed)].sort().join(','), canonical.slice().sort().join(','), 'reservation status enum');
  inventory(statuses, allowed.map(n => `reservation_${n}`), 'reservation');
  for (const status of allowed) equal(statuses.get(`reservation_${status}`), status, 'reservation status');

  return { client_routes: Object.keys(CLIENT_ROUTES).length, visitor_routes: Object.keys(VISITOR_ROUTES).length, reservation_statuses: allowed.length };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [clients, interfaces, ...extra] = process.argv.slice(2);
    if (extra.length) throw new Error('unexpected arguments');
    console.log(`Atto source contracts passed: ${JSON.stringify(verify_atto_surfaces(clients, interfaces))}`);
  } catch (error) {
    console.error(`Atto source-contract admission failed: ${error.message}`);
    process.exitCode = 1;
  }
}
