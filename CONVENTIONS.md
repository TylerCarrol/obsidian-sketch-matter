# Conventions

This file describes the design conventions, architectural rules, and agent guidance specific to this repository. Read it alongside `AGENTS.md` before making any change.

---

## Core design philosophy

### Everything is configurable

**No frontmatter key, tag prefix, or property name should be hard-coded in plugin logic.** Every string that appears in a note's frontmatter or tags must be read through a `SketchMatterSettings` field. The default values live in `DEFAULT_SETTINGS` (`src/types.ts`) and the user can override every one of them in the plugin settings UI (`src/settings.ts`).

Consequence for new features: if you introduce a new frontmatter property (e.g. `sketchmatter-newprop`), you must:

1. Add a field for its key name to `SketchMatterSettings` in `src/types.ts`.
2. Provide a sensible default value in `DEFAULT_SETTINGS`.
3. Read the value via `object.properties[settings.newPropProperty]` (never the raw string `'sketchmatter-newprop'`).
4. Expose the key in the settings tab (`src/settings.ts`) so users can rename it.

### Keep it dynamic

The plugin deliberately avoids fixed type vocabularies. Object types are derived from the tag suffix after `settings.typeTagPrefix` at runtime. Any note tagged `sketchmatter-type/whatever` automatically becomes an object of type `whatever`. Do not introduce hard-coded type names (like `"continent"` or `"river"`) anywhere in rendering or metadata logic; those names appear only as default values in `DEFAULT_SETTINGS.typeDefinitions`.

---

## Architecture overview

```
src/
  main.ts        Plugin lifecycle only (onload, onunload, registerEvent, addCommand)
  types.ts       All TypeScript interfaces + SketchMatterSettings + DEFAULT_SETTINGS
  settings.ts    PluginSettingTab — one Setting per SketchMatterSettings field
  metadata.ts    Vault scanning: collect objects, views, images; no rendering
  renderer.ts    Pure SVG construction from SketchMatterObject arrays; no vault access
  codeblock.ts   Registers the `sketchmatter` Markdown code block processor
  view.ts        SketchMatterView side panel (ItemView subclass)
  shapes/
    base.ts      SvgShape abstract class, ShapeRenderContext, helpers
    registry.ts  Shape registry (registerShape / getShape)
    index.ts     Re-exports + registers all built-in shapes (import side-effects)
    polygon.ts   PolygonShape
    polyline.ts  PolylineShape
    line.ts      LineShape
    circle.ts    CircleShape
    rect.ts      RectShape
    ellipse.ts   EllipseShape
    text.ts      TextShape
    composite.ts CompositeShape
    noise.ts     Procedural point-noise helper (applyPointNoise)
```

**`main.ts` must stay minimal.** All feature logic lives in dedicated modules.

---

## The rendering pipeline

1. **Metadata collection** (`metadata.ts`)  
   `collectSketchMatterObjects` scans every Markdown file. A file becomes an object only if it has a tag matching `settings.typeTagPrefix`. All frontmatter is stored verbatim in `SketchMatterObject.properties` so every downstream consumer can read arbitrary keys through settings.

2. **Filtering** (`metadata.ts`)  
   `filterSketchMatterObjects` applies view-definition layer and image-ID filters.  
   `filterByImageId` applies an explicit image ID filter.

3. **Rendering** (`renderer.ts`)  
   `renderSvgPreview` / `renderSvgToString` → `renderToSvg` → `renderObject` per object.  
   Each object is resolved to a `shapeName` (from the type definition hierarchy or inferred from coordinate structure), then the registered `SvgShape` renders it.  
   Post-render, `applyPostRenderAttributes` attaches `clip-path` (mask) and `fill` (texture pattern) references.

---

## SVG element IDs — uniqueness is critical

Obsidian renders multiple SVGs into the same HTML document simultaneously (the SketchMatterView side panel, plus any `sketchmatter` code blocks in open notes). SVG `url(#id)` references resolve **document-wide** in Chromium, not just within the containing SVG.

**Rule: every `<clipPath>`, `<pattern>`, or other `<defs>` element must receive a document-unique ID.** The module-level `svgIdCounter` in `renderer.ts` provides this. Any future `<defs>` element must use `nextSvgId('prefix')` — never a per-render counter or a static string.

