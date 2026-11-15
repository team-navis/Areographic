import * as THREE from 'three';

/**
 * Interior fabrication details in the habitat's existing local coordinate frame.
 * The caller retains the pressure hull, doors, window, furniture and all lights.
 *
 * Replace the old wall helper with `panels` (same arguments), the ceiling tile
 * loop with `ceiling()`, and the shallow ribs/conduit with `structure()`. Call
 * `services()` after the walls, before instancing rivets and merging meshes.
 * Include `materials` in the room's interior environment-map material list.
 */
export function buildArchitectureDetails({ group, materials: M, panelMaterials, box, cyl, tube, rivets, room, airlock }) {
  const ownedMaterials = [], ownedTextures = [];
  const { x0, x1, z0, z1, h } = room;
  const ribStations = [-1.72, 1.94];
  const built = { ceiling: false, structure: false, services: false };
  const stats = { wallPanels: 0, ceilingPanels: 0, ventilationRegisters: 0 };

  // Small printed maintenance markings, shared as one atlas/material. They are
  // ordinary lit surfaces: no screen glow, projected photograph or fake depth.
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 768; labelCanvas.height = 512;
  const context = labelCanvas.getContext('2d');
  const labels = [
    ['RETURN AIR / 01', 'FILTER ACCESS  ·  KEEP CLEAR'],
    ['RETURN AIR / 02', 'FILTER ACCESS  ·  KEEP CLEAR'],
    ['HAB / ELECTRICAL', '24 V DC   ·   SERVICE ISOLATOR'],
    ['ENVIRONMENTAL', 'AIR HANDLING  /  SERVICE 04'],
    ['PRESSURE LINER', 'REMOVABLE ACCESS PANEL'],
    ['AIRLOCK / UTILITY', 'INSPECT SEAL BEFORE CYCLE'],
    ['SUPPLY / L-02', 'LOW VOLTAGE DISTRIBUTION'],
    ['SERVICE ACCESS', 'CAPTIVE FASTENERS / 4'],
  ];
  labels.forEach(([title, subtitle], index) => {
    const y = index * 64;
    context.fillStyle = '#dedbd0'; context.fillRect(0, y, 768, 64);
    context.fillStyle = '#3a3d39'; context.fillRect(0, y + 6, 6, 52);
    context.font = '600 21px monospace'; context.fillText(title, 19, y + 27);
    context.fillStyle = '#666860'; context.font = '13px monospace'; context.fillText(subtitle, 19, y + 49);
    // Printed stock and a serial strip, not a repeated decorative wall motif.
    context.fillStyle = '#707169';
    for (let j = 0; j < 32; j++) context.fillRect(639 + j * 3, y + 15, j % 3 === 0 ? 2 : 1, 30);
  });
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  labelTexture.colorSpace = THREE.SRGBColorSpace; labelTexture.anisotropy = 4;
  const labelMaterial = new THREE.MeshStandardMaterial({ map: labelTexture, color: 0xf4f2eb, roughness: .96, metalness: 0 });
  ownedMaterials.push(labelMaterial); ownedTextures.push(labelTexture);

  function mesh(geometry, material, parent, name, cast = true) {
    const object = new THREE.Mesh(geometry, material);
    object.name = name; object.castShadow = cast; object.receiveShadow = true;
    parent.add(object); return object;
  }

  function frame(axis, centre, fixed, y, facing, name) {
    const node = new THREE.Group(); node.name = name;
    if (axis === 'x') {
      node.position.set(centre, y, fixed); node.rotation.y = facing > 0 ? 0 : Math.PI;
    } else {
      node.position.set(fixed, y, centre); node.rotation.y = facing * Math.PI / 2;
    }
    node.updateMatrix(); group.add(node); return node;
  }

  function fastener(node, x, y, z, axis) {
    node.updateMatrix();
    const point = new THREE.Vector3(x, y, z).applyMatrix4(node.matrix);
    rivets.push([point.x, point.y, point.z, axis]);
  }

  function label(parent, index, width, x, y, z) {
    const geometry = new THREE.PlaneGeometry(width, width / 12);
    const uv = geometry.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setY(i, (uv.getY(i) + 7 - index) / 8);
    const plate = mesh(geometry, labelMaterial, parent, 'printed-maintenance-label', false);
    plate.position.set(x, y, z); return plate;
  }

  /** A folded sheet with a broad flange and shallow pressed centre, in local XY. */
  function foldedSheet(width, height, depth = .038) {
    const positions = [], uvs = [], indices = [];
    const inset = Math.min(.033, width * .08, height * .13);
    const corner = Math.min(.008, height * .025, width * .025);
    const profiles = [[0, .012], [.002, depth - .002], [.005, depth], [inset, depth], [inset + .010, depth - .011], [inset + .014, depth - .012]];
    for (const [margin, z] of profiles) {
      const a = width / 2 - margin, b = height / 2 - margin, c = Math.min(corner, a / 3, b / 3);
      const outline = [[-a + c, -b], [a - c, -b], [a, -b + c], [a, b - c], [a - c, b], [-a + c, b], [-a, b - c], [-a, -b + c]];
      for (const [x, y] of outline) { positions.push(x, y, z); uvs.push(x / width + .5, y / height + .5); }
    }
    for (let layer = 0; layer < profiles.length - 1; layer++) for (let i = 0; i < 8; i++) {
      const a = layer * 8 + i, b = layer * 8 + (i + 1) % 8, c = (layer + 1) * 8 + i, d = (layer + 1) * 8 + (i + 1) % 8;
      indices.push(a, b, c, b, d, c);
    }
    const centre = positions.length / 3, ring = (profiles.length - 1) * 8;
    positions.push(0, 0, depth - .012); uvs.push(.5, .5);
    for (let i = 0; i < 8; i++) indices.push(ring + i, ring + (i + 1) % 8, centre);
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices); geometry.computeVertexNormals(); return geometry;
  }

  function cassette(parent, width, height, material, depth = .038) {
    const seal = box(width + .005, height + .005, .006, M.rubber, 0, 0, .010, parent);
    seal.castShadow = false;
    return mesh(foldedSheet(width, height, depth), material, parent, 'folded-enamel-cassette');
  }

  /** Same wall segment contract as base.js; does not bridge window/door gaps. */
  function panels(axis, a0, a1, fixed, y0, y1, facing, preferredWidth = 1.42) {
    const span = a1 - a0, height = y1 - y0;
    if (span <= .03 || height <= .03) return;
    const columns = Math.max(1, Math.round(span / preferredWidth)), width = span / columns;
    const breaks = [y0];
    // A removable lower service liner, rather than one featureless full-height slab.
    if (y0 < .60 && y1 > 1.15) breaks.push(.84);
    breaks.push(y1);
    for (let i = 0; i < columns; i++) for (let j = 0; j < breaks.length - 1; j++) {
      const lower = breaks[j], upper = breaks[j + 1], centre = a0 + width * (i + .5);
      const node = frame(axis, centre, fixed, (lower + upper) / 2, facing, 'wall-liner-cassette');
      const variant = (i + j * 2 + Math.round(Math.abs(fixed) * 3)) % panelMaterials.length;
      const pw = width - .012, ph = upper - lower - .012;
      const depth = .037 + (variant % 3) * .00065;
      cassette(node, pw, ph, panelMaterials[variant], depth);
      const horizontal = pw / 2 - .019, vertical = ph / 2 - .019;
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) fastener(node, sx * horizontal, sy * vertical, depth + .001, axis === 'x' ? 'z' : 'x');
      if (ph > 1.05) for (const sx of [-1, 1]) fastener(node, sx * horizontal, 0, depth + .001, axis === 'x' ? 'z' : 'x');
      // A few captive service latches and a small identification tag on lower panels.
      if (j === 0 && lower < .05 && width > .75 && i % 3 === 1) {
        box(.043, .066, .005, M.alu, pw / 2 - .09, ph / 2 - .095, depth - .007, node, .003);
        box(.021, .006, .004, M.dark, pw / 2 - .09, ph / 2 - .095, depth - .003, node);
        label(node, 4, .23, -pw / 2 + .20, ph / 2 - .10, depth - .0105);
      }
      stats.wallPanels++;
    }
    if (y0 < .02) {
      const skirting = frame(axis, (a0 + a1) / 2, fixed, .050, facing, 'wall-kick-strip');
      box(span - .018, .081, .012, M.alu, 0, 0, .044, skirting, .003);
      box(span - .018, .008, .004, M.rubber, 0, -.043, .041, skirting);
    }
  }

  function ceiling() {
    if (built.ceiling) return; built.ceiling = true;
    // Broad removable cassettes align to structure, with narrow peripheral service bays.
    const across = [x0, x0 + 1.16, -.95, .95, x1 - 1.16, x1];
    const along = [z0, ...ribStations, z1];
    for (let i = 0; i < across.length - 1; i++) for (let j = 0; j < along.length - 1; j++) {
      const width = across[i + 1] - across[i] - .012, length = along[j + 1] - along[j] - .012;
      const node = new THREE.Group(); node.name = 'ceiling-liner-cassette';
      node.position.set((across[i] + across[i + 1]) / 2, h + .009, (along[j] + along[j + 1]) / 2);
      node.rotation.x = Math.PI / 2; group.add(node);
      cassette(node, width, length, panelMaterials[(i + j) % panelMaterials.length], .038);
      // The outer flange tucks behind ribs/raceways. Captive screws sit on the
      // visible recessed field, 2 mm below its surface, rather than behind that cover.
      for (const sx of [-1, 1]) for (const sy of [-1, 1]) fastener(node, sx * (width / 2 - .120), sy * (length / 2 - .120), .028, 'y');
      stats.ceilingPanels++;
    }
    // A separate, lower airlock liner preserves its existing clear height.
    const width = room.x0 - .16 - airlock.x0, length = airlock.z1 - airlock.z0;
    const node = new THREE.Group(); node.name = 'airlock-ceiling-liner';
    node.position.set(airlock.x0 + width / 2, 2.465, (airlock.z0 + airlock.z1) / 2); node.rotation.x = Math.PI / 2; group.add(node);
    cassette(node, width - .018, length - .018, panelMaterials[1], .028);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) fastener(node, sx * (width / 2 - .120), sy * (length / 2 - .120), .018, 'y');
  }

  function structure() {
    if (built.structure) return; built.structure = true;
    for (const station of ribStations) {
      // Folded hat sections: a broad painted flange, inset web and a narrow seam.
      box(x1 - x0 - .09, .026, .20, M.rubber, 0, h - .033, station);
      box(x1 - x0 - .11, .039, .18, M.wall, 0, h - .055, station, group, .006);
      box(x1 - x0 - .19, .042, .095, M.cabinet, 0, h - .086, station, group, .005);
      for (const side of [-1, 1]) {
        const x = side < 0 ? x0 : x1;
        box(.029, h - .12, .20, M.rubber, x - side * .033, (h - .12) / 2, station);
        box(.039, h - .12, .18, M.wall, x - side * .055, (h - .12) / 2, station, group, .006);
        box(.045, h - .17, .095, M.cabinet, x - side * .086, (h - .17) / 2, station, group, .005);
        // Short corner reinforcement, bevelled rather than an oversized sci-fi arch.
        const knee = box(.155, .037, .12, M.alu, x - side * .115, h - .118, station, group, .004);
        knee.rotation.z = side * Math.PI / 4;
        for (const y of [.25, 1.06, 2.20]) rivets.push([x - side * .112, y, station, 'x']);
      }
      for (const x of [-3.7, -1.1, 1.1, 3.7]) rivets.push([x, h - .109, station, 'y']);
    }

    // Perimeter service raceway. Its open lip reveals a dark cable gap while
    // the finished cover remains the same warm enamel as the pressure liner.
    for (const side of [-1, 1]) {
      const x = side < 0 ? x0 : x1;
      box(.068, .105, z1 - z0 - .12, M.rubber, x - side * .052, h - .13, 0);
      box(.026, .10, z1 - z0 - .12, M.cabinet, x - side * .091, h - .135, 0, group, .004);
      box(.102, .017, z1 - z0 - .12, M.alu, x - side * .062, h - .190, 0, group, .003);
      for (const z of [-2.55, -.78, .62, 2.50]) box(.020, .126, .035, M.alu, x - side * .105, h - .139, z, group, .003);
    }

    // A real conduit with socket joints and saddle clips on the rear ceiling.
    const conduitZ = z1 - .24, conduitY = h - .085;
    tube([[x0 + .24, conduitY, conduitZ], [x0 + .5, conduitY, conduitZ], [x1 - .5, conduitY, conduitZ], [x1 - .24, conduitY, conduitZ - .12]], .016, M.alu);
    for (const x of [-3.88, -2.45, -.72, 1.16, 2.96, 4.02]) {
      box(.035, .025, .075, M.steel, x, conduitY + .011, conduitZ, group, .004);
      const socket = cyl(.020, .020, .045, M.trim, x, conduitY, conduitZ, group, 12); socket.rotation.z = Math.PI / 2;
      rivets.push([x, conduitY - .006, conduitZ + .029, 'y']);
    }
  }

  function register(axis, centre, fixed, y, facing, width, height, labelIndex) {
    const node = frame(axis, centre, fixed, y, facing, 'ventilation-register');
    box(width + .018, height + .018, .012, M.rubber, 0, 0, .043, node, .006);
    box(width, height, .018, M.dark, 0, 0, .056, node, .005);
    for (const sx of [-1, 1]) box(.027, height + .006, .026, M.cabinet, sx * (width / 2 - .010), 0, .070, node, .003);
    for (const sy of [-1, 1]) box(width - .020, .025, .026, M.cabinet, 0, sy * (height / 2 - .010), .070, node, .003);
    const count = Math.max(4, Math.floor((height - .055) / .030));
    for (let i = 0; i < count; i++) {
      const blade = box(width - .070, .005, .026, M.alu, 0, -height / 2 + .038 + i * ((height - .076) / (count - 1)), .071, node);
      blade.rotation.x = -.38;
    }
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) fastener(node, sx * (width / 2 - .012), sy * (height / 2 - .012), .085, axis === 'x' ? 'z' : 'x');
    label(node, labelIndex, Math.min(.29, width * .58), 0, -height / 2 - .033, .040);
    stats.ventilationRegisters++;
  }

  function services() {
    if (built.services) return; built.services = true;
    // Equipment is placed at the perimeter; the live displays and both door
    // sweeps stay clear. All wall fittings project less than 10 cm into the room.
    register('x', -3.69, z0, 2.27, 1, .61, .29, 0);
    register('x', 3.70, z0, 2.27, 1, .61, .29, 1);
    register('x', 2.78, z1, 2.22, -1, 1.06, .25, 3);
    register('z', 2.44, x0, 2.29, 1, .55, .24, 5);

    // Electrical enclosure behind the rear worktop, with a folded cover,
    // exposed hinge knuckles and a grounded conduit exiting its upper gland.
    const enclosure = frame('x', -.91, z1, 1.72, -1, 'rear-electrical-enclosure');
    box(.53, .62, .018, M.rubber, 0, 0, .043, enclosure, .008);
    box(.51, .60, .048, M.cabinet, 0, 0, .064, enclosure, .010);
    box(.46, .55, .008, M.wall, .007, 0, .091, enclosure, .004);
    for (const y of [-.18, .18]) {
      const hinge = cyl(.009, .009, .065, M.steel, -.241, y, .093, enclosure, 10);
      hinge.name = 'enclosure-hinge';
    }
    box(.018, .046, .007, M.dark, .194, 0, .098, enclosure, .003);
    label(enclosure, 2, .35, 0, .175, .096);
    label(enclosure, 7, .22, -.04, -.198, .096);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) fastener(enclosure, sx * .225, sy * .257, .097, 'z');
    const rearConduitX = -.83, rearConduitZ = z1 - .075;
    tube([[rearConduitX, 2.01, rearConduitZ], [rearConduitX, 2.18, rearConduitZ], [rearConduitX + .11, 2.35, rearConduitZ], [.85, 2.35, rearConduitZ], [1.08, 2.48, rearConduitZ]], .012, M.alu);
    for (const x of [-.50, .25, .80]) {
      box(.024, .053, .022, M.steel, x, 2.35, z1 - .064, group, .003);
      rivets.push([x, 2.369, z1 - .078, 'z']);
    }

    // Restrained flexible utility cable, with actual retainers beside the hatch.
    const wallX = x0 + .074;
    tube([[wallX, h - .24, -.44], [wallX, 2.18, -.44], [wallX, 2.01, -.37], [wallX, 1.90, -.37]], .010, M.rubber);
    for (const y of [2.30, 2.12]) {
      box(.020, .022, .047, M.alu, wallX - .005, y, -.44, group, .003);
      rivets.push([wallX + .007, y, -.425, 'x']);
    }
    const junction = frame('z', -.37, x0, 1.83, 1, 'airlock-utility-junction');
    box(.17, .17, .033, M.cabinet, 0, 0, .059, junction, .008);
    box(.144, .144, .007, M.alu, 0, 0, .079, junction, .003);
    label(junction, 6, .125, 0, .015, .083);
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) fastener(junction, sx * .060, sy * .060, .084, 'x');

    const vestibule = frame('x', (airlock.x0 + airlock.x1) / 2, airlock.z1, 2.17, -1, 'airlock-inspection-tag');
    label(vestibule, 5, .36, 0, 0, .040);
  }

  return {
    panels, ceiling, structure, services, materials: ownedMaterials, stats,
    dispose() { ownedTextures.forEach((texture) => texture.dispose()); ownedMaterials.forEach((material) => material.dispose()); },
  };
}
