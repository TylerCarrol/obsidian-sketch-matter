import {
	CanvasTexture,
	Mesh,
	MeshBasicMaterial,
	PerspectiveCamera,
	Scene,
	SphereGeometry,
	SRGBColorSpace,
	WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import type {
	LayerRenderOrder,
	MapProjection,
	SketchMatterImageDefinition,
	SketchMatterObject,
	SketchMatterSettings,
	SketchMatterTypeDefinition,
} from '../types';
import { renderSvgToString } from '../renderer';
import { createGlobeTextureCanvas } from './texture';

export interface GlobePreviewHandle {
	readonly ready: Promise<void>;
	dispose(): void;
}

export interface GlobePreviewOptions {
	container: HTMLElement;
	objects: SketchMatterObject[];
	typeDefinitions: Map<string, SketchMatterTypeDefinition>;
	renderOrder: LayerRenderOrder;
	settings: SketchMatterSettings;
	imageDefinition: SketchMatterImageDefinition | null;
	projection: MapProjection;
	onError?: (error: Error) => void;
}

class ThreeGlobePreview implements GlobePreviewHandle {
	readonly ready: Promise<void>;
	private readonly abortController = new AbortController();
	private readonly options: GlobePreviewOptions;
	private renderer: WebGLRenderer | null = null;
	private controls: OrbitControls | null = null;
	private geometry: SphereGeometry | null = null;
	private material: MeshBasicMaterial | null = null;
	private texture: CanvasTexture | null = null;
	private resizeObserver: ResizeObserver | null = null;
	private animationFrame: number | null = null;
	private disposed = false;

	constructor(options: GlobePreviewOptions) {
		this.options = options;
		this.ready = this.initialize().catch((error: unknown) => {
			if (!this.disposed && !(error instanceof DOMException && error.name === 'AbortError')) {
				this.options.onError?.(error instanceof Error ? error : new Error(String(error)));
				this.dispose();
			}
		});
	}

	dispose(): void {
		if (this.disposed) {
			return;
		}
		this.disposed = true;
		this.abortController.abort();
		if (this.animationFrame != null) {
			window.cancelAnimationFrame(this.animationFrame);
			this.animationFrame = null;
		}
		this.resizeObserver?.disconnect();
		this.controls?.dispose();
		this.texture?.dispose();
		this.material?.dispose();
		this.geometry?.dispose();
		if (this.renderer) {
			this.renderer.dispose();
			this.renderer.forceContextLoss();
			this.renderer.domElement.remove();
		}
		this.resizeObserver = null;
		this.controls = null;
		this.texture = null;
		this.material = null;
		this.geometry = null;
		this.renderer = null;
	}

	private async initialize(): Promise<void> {
		const {
			container,
			objects,
			typeDefinitions,
			renderOrder,
			settings,
			imageDefinition,
			projection,
		} = this.options;
		const sourceWidth = imageDefinition?.width ?? 1200;
		const sourceHeight = imageDefinition?.height ?? 900;
		const svgContent = renderSvgToString(
			objects,
			typeDefinitions,
			renderOrder,
			settings,
			imageDefinition,
		);
		const textureCanvas = await createGlobeTextureCanvas(
			svgContent,
			sourceWidth,
			sourceHeight,
			projection,
			this.abortController.signal,
		);
		if (this.disposed) {
			return;
		}

		const scene = new Scene();
		const camera = new PerspectiveCamera(42, 1, 0.1, 100);
		camera.position.set(0, 0, 2.8);

		this.renderer = new WebGLRenderer({ antialias: true, alpha: true });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
		this.renderer.domElement.classList.add('sketchmatter-globe-canvas');
		this.renderer.domElement.tabIndex = 0;
		this.renderer.domElement.setAttribute('aria-label', 'Interactive globe preview');

		this.texture = new CanvasTexture(textureCanvas);
		this.texture.colorSpace = SRGBColorSpace;
		this.texture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
		this.material = new MeshBasicMaterial({ map: this.texture });
		this.geometry = new SphereGeometry(1, 96, 64);
		const globe = new Mesh(this.geometry, this.material);
		globe.rotation.y = -Math.PI / 2;
		scene.add(globe);

		container.replaceChildren();
		container.appendChild(this.renderer.domElement);
		this.controls = new OrbitControls(camera, this.renderer.domElement);
		this.controls.enablePan = false;
		this.controls.enableDamping = false;
		this.controls.minDistance = 1.35;
		this.controls.maxDistance = 6;
		this.controls.addEventListener('change', () => this.scheduleRender(scene, camera));

		const resize = (): void => {
			if (!this.renderer || this.disposed) {
				return;
			}
			const bounds = container.getBoundingClientRect();
			const width = Math.max(1, Math.round(bounds.width || 640));
			const height = Math.max(1, Math.round(bounds.height || 400));
			camera.aspect = width / height;
			camera.updateProjectionMatrix();
			this.renderer.setSize(width, height, false);
			this.scheduleRender(scene, camera);
		};
		this.resizeObserver = new ResizeObserver(resize);
		this.resizeObserver.observe(container);
		resize();
	}

	private scheduleRender(scene: Scene, camera: PerspectiveCamera): void {
		if (this.disposed || !this.renderer || this.animationFrame != null) {
			return;
		}
		this.animationFrame = window.requestAnimationFrame(() => {
			this.animationFrame = null;
			this.renderer?.render(scene, camera);
		});
	}
}

export function renderGlobePreview(options: GlobePreviewOptions): GlobePreviewHandle {
	return new ThreeGlobePreview(options);
}