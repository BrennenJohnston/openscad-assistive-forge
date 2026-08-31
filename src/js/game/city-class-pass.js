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

import {
  Color,
  DataTexture,
  NearestFilter,
  NoColorSpace,
  RedFormat,
  RepeatWrapping,
  ShaderMaterial,
  UnsignedByteType,
  WebGLRenderTarget,
} from 'three';

import {
  ANCHORED_CLASSES,
  buildField,
  FIELD_LEVELS,
} from './city-glyph-field.js';

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
  // CW-94: the ring-branch system's two kinds. TREE, exactly like the trunk
  // and the crown they replace - a branch and its leaf run are the tree's
  // own voice, not a new id (the span table stays full at 16).
  ['tree-branches', SURFACE_CLASS.TREE],
  ['tree-leaves', SURFACE_CLASS.TREE],
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
  // ★★ AND THE FIRST VERSION OF THIS COMMENT WAS WRONG, WHICH IS WHY IT SAYS
  // SO. It claimed an unmapped mesh "draws nothing" and blamed the sky's voice
  // for a show that photographed empty. `_hfm.js` settles it in one line -
  // `classMap ? (st.classLookups.get(classMap[idx]) ?? st.lookup) : st.lookup`
  // - so an unclassed cell falls through to the DEFAULT vocabulary and still
  // gets a glyph from its own luminance. A class decides WHICH glyph, never
  // WHETHER. The empty frames were a clock mismatch in the builder, and the
  // measurement that seemed to blame the class was an instrument drawing its
  // stars a fifth of the size it thought.
  //
  // What the mapping is actually for: without it a burst would wear the same
  // voice as the sky behind it. SIGN is small and bright, which is what a star
  // is, and that is a LOOK decision - the right one, but not a visibility one.
  ['fireworks', SURFACE_CLASS.SIGN],
  // CW-65: the blind traveler. Not a borrow so much as the right voice - PERSON
  // is literally the vocabulary CW-45 built to draw a small standing person,
  // and this is one. Zero new class ids, so CW-43's law is not even tested.
  //
  // ★ Like `fireworks`, this mesh is built STANDALONE and CW-56's builders
  // guard could not see it: that guard enumerates buildStreetProps. It asks the
  // standalone builders too now, so the next one cannot slip through.
  ['traveler', SURFACE_CLASS.PERSON],
  // CW-78: the node-keyed landmark bodies (the Great Wheel; the Needle's
  // saucer stack and flare). MAST, stated deliberately: these are open
  // steel structures read against the sky, which is what the mast voice
  // draws, and MAST is a non-anchored class - a rim and a spoke must not be
  // snapped to a facade's lattice. A borrow, not a new id (CW-43's law; the
  // span table is full at 16).
  ['landmark-masts', SURFACE_CLASS.MAST],
  // CW-78: the waypoint marks. SIGN - a small bright plate on a post is
  // exactly what the sign voice draws, and like the fireworks this is a
  // LOOK decision: the mark's readability comes from its bright ring around
  // an exact-black core, not from its vocabulary. Standalone builder, so
  // the builders guard must ask it by name.
  ['waypoints', SURFACE_CLASS.SIGN],
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

/**
 * CW-85: how far the B channel's 255 steps reach, in metres.
 *
 * The backing fades out at the fog's own far plane (`Fog(0x000000, 40, 260)`,
 * city-scene.js), so a byte that ran to a different distance would make the
 * tint and the fog disagree about where the world ends. One step is 260/255 =
 * 1.02 m, which is finer than the fade needs and far finer than a 3x6 px cell
 * can show.
 */
export const CLASS_DEPTH_FAR_M = 260;

/**
 * CW-86: the longest side a glyph field may have, in lattice squares.
 *
 * ★ THE FIELD IS COARSE ON PURPOSE. At the source texture's own resolution
 * a facade texel is about 8 mm of wall, so a cell 40 m away covers hundreds
 * of them and the smallest camera move slides it onto a different one - the
 * glyph would re-roll exactly as it does today and the release would have
 * built nothing. What makes a character belong to a wall is that a patch of
 * wall about the size of a cell shares ONE value. 64 puts a 512x576 facade
 * on a 64x72 lattice, roughly 6 cm of wall per square. It is the first
 * number P2 is allowed to move, and only on the table.
 */
