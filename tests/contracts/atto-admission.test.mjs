import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parse_atto_descriptors, verify_atto_surfaces } from '../../scripts/check-atto-contracts.mjs';

const CLIENT = {
  health: ['GET', '/healthz'], ready: ['GET', '/readyz'], config: ['GET', '/api/config'],
  emit_event: ['POST', '/api/events'], create_lead: ['POST', '/api/leads'], create_alert: ['POST', '/api/alerts'],
};
const VISITOR = {
  visitor_qr: '/v1/visitor-qr/{action}', visit_check_in: '/v1/visits/check-in',
  visit_check_out: '/v1/visits/check-out', presence_submission_nonce: '/v1/presence/submission-nonces',
  presence_observation: '/v1/presence/observations',
};
const STATUS = ['requested', 'confirmed', 'checked_in', 'completed', 'cancelled'];
const fn = (name, value) => `pub fnc ${name}(): string { return "${value}"; }\n`;

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'hhm-atto-'));
  const clients = join(root, 'clients-repo'), interfaces = join(root, 'interfaces-repo');
  const write = (base, relative, data) => {
    const path = join(base, relative);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
    return path;
  };
  const files = {
    client: write(clients, 'clients/atto/src/hhm_client.atto', Object.entries(CLIENT).map(([name, [method, path]]) =>
      fn(`${name}_path`, path) + fn(`${name}_method`, method)).join('\n')),
    matrix: write(clients, 'clients/matrix.json', JSON.stringify({ languages: { atto: { dir: 'clients/atto', sentinel: 'src/hhm_client.atto' } } })),
    sdk_matrix: write(clients, 'clients/sdk-matrix.json', JSON.stringify({ targets: { atto: { zed_target: 'atto', dir: 'clients/atto' } } })),
    visitor: write(interfaces, 'bindings/atto/src/visitor_access.atto', Object.entries(VISITOR).map(([name, path]) =>
      fn(`${name}_path`, path) + fn(`${name}_method`, 'POST')).join('\n')),
    status: write(interfaces, 'bindings/atto/src/reservation_status.atto', STATUS.map(s => fn(`reservation_${s}`, s)).join('\n')),
    openapi: write(interfaces, 'openapi/openapi.json', JSON.stringify({ paths: Object.fromEntries(Object.values(VISITOR).map(p => [p, { post: { operationId: 'fixture' } }])) })),
    schema: write(interfaces, 'schemas/reservation.json', JSON.stringify({ properties: { status: { type: 'string', enum: STATUS } } })),
  };
  try { run(clients, interfaces, files); } finally { rmSync(root, { recursive: true, force: true }); }
}

test('offline Atto contract admission checks six client and five visitor operations', () => fixture((clients, interfaces) => {
  assert.deepEqual(verify_atto_surfaces(clients, interfaces), { client_routes: 6, visitor_routes: 5, reservation_statuses: 5 });
}));

test('parses multiline typed Atto methods and ignores comments', () => {
  const parsed = parse_atto_descriptors('// example\npub fnc health_path(): string {\n return "/healthz";\n}\n');
  assert.equal(parsed.get('health_path'), '/healthz');
});

test('rejects duplicate functions, unsupported code and empty source', () => {
  assert.throws(() => parse_atto_descriptors(fn('health', 'a') + fn('health', 'b')), /duplicate/);
  assert.throws(() => parse_atto_descriptors('pub fnc health(): string { return dynamic(); }'), /unsupported/);
  assert.throws(() => parse_atto_descriptors('pub fnc health(): string { return "x"; }\nfnc unreviewed() {}'), /unsupported/);
  assert.throws(() => parse_atto_descriptors('// only comments'), /missing/);
});

test('rejects HTTP method drift and removed SDK functions', () => fixture((clients, interfaces, files) => {
  const original = readFileSync(files.client, 'utf8');
  writeFileSync(files.client, original.replace('return "POST";', 'return "DELETE";'));
  assert.throws(() => verify_atto_surfaces(clients, interfaces), /method/);
  writeFileSync(files.client, original.replace(/pub fnc health_path[^\n]*\n/, ''));
  assert.throws(() => verify_atto_surfaces(clients, interfaces), /inventory/);
}));

test('rejects SDK matrix drift', () => fixture((clients, interfaces, files) => {
  writeFileSync(files.matrix, JSON.stringify({ languages: { atto: { dir: 'clients/atto', sentinel: 'wrong.atto' } } }));
  assert.throws(() => verify_atto_surfaces(clients, interfaces), /matrix sentinel/);
}));

test('rejects missing visitor OpenAPI POST and reservation status tampering', () => fixture((clients, interfaces, files) => {
  const openapi = JSON.parse(readFileSync(files.openapi, 'utf8'));
  delete openapi.paths['/v1/visits/check-in'];
  writeFileSync(files.openapi, JSON.stringify(openapi));
  assert.throws(() => verify_atto_surfaces(clients, interfaces), /missing OpenAPI POST/);
  writeFileSync(files.openapi, JSON.stringify({ paths: Object.fromEntries(Object.values(VISITOR).map(p => [p, { post: {} }])) }));
  writeFileSync(files.status, readFileSync(files.status, 'utf8').replace('return "cancelled";', 'return "unknown";'));
  assert.throws(() => verify_atto_surfaces(clients, interfaces), /reservation status/);
}));

test('the CLI runs offline and returns a nonzero status on invalid source', () => fixture((clients, interfaces, files) => {
  const bin = fileURLToPath(new URL('../../scripts/check-atto-contracts.mjs', import.meta.url));
  const valid = spawnSync(process.execPath, [bin, clients, interfaces], { encoding: 'utf8' });
  assert.equal(valid.status, 0, valid.stderr);
  assert.match(valid.stdout, /"client_routes":6/);
  writeFileSync(files.visitor, readFileSync(files.visitor, 'utf8') + '\nfnc unknown() {}\n');
  const invalid = spawnSync(process.execPath, [bin, clients, interfaces], { encoding: 'utf8' });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /unsupported/);
}));

test('the CLI refuses missing checkout roots rather than skipping the gate', () => {
  const bin = fileURLToPath(new URL('../../scripts/check-atto-contracts.mjs', import.meta.url));
  const result = spawnSync(process.execPath, [bin], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /client and interface roots required/);
});
