/**
 * @license GPL-3.0-or-later
 */
// Surface-class pass for the ASCII City Walk (CW-23).
//
// The converter picks a glyph from LUMINANCE alone: it sees how bright a cell
// is and nothing else, so pavement and a tower face that happen to sample the
// same brightness get the same character. The reference implementation is a
// raycaster and knows what every ray hit for free; we render a real 3D frame
// and sample its pixels, so that knowledge has to be RENDERED once more, as
// data rather than as a picture.
//
// This renders the same scene a second time with every mesh painted a flat
// class id instead of its own material, into a render target sized to the
// CHARACTER GRID rather than the viewport — one pixel per cell, about 15,600
// pixels at the game's smallest characters against roughly 400,000 for the
// main sample readback. The result is one byte per cell saying what that cell
// is looking at.
//
// Ids are written by a shader straight into the red channel rather than by
// setting a material colour, because a colour would be put through the
// renderer's colour management on the way in and the readback would no longer
// be the number that went in.

import { Color, NoColorSpace, ShaderMaterial, WebGLRenderTarget } from 'three';

/**
 * Surface classes. The values ARE the wire format between the pass and the
 * glyph vocabularies, so they are explicit and stable rather than an array
 * index that shifts when a row is inserted.
 */
export const SURFACE_CLASS = {
  SKY: 0,
  GROUND: 1,
  ROAD: 2,
  CURB: 3,
  BUILDING_WALL: 4,
  BUILDING_ROOF: 5,
  STOREFRONT: 6,
  SIGN: 7,
  MAST: 8,
  TREE: 9,
  CAR: 10,
  LAMP: 11,
};

/**
 * Which class each named mesh belongs to.
 *
 * The scene has been partitioned by name since CW-18 (`buildCityGroup` and
 * `buildStreetProps` name every merged mesh), so this pass needs no new
 * geometry and no changes to how the city is built — it only has to know the
 * names. A mesh whose name is missing here is left out of the pass entirely
 * and reads as sky, which is the safe direction: an unclassified cell falls
 * back to the full glyph vocabulary it has always used.
 */
const CLASS_BY_MESH_NAME = new Map([
  ['ground', SURFACE_CLASS.GROUND],
  ['roads', SURFACE_CLASS.ROAD],
  ['curbs', SURFACE_CLASS.CURB],
  // buildings splits into wall and roof by normal; see ROOF_SPLIT below.
  ['buildings', SURFACE_CLASS.BUILDING_WALL],
  ['storefronts', SURFACE_CLASS.STOREFRONT],
  ['sign-plates', SURFACE_CLASS.SIGN],
  ['sign-faces', SURFACE_CLASS.SIGN],
  ['antennas', SURFACE_CLASS.MAST],
  ['tree-trunks', SURFACE_CLASS.TREE],
  ['tree-canopies', SURFACE_CLASS.TREE],
  ['cars', SURFACE_CLASS.CAR],
  ['lamp-poles', SURFACE_CLASS.LAMP],
  ['lamp-heads', SURFACE_CLASS.LAMP],
]);

/**
 * Meshes whose flat tops are a different surface from their sides.
 *
 * Buildings are extruded upward as ONE merged geometry, so the roof caps and
 * the walls share a mesh and cannot be told apart by name. They can be told
 * apart by which way they face: the extrusion is along +Z, so a face whose
 * normal points at the sky is a roof and everything else is a wall.
 */
const ROOF_SPLIT = new Map([['buildings', SURFACE_CLASS.BUILDING_ROOF]]);

/** Above this dot product with +Z a face counts as looking at the sky. */
const ROOF_NORMAL_Z = 0.9;

const VERTEX_SHADER = /* glsl */ `
  varying float vUp;
  void main() {
    // Object space is world space here: the city group is never rotated, and
    // the merged meshes bake their own transforms in at build time.
    vUp = normalize(normalMatrix * normal).z;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uId;
  uniform float uRoofId;
  uniform float uRoofNormalZ;
  varying float vUp;
  void main() {
    float id = uId;
    // uRoofId is 0 for every mesh that has no separate top surface, and 0 is
    // the sky class, which no geometry can be.
    if (uRoofId > 0.0 && vUp >= uRoofNormalZ) id = uRoofId;
    gl_FragColor = vec4(id / 255.0, 0.0, 0.0, 1.0);
  }
`;