---

## Shape system

### Adding a new shape

1. Create `src/shapes/my-shape.ts` extending `SvgShape`.  
2. Implement `readonly name = 'my-shape'` and `createElements(context)`.  
3. Import and call `registerShape(new MyShape())` in `src/shapes/index.ts`.  
4. Export the class from `src/shapes/index.ts`.

### Shape style resolution

Style values are resolved in this priority order (highest first):

1. Object-level frontmatter property (e.g. `sketchmatter-fill: '#ff0000'`)
2. Type definition `style` object
3. Hard-coded fallback in `resolveStyle`

Shapes that need special styling (e.g. polylines default to no fill) should override `applyStyle`, not `resolveStyle`.

### Noise / procedural geometry

`applyPointNoise` in `shapes/noise.ts` handles deterministic edge displacement. It reads three properties via `settings` fields:

- `noiseSeedProperty` — string seed for the PRNG
- `noiseMagnitudeProperty` — numeric amplitude (≤ 0 disables noise)
- `noiseAmountProperty` — numeric roughness multiplier

These are opt-in: a shape calls `applyPointNoise(points, context, closed)` and gets back original points if no magnitude is set.

---

## Mask (clip-path) system

An object activates clipping by setting its `settings.maskProperty` frontmatter key to one or more selectors (comma- or newline-separated). Selectors can be:

- `type:<typename>` — all objects of that type
- `file:<path-or-basename>` — a specific file
- A bare string — matched against type name, source path, or basename

The clip-path geometry is built from the matching objects' own shapes. If multiple objects share the same selector set **and** the same source paths, the clip-path is deduped via `maskIdByKey` within a single render pass. Deduplication is per-render only; across renders, uniqueness is guaranteed by the module-level counter.

---

## Configurable property keys — full reference

The table below maps every `SketchMatterSettings` field to its default value. When writing code that reads from a note's frontmatter, always go through the settings field; never use the default string literal directly.

| Settings field | Default value | Purpose |
|---|---|---|
| `typeTagPrefix` | `sketchmatter-type` | Tag prefix identifying object notes |
| `viewDefinitionTagPrefix` | `sketchmatter-view` | Tag prefix for view definition notes |
| `viewNameProperty` | `sketchmatter-view-name` | Frontmatter key for view display name |
| `viewImageIdsProperty` | `sketchmatter-image-ids` | Frontmatter key for view image ID filters |
| `viewIncludeLayersProperty` | `sketchmatter-include-layers` | Frontmatter key for view layer include ranges |
| `viewExcludeLayersProperty` | `sketchmatter-exclude-layers` | Frontmatter key for view layer exclude ranges |
| `imageDefinitionTagPrefix` | `sketchmatter-image` | Tag prefix for image definition notes |
| `layerProperty` | `sketchmatter-layer` | Frontmatter key for layer number |
| `objectShapeProperty` | `sketchmatter-shape` | Frontmatter key for object-level shape override |
| `objectChildrenProperty` | `sketchmatter-children` | Frontmatter key for object-level child shape arrays |
| `layerRenderOrder` | `0-1` | Whether lower or higher layers render first |
| `coordinatesProperty` | `sketchmatter-coordinates` | Frontmatter key for coordinate data |
| `labelCoordinatesProperty` | `sketchmatter-label-coordinates` | Frontmatter key for label-specific coordinate data |
| `labelTextProperty` | `sketchmatter-label-text` | Frontmatter key for label text content |
| `fontFamilyProperty` | `sketchmatter-font-family` | Frontmatter key for label font family |
| `fontSizeProperty` | `sketchmatter-font-size` | Frontmatter key for label font size |
| `fontStyleProperty` | `sketchmatter-font-style` | Frontmatter key for label font-style list |
| `fontColorProperty` | `sketchmatter-font-color` | Frontmatter key for label font color |
| `imageIdProperty` | `sketchmatter-image-id` | Frontmatter key for image ID assignment |
| `imageWidthProperty` | `sketchmatter-width` | Frontmatter key for SVG canvas width |
| `imageHeightProperty` | `sketchmatter-height` | Frontmatter key for SVG canvas height |
| `imageBackgroundColorProperty` | `sketchmatter-background-color` | Frontmatter key for canvas background color |
| `imageBackgroundImageProperty` | `sketchmatter-background-image` | Frontmatter key for canvas background image |
| `imagePreserveAspectRatioProperty` | `sketchmatter-preserve-aspect-ratio` | Frontmatter key for SVG `preserveAspectRatio` |
| `transparencyProperty` | `sketchmatter-opacity` | Frontmatter key for object opacity |
| `fillProperty` | `sketchmatter-fill` | Frontmatter key for object fill value |
| `strokeProperty` | `sketchmatter-stroke` | Frontmatter key for object stroke value |
| `strokeWidthProperty` | `sketchmatter-stroke-width` | Frontmatter key for object stroke width |
| `textureProperty` | `sketchmatter-texture` | Frontmatter key for fill texture image source |
| `maskProperty` | `sketchmatter-mask` | Frontmatter key for clip-path selectors |
| `noiseSeedProperty` | `sketchmatter-seed` | Frontmatter key for procedural noise seed |
| `noiseMagnitudeProperty` | `sketchmatter-magnitude` | Frontmatter key for noise amplitude |
| `noiseAmountProperty` | `sketchmatter-noise` | Frontmatter key for noise roughness |
| `blendProperty` | `sketchmatter-blend` | Frontmatter key for soft-edge blend toggle |
| `blendRadiusProperty` | `sketchmatter-blend-radius` | Frontmatter key for blend feather radius (SVG units, default 20) |
| `overlapPatternProperty` | `sketchmatter-overlap-pattern` | Frontmatter key for overlap-only pattern type (`lines`, `hatch`, `crosshatch`, `dots`) |
| `overlapPatternThicknessProperty` | `sketchmatter-overlap-thickness` | Frontmatter key for overlap pattern stroke thickness |
| `overlapPatternSpacingProperty` | `sketchmatter-overlap-spacing` | Frontmatter key for overlap pattern spacing |
| `overlapPatternAngleProperty` | `sketchmatter-overlap-angle` | Frontmatter key for overlap line-angle in degrees |
| `overlapPatternColorProperty` | `sketchmatter-overlap-color` | Frontmatter key for overlap pattern color |
| `defaultLayer` | `1000` | Fallback layer when no layer property is set |
| `autoRefresh` | `true` | Auto-refresh panel on metadata change |

