import test from 'node:test';
import assert from 'node:assert/strict';
import { assetUrl } from '../src/util/asset-url.js';

test('root hosting retains the existing asset URL', () => {
  assert.equal(assetUrl('/data/jezero/terrain.json'), '/data/jezero/terrain.json');
});

test('project hosting prefixes static data with the deployment base', () => {
  const base = '/Areographic/';
  assert.equal(assetUrl('/data/jezero/terrain.json', base), `${base}data/jezero/terrain.json`);
});

test('project hosting supports relative asset names', () => {
  assert.equal(assetUrl('models/nasa/mark-iii-spacesuit.glb', '/demo/'), '/demo/models/nasa/mark-iii-spacesuit.glb');
});

test('decoder directory retains its trailing slash', () => {
  assert.equal(assetUrl('/draco/', '/demo/'), '/demo/draco/');
});

test('base paths without a trailing slash do not concatenate names', () => {
  assert.equal(assetUrl('/textures/polyhaven/rock_face_diff_1k.jpg', '/demo'), '/demo/textures/polyhaven/rock_face_diff_1k.jpg');
});