export const FIELD_MAX_SIZE = 64;

const VERTEX_SHADER = /* glsl */ `
  varying float vUp;
  varying float vViewDepth;
  // CW-86: the surface's own coordinate. Every mesh this pass dresses that
  // has a glyph field also has a uv attribute - it was checked before the
  // field was built - and three.js declares the uv attribute for us either way, so a
  // mesh without one simply carries zeroes into a shader that ignores them.
  varying vec2 vUv;
  void main() {
    // Object space is world space here: the city group is never rotated, the
    // merged meshes bake their own transforms in at build time, and nothing in
    // the scene is scaled — so the object normal already points where the face
    // points in the world, and no matrix belongs in this line. normalMatrix is
    // built from modelViewMatrix, so multiplying by it would ask which way the
    // face points relative to the CAMERA, and the roof test below would then
    // fire on whatever the walker happens to be looking straight at (D-73).
    vUp = normalize(normal).z;
    vUv = uv;
    vec4 viewPos = modelViewMatrix * vec4(position, 1.0);
    // CW-85: LINEAR view depth, in metres, interpolated across the face. The
    // depth BUFFER this target already carries is the non-linear one the GPU
    // needs for occlusion; a tint that faded on that curve would fall off a
    // cliff in the first few metres and then barely move for two hundred.
    vViewDepth = -viewPos.z;
    gl_Position = projectionMatrix * viewPos;
  }
`;

