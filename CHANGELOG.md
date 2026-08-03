# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.1] - 2026-08-03

### Added

- New objects created via **Create object** now include pre-defined coordinates.

### Fixed

- Preserved preview viewport position (scroll/zoom framing) across auto-refresh rerenders in edit mode, preventing the canvas from snapping back to the top-left after coordinate or style edits.
- Fixed edit-overlay pointer mapping so dragging points and edge insertion behave correctly with `preserveAspectRatio` and zoom/letterboxing.
- Fixed vertex-handle drag snapping by preserving pointer-to-vertex offset during drag, preventing points from jumping on click/drag start.

## [0.2.0] - 2026-08-02

### Added

- Added **Create image** command and preview-panel button.
- Added **Create view** command and preview-panel button.
- Added **Create object** command and preview-panel button.
- Added **Refresh preview** button to the preview panel.

### Changed

- Added configurable settings keys for view layer filters: `viewIncludeLayersProperty` and `viewExcludeLayersProperty`.
- Added configurable settings keys for object shape and child arrays: `objectShapeProperty` and `objectChildrenProperty`.

### Fixed

- Reduced preview/code-block metadata load cost by collecting object, view, and image definitions in a single pass and reusing the result within the preview panel.

## [0.1.2] - 2026-08-02

### Fixed

- Fixed release attestations.

## [0.1.1] - 2026-08-02

### Changed

- Metadata discovery now iterates Obsidian metadata cache paths instead of calling `vault.getMarkdownFiles()` directly.

### Fixed

- Removed duplicate height.

## [0.1.0] - 2026-08-01

### Added

- Initial **SketchMatter** release for rendering SVG images from Obsidian note metadata.
- Core object pipeline with type-tag discovery, configurable frontmatter keys, layering, and view/image filtering.
- Built-in shapes: **polygon**, **polyline**, **line**, **circle**, **rect**, **ellipse**, **text**, and **composite**.
- Visual effects: opacity, texture fills, clip-path masks, soft-edge blending, and deterministic point-noise support.
- **SketchMatter preview panel** with view/image selection, object status, export, grid, and edit mode.
- **Inline Markdown code block** rendering support.
- Configurable settings for identifiers, type definitions, rendering defaults, and refresh behavior.
- Demo vault, including a Logo demo and sample maps.
- Automated test coverage for metadata parsing, rendering, shapes, and noise helpers.

[Unreleased]: https://github.com/TylerCarrol/obsidian-sketch-matter/compare/v0.2.1...HEAD

[0.2.1]: https://github.com/TylerCarrol/obsidian-sketch-matter/compare/v0.2.0...v0.2.1

[0.2.0]: https://github.com/TylerCarrol/obsidian-sketch-matter/compare/v0.1.2...v0.2.0

[0.1.2]: https://github.com/TylerCarrol/obsidian-sketch-matter/compare/v0.1.1...v0.1.2

[0.1.1]: https://github.com/TylerCarrol/obsidian-sketch-matter/compare/v0.1.0...v0.1.1

[0.1.0]: https://github.com/TylerCarrol/obsidian-sketch-matter/releases/tag/v0.1.0
