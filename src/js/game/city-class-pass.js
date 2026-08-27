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
  PERSON: 12,
  // CW-33. APPENDED, never renumbered: these ids are the wire format between
  // this pass and the glyph vocabularies, and a shifted id would silently
  // give every surface the voice of its neighbour.
  SIDEWALK: 13,
  GREEN: 14,
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
/**
 * Exported so a test can ask the QUESTION THIS MAP KEEPS FAILING: does every
 * mesh the city actually builds have a class here?
 *
 * A name missing from this map is not an error anywhere - the pass simply
 * leaves that mesh out and it reads as SKY. That is a safe default for a mesh
 * nobody added, and a silent, invisible defect for one somebody just did.
 * CW-56 added a ground mesh that would have been dressed as sky and nothing
 * would have said so; the guard in city-class-pass.test.js asks the builders
 * themselves now.
 */
export const CLASS_BY_MESH_NAME = new Map([
  ['ground', SURFACE_CLASS.GROUND],
  ['roads', SURFACE_CLASS.ROAD],
  ['curbs', SURFACE_CLASS.CURB],
  // CW-51: painted lines borrow the curb's voice rather than minting an id -
  // the span table is exactly full, and a curb is already the thin ribbon
  // that reads as dashes near and sub-samples away, which is what paint wants.
  ['road-lines', SURFACE_CLASS.CURB],
  // buildings splits into wall and roof by normal; see ROOF_SPLIT below.
  ['buildings', SURFACE_CLASS.BUILDING_WALL],
  ['storefronts', SURFACE_CLASS.STOREFRONT],
  ['sign-plates', SURFACE_CLASS.SIGN],
  ['sign-faces', SURFACE_CLASS.SIGN],
  ['antennas', SURFACE_CLASS.MAST],
  ['tree-trunks', SURFACE_CLASS.TREE],
  ['tree-canopies', SURFACE_CLASS.TREE],
  ['cars', SURFACE_CLASS.CAR],
  ['traffic-cars', SURFACE_CLASS.CAR],
  ['people', SURFACE_CLASS.PERSON],
  ['lamp-poles', SURFACE_CLASS.LAMP],
  ['lamp-heads', SURFACE_CLASS.LAMP],
  // CW-19: a signal is a post with lit heads, so it borrows both voices — the
  // post reads like a lamp post because it is one, and the heads read like
  // the other small bright things on the street.
  ['light-poles', SURFACE_CLASS.LAMP],
  ['light-heads', SURFACE_CLASS.SIGN],
  // CW-33: the ground you walk on, and the ground you walk past.
  ['sidewalks', SURFACE_CLASS.SIDEWALK],
  // CW-57 plantings, borrowed rather than minted - the span table is full.
  // A planter is a knee-high box on the kerb, which is what a bench is, so it
  // takes the same voice CW-43 gave the benches. Its FLOWERS are small and
  // bright, which is what a sign face is. A picnic table is a low frame with a
  // flat top, again a bench. A flowerbed is a patch of ground and takes the
  // ground it lies on.
  ['planters', SURFACE_CLASS.CAR],
  ['planter-flowers', SURFACE_CLASS.SIGN],
  ['picnic-tables', SURFACE_CLASS.CAR],
  ['flowerbeds', SURFACE_CLASS.GREEN],
  // CW-58: birds, PHOTOGRAPH-DECIDED against the three other candidates at one
  // pose, one goose, 30%. The span table is FULL at 16, so this is a borrow
  // and not a new id - CW-43's law.
  //
  // SIGN turned the bird into a solid slab: most mass, least shape. CAR banded
  // it horizontally so the body read as a block with a neck stuck on. LAMP and
  // PERSON both kept the head, neck and body separate; PERSON's striations run
  // with the bird's own form, and it is also what the vocabulary is FOR - a
  // small living thing standing on a surface, which is what CW-45 built it to
  // draw. For a bird the silhouette is the whole picture, so the voice that
  // preserves silhouette wins.
  ['birds', SURFACE_CLASS.PERSON],
  ['greens', SURFACE_CLASS.GREEN],
  // CW-43 street furniture: dressed in the EXISTING voices of the things
  // they physically resemble — the span table (_gpuVocabLists,
  // MAX_CLASS_SPANS = 16) is exactly full, and at the sizes this game is
  // played a hydrant is a few cells tall: a distinct vocabulary could not
  // show. Zero new ids; the choice is checked by photograph in the CW-43
  // record, and its reversal is the converter-shared span surgery.
  ['bus-stop-poles', SURFACE_CLASS.MAST],
  ['bus-stop-shelters', SURFACE_CLASS.BUILDING_WALL],
  ['benches', SURFACE_CLASS.CAR],
  ['waste-baskets', SURFACE_CLASS.CAR],
  ['bike-racks', SURFACE_CLASS.CAR],
  ['hydrants', SURFACE_CLASS.LAMP],
  // CW-64: a firework star. The span table is FULL at 16, so this is a borrow
  // and not a new id (CW-43's law), and it is a DELIBERATE one - CW-56's
  // builders guard cannot see this mesh at all, because it enumerates
  // buildStreetProps and a firework is built beside the rain.
  //
  // ★ AND LEAVING IT OUT IS NOT A SAFE DEFAULT HERE. An unmapped mesh reads as
  // SKY, which for something 200 m up sounds right and is in fact the reason
  // the first show photographed as EMPTY BLACK SKY with 28 bright stars in the
  // frustum: the sky's voice draws nothing, so the bursts rendered and the
  // converter dressed them as background.
  ['fireworks', SURFACE_CLASS.SIGN],
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
    // Object space is world space here: the city group is never rotated, the
    // merged meshes bake their own transforms in at build time, and nothing in
    // the scene is scaled — so the object normal already points where the face
    // points in the world, and no matrix belongs in this line. normalMatrix is
    // built from modelViewMatrix, so multiplying by it would ask which way the
    // face points relative to the CAMERA, and the roof test below would then
    // fire on whatever the walker happens to be looking straight at (D-73).
    vUp = normalize(normal).z;
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

  /**
   * D-110: the class material must carry the mesh's own POLYGON OFFSET.
   *
   * Several of this city's surfaces are deliberately coplanar with the one
   * behind them - a storefront strip on its wall, paint on its roadway, a
   * pavement on the ground - and each is pulled forward by a polygon offset
   * rather than by a gap, because a gap would show. Dressing a mesh in a
   * material that drops that offset makes it coplanar again HERE, in the id
   * buffer, where which surface wins is then decided by floating-point luck
   * per pixel and re-rolled by any view change.
   *
   * MEASURED before the fix, over a 20-frame 0.05 degree turn at the Seattle
   * spawn: 104,180 class transitions, 101,263 of them the storefront/wall
   * pair, with 18,131 cells of 67,158 changing class MORE THAN ONCE. The
   * class id chooses the cell's glyph vocabulary, so better than a quarter of
   * the frame was re-rolling its character set frame after frame - which is
   * the fractured flashing the owner reported.
   *
   * The offset is part of the cache key: two meshes of the same class with
   * different offsets are different materials, and only the combinations that
   * actually occur are ever built.
   */
  const materialFor = (id, roofId, offsetFactor, offsetUnits) => {
    const key = `${id}:${roofId}:${offsetFactor}:${offsetUnits}`;
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
        polygonOffset: offsetFactor !== 0 || offsetUnits !== 0,
        polygonOffsetFactor: offsetFactor,
        polygonOffsetUnits: offsetUnits,
      });
      materials.set(key, mat);
    }
    return mat;
  };

  /** The depth bias a mesh's own material is drawn with, or none. */
  const offsetOf = (material) => {
    const own = Array.isArray(material) ? material[0] : material;
    if (!own?.polygonOffset) return [0, 0];
    return [own.polygonOffsetFactor ?? 0, own.polygonOffsetUnits ?? 0];
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

  /** Render one class frame into the target. Shared by read() and texture(). */
  const renderClassFrame = (camera, cols, rows) => {
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
      const [factor, units] = offsetOf(obj.material);
      originals.set(obj, obj.material);
      obj.material = materialFor(
        id,
        ROOF_SPLIT.get(obj.name) ?? 0,
        factor,
        units
      );
    });

    const prevTarget = renderer.getRenderTarget();
    renderer.getClearColor(clearColor);
    const prevAlpha = renderer.getClearAlpha();
    renderer.setRenderTarget(target);
    // Everything the city does not cover is sky, which is class 0.
    renderer.setClearColor(0x000000, 1);
    renderer.clear();
    renderer.render(root, camera);
    return { prevTarget, prevAlpha };
  };

  const restoreAfterRender = ({ prevTarget, prevAlpha }) => {
    renderer.setRenderTarget(prevTarget);
    renderer.setClearColor(clearColor, prevAlpha);
    for (const [mesh, material] of originals) mesh.material = material;
    originals.clear();
  };

  return {
    /**
     * Render one class frame and return it as one byte per cell, row 0 at the
     * TOP to match the converter's own row order.
     *
     * @returns {Uint8Array|null} cols*rows class ids, or null if disposed
     */
    read(camera, cols, rows) {
      if (disposed || !(cols > 0) || !(rows > 0)) return null;
      const restore = renderClassFrame(camera, cols, rows);
      renderer.readRenderTargetPixels(target, 0, 0, cols, rows, pixels);
      restoreAfterRender(restore);

      // readRenderTargetPixels hands back rows bottom-up, which is upside
      // down against the converter's grid.
      for (let y = 0; y < rows; y++) {
        const src = (rows - 1 - y) * cols * 4;
        const dst = y * cols;
        for (let x = 0; x < cols; x++) classMap[dst + x] = pixels[src + x * 4];
      }
      return classMap;
    },

    /**
     * The same class frame, left on the GPU (CW-32).
     *
     * When the glyph pick runs in a shader there is no reason to bring these
     * bytes to the CPU at all: the shader samples this texture directly, and
     * the readback above — the second synchronous stall of every dirty frame
     * — simply does not happen. Rows are bottom-up here, as the GPU wrote
     * them; the shader indexes accordingly.
     *
     * @returns {import('three').Texture|null}
     */
    texture(camera, cols, rows) {
      if (disposed || !(cols > 0) || !(rows > 0)) return null;
      const restore = renderClassFrame(camera, cols, rows);
      restoreAfterRender(restore);
      return target.texture;
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