const FRAGMENT_SHADER = /* glsl */ `
  uniform float uId;
  uniform float uRoofId;
  uniform float uRoofNormalZ;
  uniform float uDepthFar;
  // CW-86: the glyph field. uHasField is 0 for every mesh without one,
  // which is what makes this one shader rather than two.
  uniform float uHasField;
  uniform sampler2D uField;
  uniform vec2 uFieldRepeat;
  uniform vec2 uFieldOffset;
  varying float vUp;
  varying float vViewDepth;
  varying vec2 vUv;
  void main() {
    float id = uId;
    // uRoofId is 0 for every mesh that has no separate top surface, and 0 is
    // the sky class, which no geometry can be.
    if (uRoofId > 0.0 && vUp >= uRoofNormalZ) id = uRoofId;
    // CW-86: G is the GLYPH FIELD - the surface's own tone at this cell,
    // quantised to a ladder step and stored as step + 1 so that 0 keeps
    // meaning "no field, use the screen pick". The field texture is one this
    // pass built and owns: NEAREST, no mipmaps, so the value a cell reads is
    // a property of the WALL and not of how far away the camera happens to
    // be. Sampling the mesh's own map here instead would have read a mipmap
    // chosen from this pass's own derivatives - and this pass runs at one
    // pixel per CELL, so that is a very coarse level and the anchoring would
    // have dissolved at exactly the distances it is needed.
    float field = 0.0;
    if (uHasField > 0.5) {
      field = texture2D(uField, vUv * uFieldRepeat + uFieldOffset).r;
    }
    // R is the class, as it has been since CW-23 and as the GPU glyph path
    // reads it. B is CW-85's linear depth: nothing samples it but the backing.
    gl_FragColor = vec4(
      id / 255.0,
      field,
      clamp(vViewDepth / uDepthFar, 0.0, 1.0),
      1.0
    );
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
  let depthMap = null;
  let fieldMap = null;
  let disposed = false;
  // CW-86: source texture uuid -> the field texture built from it, or null
  // if that texture cannot serve one. Cached because building a field reads
  // every pixel of a canvas, which is a one-time cost per texture and would
  // be an unthinkable one per frame.
  const fields = new Map();
  let fieldEnabled = false;
  // CW-86 P2: the lattice a field is reduced to, tunable so the sweep that
  // chooses it is a measurement rather than an opinion.
  let fieldMaxSize = FIELD_MAX_SIZE;
  // CW-86 P2: which classes get a field at all. null means "every class that
  // has a readable texture", which is where the prototype starts; the sweep
  // narrows it if the table says a class is better off with the screen pick.
  let fieldClasses = new Set(ANCHORED_CLASSES);

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
  /**
   * The field texture for a mesh's own map, built once and kept.
   *
   * ★ IT IS OUR TEXTURE, NOT THEIRS, AND THAT IS THE POINT. The city's own
   * CanvasTextures are mipmapped and linearly filtered because that is what
   * makes the 3D picture look right, and they are SHARED with the visible
   * render - changing a filter here would change the game. So the field is a
   * separate DataTexture: NEAREST, no mipmaps, one byte per lattice square.
   * A cell then reads a property of the wall rather than a blend chosen from
   * this pass's own derivatives, which at one pixel per cell would have been
   * a very coarse mip and would have dissolved the anchoring at exactly the
   * distances that need it.
   *
   * @param {import('three').Texture|null} map
   * @returns {import('three').DataTexture|null}
   */
  const fieldFor = (map) => {
    if (!map || !map.image) return null;
    const key = map.uuid;
    if (fields.has(key)) return fields.get(key);
    let built = null;
    try {
      const img = map.image;
      const w = img.width | 0;
      const h = img.height | 0;
      // A canvas can be read directly; anything else has to be drawn onto
      // one first, and a texture whose pixels cannot be reached at all
      // simply has no field - the cells over it keep the screen pick.
      let ctx = null;
      if (typeof img.getContext === 'function') {
        ctx = img.getContext('2d', { willReadFrequently: true });
      }
      if (ctx && w > 0 && h > 0) {
        const data = ctx.getImageData(0, 0, w, h).data;
        const field = buildField(data, w, h, fieldMaxSize, FIELD_LEVELS);
        // The byte the shader hands on is LEVEL + 1: zero has to stay free
        // for "no field here", which is what the sky and every unclassified
        // mesh write.
        const bytes = new Uint8Array(field.levels.length);
        for (let i = 0; i < bytes.length; i++) bytes[i] = field.levels[i] + 1;
        built = new DataTexture(
          bytes,
          field.w,
          field.h,
          RedFormat,
          UnsignedByteType
        );
        built.magFilter = NearestFilter;
        built.minFilter = NearestFilter;
        built.generateMipmaps = false;
        built.wrapS = RepeatWrapping;
        built.wrapT = RepeatWrapping;
        // The source canvas is drawn with y down and sampled flipped; the
        // field is read with the same uv, so it has to be flipped the same
        // way or every facade's field would be upside down against its own
        // windows. DataTexture defaults to flipY false, so this is not a
        // line that can be left out.
        built.flipY = map.flipY;
        built.needsUpdate = true;
      }
    } catch {
      // A tainted or unreadable canvas is a field this pass does not get to
      // have. It is not an error: the cells over that surface keep the
      // screen pick, which is what every surface did before CW-86.
      built = null;
    }
    fields.set(key, built);
    return built;
  };
  const materialFor = (id, roofId, offsetFactor, offsetUnits, field, map) => {
    // CW-86: the field is part of the identity of the material, because two
    // walls with different facade canvases need different samplers. Ten
    // building meshes each carry their own CanvasTexture, so this is ten
    // materials rather than one - which is exactly what the cache is for.
    const fieldKey = field ? field.uuid : '-';
    const key = `${id}:${roofId}:${offsetFactor}:${offsetUnits}:${fieldKey}`;
    let mat = materials.get(key);
    if (!mat) {
      mat = new ShaderMaterial({
        uniforms: {
          uId: { value: id },
          uRoofId: { value: roofId },
          uRoofNormalZ: { value: ROOF_NORMAL_Z },
          uDepthFar: { value: CLASS_DEPTH_FAR_M },
          uHasField: { value: field ? 1 : 0 },
          uField: { value: field },
          // The visible material's own repeat and offset, because the field
          // is sampled with the SAME uv the city is textured with - a facade
          // canvas is tiled per bay, and a field that ignored that would put
          // one window's tone across a whole tower.
          uFieldRepeat: {
            value: map ? map.repeat.clone() : { x: 1, y: 1 },
          },
          uFieldOffset: {
            value: map ? map.offset.clone() : { x: 0, y: 0 },
          },
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
    // CW-85: the readback has always moved four bytes per cell and used one.
    // The depth map costs the same transfer and one more pass over a buffer
    // that is already in cache. CW-86 takes the third byte the same way, so
    // all four are now spoken for and the readback still costs what it did.
    depthMap = new Uint8Array(cols * rows);
    fieldMap = new Uint8Array(cols * rows);
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
      // CW-86: a mesh earns a field only if it has BOTH a readable map and a
      // uv to read it with. Asked at this HEAD, `roads`, `curbs` and
      // `road-lines` have neither, so they keep the screen pick - and they
      // are the classes §1.3 measured as already steady, which is why the
      // set is worth having anyway.
      let field = null;
      let map = null;
      if (
        fieldEnabled &&
        obj.geometry?.attributes?.uv &&
        (!fieldClasses || fieldClasses.has(id))
      ) {
        const own = Array.isArray(obj.material)
          ? obj.material[0]
          : obj.material;
        map = own?.map ?? null;
        field = fieldFor(map);
      }
      obj.material = materialFor(
        id,
        ROOF_SPLIT.get(obj.name) ?? 0,
        factor,
        units,
        field,
        field ? map : null
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
        for (let x = 0; x < cols; x++) {
          classMap[dst + x] = pixels[src + x * 4];
          fieldMap[dst + x] = pixels[src + x * 4 + 1];
          depthMap[dst + x] = pixels[src + x * 4 + 2];
        }
      }
      return classMap;
    },

    /**
     * The linear view depth of the LAST `read()`, one byte per cell, in the
     * same row order as the class map (CW-85).
     *
     * It is a separate accessor rather than a second return value because
     * `read()`'s contract is the classMap and every caller since CW-23 uses
     * it that way; the backing is the only thing that wants this, and only
     * while Day is on.
     *
     * Byte b is `b / 255 * CLASS_DEPTH_FAR_M` metres. A cell the city does
     * not cover reads 0, which is the sky - and the sky is never backed, so
     * the ambiguity between "zero metres away" and "nothing there" never has
     * to be resolved.
     *
     * @returns {Uint8Array|null} the last read's depth bytes, or null
     */
    lastDepth() {
      return disposed ? null : depthMap;
    },

    /**
     * The GLYPH FIELD of the last `read()`, one byte per cell (CW-86).
     *
     * Byte 0 means "this cell has no field" - the sky, an unclassified mesh,
     * or a surface with no readable texture - and the converter keeps its
     * screen pick there. Any other byte is `ladder step + 1`.
     *
     * @returns {Uint8Array|null}
     */
    lastField() {
      return disposed ? null : fieldMap;
    },

    /**
     * Turn the glyph field on or off (CW-86).
     *
     * Off by default and off costs nothing: no field texture is built, the
     * materials carry uHasField 0, and the shader's branch is not taken. The
     * material cache is cleared because the field is part of a material's
     * identity, so the same mesh needs a different one on each side of this.
     *
     * @param {boolean} on
     */
    setGlyphField(on) {
      const next = Boolean(on);
      if (next === fieldEnabled) return;
      fieldEnabled = next;
      for (const mat of materials.values()) mat.dispose();
      materials.clear();
    },

    /** @returns {boolean} whether the field is being rendered */
    glyphFieldEnabled() {
      return fieldEnabled;
    },

    /**
     * CW-86 P2: how coarse the field lattice is, in squares along its longest
     * side. Smaller is COARSER: a bigger patch of surface shares one value, so
     * a cell keeps reading the same value further into a walk.
     *
     * Every built field is thrown away, because they were all built at the old
     * size - a cache that kept them would make the next measurement a mixture
     * of two settings and read as noise.
     *
     * @param {number} n
     * @returns {number} the size now in force
     */
    setFieldMaxSize(n) {
      const next = Math.max(1, Math.round(Number(n) || 0));
      if (next === fieldMaxSize) return fieldMaxSize;
      fieldMaxSize = next;
      for (const f of fields.values()) f?.dispose();
      fields.clear();
      for (const mat of materials.values()) mat.dispose();
      materials.clear();
      return fieldMaxSize;
    },

    /**
     * CW-86 P2: restrict the field to these class ids, or null for all.
     *
     * @param {number[]|null} ids
     */
    setFieldClasses(ids) {
      fieldClasses = Array.isArray(ids) ? new Set(ids) : null;
      for (const mat of materials.values()) mat.dispose();
      materials.clear();
    },

    /** @returns {number} the field lattice size in force */
    fieldMaxSize() {
      return fieldMaxSize;
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
      depthMap = null;
      fieldMap = null;
      for (const f of fields.values()) f?.dispose();
      fields.clear();
    },
  };
}