---

## Test vault conventions

The `demo-vault/` directory is a ready-to-use Obsidian vault. When adding new plugin features:

- Add representative sample notes to `demo-vault/` demonstrating the feature.
- Keep sample notes small and clearly named (e.g. `biome-highland.md`, `river-azul.md`).
- Update `demo-vault/README.md` if new files require explanation.
- Do **not** commit `demo-vault/.obsidian/plugins/` build artifacts — those are regenerated by `scripts/build-to-demo-vault.ps1`.

To build and install into the test vault (Windows/PowerShell):

```powershell
.\scripts\build-to-demo-vault.ps1
```

---

## Linting and building

```bash
npm install       # first time only
npm run build     # production build (tsc type-check + esbuild bundle)
npm run dev       # watch mode
npm run lint      # ESLint with obsidianmd plugin rules
```

The CI pipeline runs `npm run lint` on every push. Fix all ESLint **errors** before merging. Warnings may be left if they pre-existed the change; do not introduce new warnings.

---

## Agent guidance

- **Read this file and `AGENTS.md` before writing any code.**
- **Never hard-code frontmatter key names** (`'sketchmatter-layer'`, etc.) in `metadata.ts`, `renderer.ts`, or shape files. Read them through `settings.*Property`.
- **Never hard-code type names** (`'continent'`, `'river'`, etc.) in rendering logic. They are user-defined.
- **Use `nextSvgId(prefix)`** for any new `<defs>` element ID in `renderer.ts`. Do not introduce a new counter variable.
- **Keep `main.ts` lifecycle-only.** If you need a new feature, create a new module file and call it from the appropriate registration point.
- **Adding a shape?** Follow the pattern in `src/shapes/polygon.ts`, register it in `src/shapes/index.ts`, and add a sample note to `demo-vault/`.
- **Adding a new frontmatter property?** Follow the full 4-step checklist under "Everything is configurable" above.
- **Validate with `npm run build` and `npm run lint`** after every change. Do not submit code that fails the build.
