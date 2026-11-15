import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

/**
 * Furnishing for the existing habitat footprint. Every finish is supplied by
 * base.js so the room IBL/material registry and static batching stay shared.
 * Replace base.js's desk-through-operator-chair block with this one call; keep
 * its monitor wall, airlock, panel fasteners and exterior construction intact.
 */
export function buildHabitatFurniture({ group, materials: M, box, cyl, tube, contactShadow = () => {}, seat = { x: 0, z: -1.62 } }) {
  const worktop = M.worktop || M.steel, caseMetal = M.caseMetal || M.alu;
  const fastener = M.fastener || M.steel, hardware = M.anodized || M.dark;
  const paint = M.cabinet, paper = M.document || M.paper;
  const DK = { x0: -3.55, x1: 3.55, zf: -2.02, zb: -2.97, top: .78 };
  const furnish = new THREE.Group(); furnish.name = 'habitat-furniture'; group.add(furnish);
  const addMesh = (geometry, material, parent = furnish) => {
    const mesh = new THREE.Mesh(geometry, material); mesh.castShadow = true; mesh.receiveShadow = true; parent.add(mesh); return mesh;
  };
  const b = (w, h, d, mat, x, y, z, parent = furnish, radius = 0) => box(w, h, d, mat, x, y, z, parent, radius);
  const c = (rt, rb, h, mat, x, y, z, parent = furnish, seg = 12) => cyl(rt, rb, h, mat, x, y, z, parent, seg);
  const t = (points, radius, mat, parent = furnish) => tube(points, radius, mat, parent);
  const screws = [];
  // Screw heads are instanced once. Their locations follow actual assembly joints.
  const screw = (x, y, z, axis = 'z', parent = furnish, radius = .004) => screws.push({ x, y, z, axis, parent, radius });

  function faceFrame(w, h, x, y, z, parent, mat, width = .016, depth = .018) {
    b(w, width, depth, mat, x, y - h / 2 + width / 2, z, parent, .003);
    b(w, width, depth, mat, x, y + h / 2 - width / 2, z, parent, .003);
    for (const side of [-1, 1]) b(width, h - width * 2, depth, mat, x + side * (w / 2 - width / 2), y, z, parent, .003);
  }
  function hinge(x, y, z, parent) {
    b(.035, .083, .006, fastener, x, y, z, parent, .002);
    for (let i = -1; i <= 1; i++) c(.006, .006, .023, i === 0 ? hardware : fastener, x, y + i * .026, z + .006, parent, 8);
    screw(x - .01, y - .026, z + .004, 'z', parent, .0028);
    screw(x + .01, y + .026, z + .004, 'z', parent, .0028);
  }
  function recessedPull(x, y, z, width, parent) {
    b(width + .018, .047, .003, M.rubber, x, y, z, parent, .006);
    b(width, .034, .004, hardware, x, y - .002, z + .002, parent, .005);
    b(width - .015, .008, .018, fastener, x, y + .018, z + .008, parent, .003);
    for (const side of [-1, 1]) b(.008, .032, .015, fastener, x + side * (width / 2 - .004), y, z + .006, parent, .002);
  }

  // Folded stainless top: thin deck, downturned apron, inward return and side caps.
  b(7.1, .018, .95, worktop, 0, DK.top - .009, -2.495, furnish, .006);
  b(7.1, .068, .018, worktop, 0, DK.top - .043, DK.zf - .009, furnish, .004);
  b(7.064, .014, .051, worktop, 0, DK.top - .084, DK.zf - .0255, furnish, .003);
  b(7.06, .006, .008, hardware, 0, DK.top - .09, DK.zf - .008);
  b(7.1, .075, .014, worktop, 0, DK.top + .0195, DK.zb + .007, furnish, .003);
  for (const side of [-1, 1]) {
    b(.016, .061, .915, worktop, side * (3.55 - .008), DK.top - .0395, -2.485, furnish, .003);
    b(.031, .012, .91, worktop, side * (3.55 - .0155), DK.top - .076, -2.485);
  }
  for (const x of [-3.48, -1.28, 1.28, 3.48]) {
    for (const z of [-2.09, -2.90]) {
      b(.047, .678, .047, M.alu, x, .383, z, furnish, .004);
      b(.073, .021, .073, hardware, x, .045, z, furnish, .005);
      c(.022, .026, .037, M.rubber, x, .0185, z);
      b(.105, .075, .012, fastener, x, .69, z + .026, furnish, .003);
      for (const dx of [-.033, .033]) screw(x + dx, .685, z + .034);
    }
    b(.042, .045, .81, M.alu, x, .23, -2.495);
  }
  for (const z of [-2.12, -2.88]) b(6.96, .035, .035, M.alu, 0, .69, z);
  b(6.92, .036, .036, M.alu, 0, .21, -2.9);

  function cabinet(cx, width, drawers = false) {
    const cab = new THREE.Group(); cab.name = drawers ? 'folded-drawer-cabinet' : 'recessed-door-cabinet'; cab.position.set(cx, 0, -2.515); furnish.add(cab);
    const front = .355, height = .66;
    // Sheet carcass and recessed toe plinth, rather than a solid rounded block.
    b(width - .035, .064, .59, hardware, 0, .052, -.018, cab, .004);
    b(width - .022, .017, .70, paint, 0, .097, 0, cab, .003);
    b(width - .022, .017, .70, paint, 0, .732, 0, cab, .003);
    for (const side of [-1, 1]) {
      b(.017, height, .70, paint, side * (width / 2 - .0085), .414, 0, cab, .003);
      b(.025, height - .015, .032, fastener, side * (width / 2 - .026), .412, front - .026, cab, .003);
    }
    b(width - .035, height - .025, .012, paint, 0, .414, -.344, cab);
    b(width - .05, .60, .012, M.rubber, 0, .412, front - .026, cab, .002);
    if (drawers) {
      for (let i = 0; i < 4; i++) {
        const y = .172 + i * .151, w = width - .07;
        b(w, .139, .018, paint, 0, y, front - .012, cab, .005);
        faceFrame(w - .016, .123, 0, y, front - .001, cab, caseMetal, .010, .006);
        b(w - .058, .086, .004, paint, 0, y - .008, front - .002, cab, .002);
        recessedPull(0, y + .022, front + .003, w * .5, cab);
        // Small label pocket and an individual drawer latch/lock.
        b(.075, .018, .003, M.paper, -w * .34, y - .027, front + .004, cab);
        const lock = c(.009, .009, .007, fastener, w * .36, y + .025, front + .008, cab); lock.rotation.x = Math.PI / 2;
        b(.007, .0015, .0015, hardware, w * .36, y + .025, front + .012, cab);
      }
    } else {
      const dw = width - .07, dh = .59, cy = .414;
      b(dw, dh, .014, paint, 0, cy, front - .013, cab, .005);
      faceFrame(dw - .01, dh - .01, 0, cy, front - .003, cab, paint, .025, .018);
      b(dw - .09, dh - .09, .007, paint, 0, cy, front - .008, cab, .004);
      for (const y of [.22, .61]) hinge(-dw / 2 + .018, y, front + .009, cab);
      b(.038, .173, .004, M.rubber, dw / 2 - .07, cy + .025, front + .008, cab, .007);
      t([[dw / 2 - .07, cy - .027, front + .013], [dw / 2 - .07, cy - .02, front + .031], [dw / 2 - .07, cy + .077, front + .031], [dw / 2 - .07, cy + .084, front + .013]], .006, fastener, cab);
      const lock = c(.010, .010, .006, fastener, dw / 2 - .07, cy - .092, front + .01, cab); lock.rotation.x = Math.PI / 2;
      b(.007, .0015, .0015, hardware, dw / 2 - .07, cy - .092, front + .014, cab);
    }
    return cab;
  }
  cabinet(-1.85, .82); cabinet(1.85, .82); cabinet(2.95, .9, true);
  contactShadow(7.1, .95, 0, -2.495, .24);

  /** A closed transit case. All edge rails, latches and grips fit w × height × d. */
  function caseBox(cx, cy, cz, width, height, depth, parent = furnish) {
    const item = new THREE.Group(); item.name = 'sealed-aluminium-transit-case'; item.position.set(cx, cy, cz); parent.add(item);
    const seam = height * .71, rail = Math.min(.023, height * .08), front = depth / 2;
    // Recessed folded panel faces nested in external edge extrusions.
    b(width - .046, height - .046, depth - .046, hardware, 0, height / 2, 0, item, .008);
    for (const side of [-1, 1]) {
      b(width - .066, seam - .038, .008, caseMetal, 0, seam / 2 + .005, side * (front - .023), item, .005);
      b(width - .066, height - seam - .034, .008, caseMetal, 0, (height + seam) / 2 - .003, side * (front - .023), item, .004);
      b(.008, height - .068, depth - .066, caseMetal, side * (width / 2 - .023), height / 2, 0, item, .005);
      for (const y of [rail / 2, height - rail / 2]) {
        b(width, rail, rail, fastener, 0, y, side * (front - rail / 2), item, .004);
        b(rail, rail, depth - rail * 2, fastener, side * (width / 2 - rail / 2), y, 0, item, .003);
      }
      // Two aluminium lid profiles with a narrow, visible rubber gasket between.
      b(width - .02, .006, .012, M.rubber, 0, seam, side * (front - .013), item);
      for (const dy of [-.009, .009]) b(width - .018, .010, .015, fastener, 0, seam + dy, side * (front - .0085), item, .002);
      b(.012, .006, depth - .03, M.rubber, side * (width / 2 - .013), seam, 0, item);
      for (const dy of [-.009, .009]) b(.015, .010, depth - .028, fastener, side * (width / 2 - .0085), seam + dy, 0, item, .002);
      for (const zSide of [-1, 1]) b(rail, height - rail * 2, rail, fastener, side * (width / 2 - rail / 2), height / 2, zSide * (front - rail / 2), item, .003);
    }
    b(width - .063, .011, depth - .063, caseMetal, 0, height - .023, 0, item, .005);
    b(width - .055, .012, depth - .055, caseMetal, 0, .021, 0, item);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) for (const top of [false, true]) {
      b(.041, .039, .041, fastener, sx * (width / 2 - .0205), top ? height - .0195 : .0195, sz * (front - .0205), item, .008);
    }
    // The over-centre latches bridge the gasket. Pins and hooks sit inside the rail envelope.
    for (const x of [-width * .29, width * .29]) {
      b(.044, .069, .008, hardware, x, seam - .01, front - .014, item, .004);
      b(.025, .041, .009, fastener, x, seam - .013, front - .007, item, .003);
      b(.031, .010, .010, fastener, x, seam + .019, front - .008, item, .002);
      const pin = c(.004, .004, .033, fastener, x, seam - .027, front - .009, item, 8); pin.rotation.z = Math.PI / 2;
      screw(x, seam + .033, front - .008, 'z', item, .0025);
    }
    const gripW = Math.min(.19, width * .36), gripY = height * .34;
    b(gripW + .045, .072, .004, M.rubber, 0, gripY, front - .013, item, .008);
    for (const side of [-1, 1]) {
      b(.022, .057, .006, fastener, side * (gripW / 2 + .006), gripY, front - .008, item, .004);
      screw(side * (gripW / 2 + .006), gripY - .018, front - .004, 'z', item, .0025);
    }
    t([[-gripW / 2, gripY + .019, front - .008], [-gripW / 2, gripY - .012, front - .008], [gripW / 2, gripY - .012, front - .008], [gripW / 2, gripY + .019, front - .008]], .0045, fastener, item);
    b(gripW * .72, .012, .012, hardware, 0, gripY - .012, front - .008, item, .004);
    // Paired hinges on the rear and an inset identification pocket on the lid.
    for (const x of [-width * .28, width * .28]) {
      b(.054, .057, .006, fastener, x, seam, -front + .01, item, .003);
      const pin = c(.005, .005, .050, fastener, x, seam, -front + .006, item, 8); pin.rotation.z = Math.PI / 2;
    }
    b(.11, .027, .003, hardware, 0, height - .055, front - .014, item, .002);
    b(.099, .018, .002, M.paper, 0, height - .055, front - .011, item);
    return item;
  }
  caseBox(-2.95, .02, -2.5, .92, .3, .6);
  caseBox(-2.95, .325, -2.5, .92, .3, .6);

  // Service distribution below the bench: removable cover, cable glands, secured runs.
  {
    const j = new THREE.Group(); j.position.set(.1, .37, -2.865); j.name = 'bench-junction-box'; furnish.add(j);
    b(.32, .22, .105, paint, 0, 0, 0, j, .009);
    b(.286, .19, .007, M.rubber, 0, 0, .055, j, .004);
    b(.276, .18, .008, paint, 0, 0, .06, j, .004);
    for (const x of [-.12, .12]) for (const y of [-.073, .073]) screw(x, y, .067, 'z', j, .0035);
    for (const side of [-1, 1]) { const gland = c(.014, .016, .025, hardware, side * .17, -.03, 0, j); gland.rotation.z = Math.PI / 2; }
    for (const x of [-.9, -.55, .65, 1.1]) b(.024, .065, .02, hardware, x, .34, -2.89, furnish, .003);
    t([[-1.2, .34, -2.88], [-.5, .31, -2.87], [-.08, .34, -2.865]], .011, M.rubber);
    t([[.28, .34, -2.865], [.7, .32, -2.87], [1.25, .35, -2.88]], .011, M.rubber);
    t([[.1, .48, -2.865], [.12, .61, -2.88], [.1, .76, -2.89]], .009, M.cableRed);
  }

  // A keyboard has a real stagger, wide modifiers, spacebar and arrow cluster.
  b(.65, .003, .30, M.rubber, seat.x + .04, .7815, -2.25, furnish, .014);
  {
    const kb = new THREE.Group(); kb.name = 'workstation-keyboard'; kb.position.set(seat.x, .785, -2.23); furnish.add(kb);
    b(.49, .023, .17, hardware, 0, .0115, 0, kb, .009);
    b(.463, .004, .145, M.rubber, 0, .024, -.002, kb, .005);
    const caps = [];
    const key = (x, z, width = .022, depth = .021) => caps.push({ x, z, width, depth });
    for (let row = 0; row < 4; row++) {
      for (let col = 0; col < 12; col++) key(-.208 + col * .026 + (row % 2) * .005, -.057 + row * .028);
      key(.112, -.057 + row * .028, row === 0 ? .044 : .033);
    }
    key(-.203, .055, .033); key(-.16, .055, .027); key(-.123, .055, .027); key(-.018, .055, .165); key(.092, .055, .035);
    for (const [x, z] of [[.158, .055], [.187, .055], [.216, .055], [.187, .027]]) key(x, z, .022, .021);
    for (let row = 0; row < 3; row++) for (let col = 0; col < 3; col++) key(.158 + col * .029, -.057 + row * .023, .021, .017);
    const keys = new THREE.InstancedMesh(new RoundedBoxGeometry(1, 1, 1, 1, .10), M.bezel, caps.length), temp = new THREE.Object3D();
    caps.forEach((cap, i) => { temp.position.set(cap.x, .031, cap.z); temp.scale.set(cap.width, .009, cap.depth); temp.updateMatrix(); keys.setMatrixAt(i, temp.matrix); });
    keys.name = 'keyboard-keycaps'; keys.castShadow = true; keys.receiveShadow = true; kb.add(keys);
    for (const x of [.15, .18, .21]) b(.004, .002, .004, M.led, x, .027, -.075, kb);
    t([[.07, .02, -.082], [.08, .015, -.12], [.16, .012, -.16]], .003, M.rubber, kb);
  }
  b(.23, .003, .22, M.rubber, seat.x + .43, .7815, -2.23, furnish, .009);
  {
    const mouse = new THREE.Group(); mouse.position.set(seat.x + .41, .783, -2.23); furnish.add(mouse);
    const shell = addMesh(new THREE.SphereGeometry(1, 18, 12), hardware, mouse); shell.scale.set(.029, .019, .052); shell.position.y = .012;
    b(.0013, .003, .041, M.rubber, 0, .031, -.014, mouse);
    const wheel = c(.005, .005, .011, M.rubber, 0, .032, -.022, mouse, 10); wheel.rotation.z = Math.PI / 2;
    t([[0, .014, -.05], [.02, .005, -.10], [.08, .003, -.17]], .0025, M.rubber, mouse);
  }
  {
    const cup = addMesh(new THREE.LatheGeometry([[.031, 0], [.04, .005], [.041, .105], [.036, .105], [.035, .01], [.031, 0]].map(([x, y]) => new THREE.Vector2(x, y)), 20), fastener);
    cup.position.set(-.66, .78, -2.47); cup.name = 'open-pen-cup';
    for (let i = 0; i < 5; i++) {
      const a = i * 2.4, x = -.66 + Math.cos(a) * .018, z = -2.47 + Math.sin(a) * .018;
      const pen = new THREE.Group(); pen.position.set(x, .845, z); pen.rotation.set(Math.cos(a) * .12, 0, Math.sin(a) * .12); furnish.add(pen);
      c(.0035, .0035, .15, i === 1 ? M.red : hardware, 0, .075, 0, pen, 6);
      c(.004, .004, .025, fastener, 0, .133, 0, pen, 6);
      b(.002, .026, .002, fastener, .004, .12, 0, pen);
    }
  }

  // Compact electronics with recessed fascia, actual vent slots, connectors and a carry bail.
  function instrument(cx, cz, width, depth, switches = false) {
    const unit = new THREE.Group(); unit.name = switches ? 'guarded-power-panel' : 'field-radio'; unit.position.set(cx, .78, cz); furnish.add(unit);
    b(width, .142, depth, caseMetal, 0, .083, 0, unit, .009);
    b(width - .026, .113, .006, M.rubber, 0, .083, depth / 2 + .003, unit, .004);
    b(width - .044, .097, .006, hardware, 0, .083, depth / 2 + .007, unit, .003);
    for (const x of [-width / 2 + .034, width / 2 - .034]) for (const y of [.048, .12]) screw(x, y, depth / 2 + .012, 'z', unit, .0027);
    for (const side of [-1, 1]) {
      b(.018, .021, depth * .7, M.rubber, side * (width / 2 - .03), .01, 0, unit, .004);
      for (let i = 0; i < 6; i++) b(.0015, .035, .006, hardware, side * (width / 2 + .001), .085, -.055 + i * .019, unit);
    }
    if (switches) {
      for (let i = 0; i < 4; i++) {
        const x = -.11 + i * .064, z = depth / 2 + .014;
        const collar = c(.008, .008, .004, fastener, x, .079, z, unit); collar.rotation.x = Math.PI / 2;
        const lever = c(.0025, .0025, .026, fastener, x, .086, z + .014, unit, 6); lever.rotation.x = .7;
        t([[x - .016, .057, z], [x - .016, .108, z + .018], [x + .016, .108, z + .018], [x + .016, .057, z]], .003, i === 0 ? M.red : fastener, unit);
        b(.004, .004, .002, i === 0 ? M.ledAmber : M.led, x, .126, z, unit);
      }
    } else {
      b(.14, .044, .003, M.bezel, .086, .09, depth / 2 + .011, unit, .003);
      b(.115, .018, .002, M.ledAmber, .086, .091, depth / 2 + .013, unit);
      for (const [x, r] of [[-.16, .017], [-.104, .012]]) {
        const knob = c(r, r, .022, hardware, x, .083, depth / 2 + .023, unit, 16); knob.rotation.x = Math.PI / 2;
        b(.002, r * .6, .002, M.paper, x, .083 + r * .4, depth / 2 + .035, unit);
      }
      for (let i = 0; i < 4; i++) b(.012, .006, .004, fastener, -.035 + i * .024, .055, depth / 2 + .016, unit, .001);
      c(.004, .004, .22, hardware, width / 2 - .045, .25, -depth / 2 + .045, unit, 8);
    }
    t([[-width / 2 + .035, .11, -.03], [-width / 2 + .035, .19, -.03], [width / 2 - .035, .19, -.03], [width / 2 - .035, .11, -.03]], .006, hardware, unit);
    return unit;
  }
  instrument(-2.50, -2.54, .48, .29);
  instrument(1.20, -2.54, .49, .25, true);
  caseBox(2.77, .78, -2.55, .61, .195, .35);

  function papers(cx, cz, width, depth, count = 7, y = .781, yaw = 0, parent = furnish) {
    const stack = new THREE.Group(); stack.name = 'field-paper-stack'; stack.position.set(cx, y, cz); stack.rotation.y = yaw; parent.add(stack);
    for (let i = 0; i < count; i++) {
      const sheet = b(width, .0008, depth, i === count - 1 ? paper : M.paper, (i % 3 - 1) * .0015, .0008 * (i + .5), (i % 2) * .001, stack);
      sheet.rotation.y = (i % 3 - 1) * .006;
    }
    return stack;
  }
  papers(-1.22, -2.35, .31, .24, 9, .781, .11);
  papers(-1.47, -2.47, .25, .19, 4, .781, -.12);
  {
    const clipboard = new THREE.Group(); clipboard.position.set(2.0, .781, -2.32); clipboard.rotation.y = -.1; furnish.add(clipboard);
    b(.25, .006, .32, M.wood, 0, .003, 0, clipboard, .003);
    papers(0, 0, .224, .282, 3, .0065, 0, clipboard);
    b(.072, .004, .025, fastener, 0, .012, -.135, clipboard, .004);
    t([[-.025, .013, -.139], [-.023, .024, -.139], [.023, .024, -.139], [.025, .013, -.139]], .0025, fastener, clipboard);
  }
  {
    const book = new THREE.Group(); book.position.set(2.32, .78, -2.29); book.rotation.y = .13; furnish.add(book);
    b(.19, .003, .255, hardware, 0, .0015, 0, book, .003);
    b(.18, .015, .244, M.paper, .002, .011, 0, book);
    b(.19, .003, .255, hardware, 0, .02, 0, book, .003);
    b(.009, .022, .255, hardware, -.092, .011, 0, book, .003);
    b(.007, .002, .256, M.rubber, .058, .022, 0, book);
  }

  // Narrow west rack. Cases face the aisle; their depth after rotation is only .42 m.
  {
    const rack = new THREE.Group(); rack.name = 'bolted-storage-rack'; rack.position.set(-4.165, 0, -1.55); furnish.add(rack);
    for (const x of [-.248, .248]) for (const z of [-.795, .795]) {
      b(.030, 2.12, .030, fastener, x, 1.08, z, rack, .002);
      b(.056, .017, .056, hardware, x, .015, z, rack, .003);
      for (const y of [.25, .84, 1.43, 2.02]) { b(.042, .07, .042, fastener, x, y, z, rack, .003); screw(x + .023, y, z, 'x', rack, .0032); }
    }
    // The wall rib at world z=-1.72 projects into the rack's back edge. Each
    // sheet has a genuine 60 × 200 mm clearance notch, with folded returns;
    // the shelf's front edge and original walking footprint remain unchanged.
    const notch = { x: -.215, z0: -.27, z1: -.07 };
    const shelfOutline = new THREE.Shape();
    shelfOutline.moveTo(-.275, -.83); shelfOutline.lineTo(.275, -.83);
    shelfOutline.lineTo(.275, .83); shelfOutline.lineTo(-.275, .83);
    shelfOutline.lineTo(-.275, notch.z1); shelfOutline.lineTo(notch.x, notch.z1);
    shelfOutline.lineTo(notch.x, notch.z0); shelfOutline.lineTo(-.275, notch.z0); shelfOutline.closePath();
    for (const y of [.25, .84, 1.43, 2.02]) {
      // ExtrudeGeometry uses the metre-sized outline for its planar UVs.
      const shelf = addMesh(new THREE.ExtrudeGeometry(shelfOutline, { depth: .018, bevelEnabled: false }), caseMetal, rack);
      shelf.name = 'notched-storage-shelf'; shelf.rotation.x = Math.PI / 2; shelf.position.y = y + .009;
      b(.012, .039, 1.66, fastener, .269, y - .02, 0, rack, .002);
      for (const [z0, z1] of [[-.83, notch.z0], [notch.z1, .83]]) b(.012, .039, z1 - z0, fastener, -.269, y - .02, (z0 + z1) / 2, rack, .002);
      b(.012, .039, notch.z1 - notch.z0, fastener, notch.x + .006, y - .02, (notch.z0 + notch.z1) / 2, rack, .002);
      for (const z of [notch.z0 - .006, notch.z1 + .006]) b(.06, .039, .012, fastener, -.245, y - .02, z, rack, .002);
      for (const side of [-1, 1]) b(.52, .039, .012, fastener, 0, y - .02, side * .824, rack, .002);
    }
    const cb = (y, z, width, height) => { const item = caseBox(0, y + .011, z, width, height, .42, rack); item.rotation.y = Math.PI / 2; return item; };
    cb(.25, -.405, .64, .3); cb(.25, .385, .62, .25);
    cb(.84, -.405, .64, .28); cb(.84, .385, .62, .32);
    cb(1.43, -.31, .79, .27); cb(1.43, .49, .40, .21);
    b(.37, .21, .53, M.fabric, 0, 2.135, .30, rack, .035);
    for (const z of [.12, .48]) b(.39, .014, .027, hardware, 0, 2.244, z, rack, .003);
    const small = caseBox(0, 2.031, -.43, .55, .23, .41, rack); small.rotation.y = Math.PI / 2;
    contactShadow(.57, 1.70, -4.165, -1.55, .3);
  }
  // Wall-mounted safety equipment remains above the floor circulation area.
  {
    b(.03, .34, .26, hardware, -4.445, 1.42, 2.05, furnish, .01);
    b(.006, .12, .20, M.bezel, -4.427, 1.5, 2.05, furnish, .004);
    b(.004, .06, .17, M.ledAmber, -4.421, 1.5, 2.05);
    for (let i = 0; i < 3; i++) b(.012, .027, .027, i ? fastener : M.red, -4.42, 1.33, 1.98 + i * .07, furnish, .004);
    b(.045, .42, .32, M.red, -4.445, .66, 2.45, furnish, .012);
    b(.004, .034, .15, M.paper, -4.42, .69, 2.45);
    b(.004, .15, .034, M.paper, -4.42, .69, 2.45);
  }

  // Low stowage bench and rear worktop, both exactly inside the shared footprints.
  {
    b(1.96, .022, .50, worktop, 2.9, .49, 2.70, furnish, .006);
    b(1.96, .054, .016, worktop, 2.9, .454, 2.458, furnish, .003);
    for (const x of [1.98, 3.82]) for (const z of [2.49, 2.91]) b(.038, .45, .038, fastener, x, .245, z, furnish, .003);
    caseBox(2.5, .025, 2.70, .72, .30, .40);
    caseBox(3.35, .503, 2.70, .61, .25, .39);
    contactShadow(2, .54, 2.9, 2.70, .26);
    // Extinguisher mounts over the bench, not as an unmodelled floor obstruction.
    c(.06, .06, .38, M.red, 3.78, 1.20, 2.88, furnish, 16);
    b(.13, .025, .025, hardware, 3.78, 1.20, 2.94, furnish, .003);
    c(.019, .024, .065, fastener, 3.78, 1.423, 2.88);
    b(.072, .018, .023, hardware, 3.78, 1.456, 2.88, furnish, .003);
    t([[3.80, 1.43, 2.88], [3.86, 1.36, 2.87], [3.86, 1.13, 2.87]], .006, M.rubber);
  }
  {
    const cx = -.15, cz = 2.70;
    b(2.9, .018, .54, worktop, cx, .829, cz, furnish, .005);
    b(2.9, .065, .015, worktop, cx, .7875, 2.4375, furnish, .003);
    b(2.86, .012, .035, worktop, cx, .749, 2.4475);
    for (const x of [-1.55, 1.25]) for (const z of [2.47, 2.93]) {
      b(.041, .76, .041, M.alu, x, .4, z, furnish, .003);
      c(.022, .024, .025, M.rubber, x, .0125, z);
    }
    b(2.76, .018, .43, caseMetal, cx, .14, cz, furnish, .003);
    caseBox(-1.05, .151, cz, .72, .31, .38); caseBox(.42, .151, cz, .86, .25, .38);
    b(.65, .003, .34, M.rubber, -.3, .8395, cz, furnish, .01);
    papers(.66, 2.66, .24, .3, 6, .8405, .10);
    contactShadow(2.9, .54, cx, cz, .26);
  }

  // Low equipment chair. Its top is below the monitor apertures and all parts
  // remain within x ±.35 / z ±.35 of SEAT for the existing walking collider.
  const chair = new THREE.Group(); chair.name = 'low-operator-chair'; chair.position.set(seat.x, 0, seat.z); group.add(chair);
  {
    b(.48, .046, .444, hardware, 0, .463, -.012, chair, .026);
    b(.50, .061, .46, M.leather, 0, .507, -.015, chair, .028);
    // Inset upholstery seams follow the pad edge rather than decorative grooves.
    t([[-.204, .532, -.194], [-.223, .532, -.166], [-.223, .532, .142], [-.203, .532, .174]], .0018, M.rubber, chair);
    t([[.204, .532, -.194], [.223, .532, -.166], [.223, .532, .142], [.203, .532, .174]], .0018, M.rubber, chair);
    const back = new THREE.Group(); back.position.set(0, .79, .254); back.rotation.x = .075; chair.add(back);
    b(.445, .44, .047, hardware, 0, 0, .005, back, .027);
    b(.416, .404, .032, M.leather, 0, .002, -.027, back, .024);
    for (const side of [-1, 1]) t([[side * .11, .465, .16], [side * .11, .57, .27], [side * .11, .75, .292]], .012, hardware, chair);
    b(.16, .042, .13, hardware, 0, .427, -.005, chair, .008);
    c(.024, .025, .23, fastener, 0, .30, 0, chair, 16);
    c(.040, .044, .115, hardware, 0, .185, 0, chair, 16);
    for (let i = 0; i < 5; i++) {
      const angle = i * Math.PI * 2 / 5 + .3, dx = Math.cos(angle), dz = Math.sin(angle);
      const spoke = b(.255, .028, .044, hardware, dx * .142, .104, dz * .142, chair, .008); spoke.rotation.y = -angle;
      c(.013, .014, .042, fastener, dx * .276, .074, dz * .276, chair, 10);
      b(.048, .036, .042, hardware, dx * .276, .054, dz * .276, chair, .008);
      for (const side of [-1, 1]) {
        const wheel = c(.027, .027, .014, M.rubber, dx * .276 - dz * side * .020, .028, dz * .276 + dx * side * .020, chair, 12);
        wheel.rotation.z = Math.PI / 2; wheel.rotation.y = -angle;
      }
    }
    for (const side of [-1, 1]) {
      b(.036, .177, .035, hardware, side * .274, .5885, .07, chair, .005);
      b(.047, .026, .258, M.rubber, side * .274, .687, .005, chair, .010);
      b(.024, .026, .15, hardware, side * .244, .463, .045, chair, .004);
    }
    t([[.105, .43, .01], [.205, .415, .015], [.225, .415, -.042]], .006, fastener, chair);
    b(.07, .017, .027, hardware, .225, .415, -.056, chair, .006);
    contactShadow(.70, .70, seat.x, seat.z, .28);
  }

  // Consolidated hardware remains one draw call per material after room merging.
  group.updateMatrixWorld(true); furnish.updateMatrixWorld(true);
  if (screws.length) {
    const heads = new THREE.InstancedMesh(new THREE.CylinderGeometry(1, 1.1, .45, 10), fastener, screws.length);
    const slots = new THREE.InstancedMesh(new THREE.BoxGeometry(1.1, .13, .18), hardware, screws.length);
    const transform = new THREE.Object3D(), world = new THREE.Vector3(), normal = new THREE.Vector3(), inv = furnish.matrixWorld.clone().invert();
    screws.forEach((s, i) => {
      s.parent.updateWorldMatrix(true, false); world.set(s.x, s.y, s.z).applyMatrix4(s.parent.matrixWorld).applyMatrix4(inv);
      normal.set(s.axis === 'x' ? 1 : 0, s.axis === 'y' ? 1 : 0, s.axis === 'z' ? 1 : 0).transformDirection(s.parent.matrixWorld).transformDirection(inv);
      transform.position.copy(world); transform.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal); transform.scale.setScalar(s.radius); transform.updateMatrix(); heads.setMatrixAt(i, transform.matrix);
      transform.position.addScaledVector(normal, s.radius * .24); transform.updateMatrix(); slots.setMatrixAt(i, transform.matrix);
    });
    heads.name = 'furniture-fastener-heads'; slots.name = 'furniture-fastener-slots'; heads.castShadow = true; heads.receiveShadow = true; furnish.add(heads, slots);
  }
  return { chair, group: furnish, caseBox };
}