/**
 * Build the surface-class pass for a scene.
 *
 * @param {import('three').WebGLRenderer} renderer - the game's renderer; the
 *   pass borrows it and puts its state back
 * @param {import('three').Scene} root - the SCENE, so that everything the
 *   camera can see is accounted for, not only the classified meshes
 * @returns {{
 *   read: (camera: import('three').Camera, cols: number, rows: number) => Uint8Array|null,
 *   dispose: () => void
 * }}
 */
export function createClassPass(renderer, root) {
  const materials = new Map(); // mesh -> its class material
  const originals = new Map(); // mesh -> the material it normally wears
  let target = null;
  let pixels = null;
  let classMap = null;
  let disposed = false;

  const materialFor = (id, roofId) => {
    const key = `${id}:${roofId}`;
    let mat = materials.get(key);
    if (!mat) {
      mat = new ShaderMaterial({
        uniforms: {
          uId: { value: id },
          uRoofId: { value: roofId },
          uRoofNormalZ: { value: ROOF_NORMAL_Z },
        },
        vertexShader: VERTEX_SHADER,
        fragmentShader: FRAGMENT_SHADER,
        // No fog and no lighting: this pass encodes identity, and anything
        // that shades or blends it corrupts the number.
        fog: false,
      });
      materials.set(key, mat);
    }
    return mat;
  };

  const ensureTarget = (cols, rows) => {
    if (target && target.width === cols && target.height === rows) return;
    target?.dispose();
    target = new WebGLRenderTarget(cols, rows, {
      depthBuffer: true,
      stencilBuffer: false,
    });
    // The ids must survive the round trip as the integers they are.
    target.texture.colorSpace = NoColorSpace;
    target.texture.generateMipmaps = false;
    pixels = new Uint8Array(cols * rows * 4);
    classMap = new Uint8Array(cols * rows);
  };

  const clearColor = new Color();

  return {
    /**
     * Render one class frame and return it as one byte per cell, row 0 at the
     * TOP to match the converter's own row order.
     *
     * @returns {Uint8Array|null} cols*rows class ids, or null if disposed
     */
    read(camera, cols, rows) {
      if (disposed || !(cols > 0) || !(rows > 0)) return null;
      ensureTarget(cols, rows);

      // Dress EVERY mesh, not only the known ones. A mesh left in its own
      // material would paint its own colour into the id buffer and be read
      // back as whatever class that number happens to be; an unknown mesh
      // writes 0 instead and is reported as sky, which falls back to the full
      // glyph vocabulary the converter has always used.
      originals.clear();
      root.traverse((obj) => {
        if (!obj.isMesh) return;
        const id = CLASS_BY_MESH_NAME.get(obj.name) ?? SURFACE_CLASS.SKY;
        originals.set(obj, obj.material);
        obj.material = materialFor(id, ROOF_SPLIT.get(obj.name) ?? 0);
      });

      const prevTarget = renderer.getRenderTarget();
      renderer.getClearColor(clearColor);
      const prevAlpha = renderer.getClearAlpha();
      renderer.setRenderTarget(target);
      // Everything the city does not cover is sky, which is class 0.
      renderer.setClearColor(0x000000, 1);
      renderer.clear();
      renderer.render(root, camera);
      renderer.readRenderTargetPixels(target, 0, 0, cols, rows, pixels);
      renderer.setRenderTarget(prevTarget);
      renderer.setClearColor(clearColor, prevAlpha);

      for (const [mesh, material] of originals) mesh.material = material;
      originals.clear();

      // readRenderTargetPixels hands back rows bottom-up, which is upside
      // down against the converter's grid.
      for (let y = 0; y < rows; y++) {
        const src = (rows - 1 - y) * cols * 4;
        const dst = y * cols;
        for (let x = 0; x < cols; x++) classMap[dst + x] = pixels[src + x * 4];
      }
      return classMap;
    },

    dispose() {
      disposed = true;
      for (const [mesh, material] of originals) mesh.material = material;
      originals.clear();
      for (const mat of materials.values()) mat.dispose();
      materials.clear();
      target?.dispose();
      target = null;
      pixels = null;
      classMap = null;
    },
  };
}
