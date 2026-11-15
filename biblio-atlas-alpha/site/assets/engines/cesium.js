import {
  MapEngine,
  loadScript,
  rangeAt,
  scaleAt,
  zoomAt,
  rad,
  clamp,
  density,
  sprite,
  terrain,
} from "./common.js";
export class CesiumEngine extends MapEngine {
  async initialize(s) {
    await loadScript("vendor/Cesium/Cesium.js", "Cesium");
    if (this.dead) return;
    const C = window.Cesium;
    this.C = C;
    this.v = new C.Viewer(this.host, {
      useBrowserRecommendedResolution: false,
      baseLayer: false,
      baseLayerPicker: false,
      geocoder: false,
      timeline: false,
      animation: false,
      scene3DOnly: false,
      shouldAnimate: false,
      homeButton: false,
      navigationHelpButton: false,
      sceneModePicker: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      requestRenderMode: true,
      maximumRenderTimeChange: Infinity,
    });
    this.v.scene.globe.baseColor = C.Color.fromCssColorString("#31565b");
    this.v.scene.globe.depthTestAgainstTerrain = true;
    const scene = this.v.scene;
    this.pins = new Map();
    this.visiblePins = [];
    this.scaledEye = new C.Cartesian3();
    scene.preRender.addEventListener(() => this.updateHorizon());
    this.billboards = scene.primitives.add(
      new C.BillboardCollection({
        scene,
        threePointDepthTestDistance: 100000,
      }),
    );
    this.pendingTiles = 0;
    scene.globe.tileLoadProgressEvent.addEventListener((count) => {
      this.pendingTiles = count;
    });
    this.canvas = this.v.canvas;
    this.v.camera.percentageChanged = 0.05;
    this.v.scene.postRender.addEventListener(() => {
      this.frame();
      this.lastFrameTime = performance.now();
      this.events.cameraChanged?.();
    });
    this.v.screenSpaceEventHandler.setInputAction((e) => {
      const item = this.v.scene.pick(e.position, 17, 17)?.id?.atlasItem;
      if (item) this.events.pick(item);
    }, C.ScreenSpaceEventType.LEFT_CLICK);
    this.setQuality(s.quality);
    this.setImagery(s.image);
    this.setCamera(s.camera);
  }
  get tilesReady() {
    return this.v.scene.globe.tilesLoaded;
  }
  setQuality(q) {
    const compactDevice =
      navigator.hardwareConcurrency <= 4 || navigator.deviceMemory <= 4;
    const pixelRatio =
      q === "auto" && compactDevice ? Math.min(2, density(q)) : density(q);
    this.v.resolutionScale = pixelRatio / (devicePixelRatio || 1);
    this.v.scene.globe.maximumScreenSpaceError =
      q === "high" ? 1 : q === "perf" ? 4 : 2;
    this.v.scene.msaaSamples = q === "perf" ? 1 : 4;
    this.resize();
  }
  setImagery(p) {
    const C = this.C,
      l = this.v.imageryLayers;
    l.removeAll();
    const provider = new C.UrlTemplateImageryProvider({
      url: p.url,
      maximumLevel: p.max,
      credit: new C.Credit(p.credit),
    });
    provider.errorEvent.addEventListener(() =>
      this.events.tileError("imagerie"),
    );
    l.addImageryProvider(provider);
    this.v.scene.requestRender();
  }
  async setTerrain(id) {
    const C = this.C;
    const token = (this.terrainToken = Symbol());
    let p;
    if (id === "none") p = new C.EllipsoidTerrainProvider();
    else if (id === "ion") {
      const res = await C.IonResource.fromAssetId(1, {
        accessToken: window.ATLAS_SETTINGS.cesiumIonToken,
      });
      p = await C.CesiumTerrainProvider.fromUrl(res, {
        requestVertexNormals: true,
      });
    } else
      p = await C.CesiumTerrainProvider.fromUrl(terrain[id].mesh, {
        requestVertexNormals: true,
      });
    if (this.dead || this.terrainToken !== token) return;
    p.errorEvent.addEventListener(() => this.events.tileError("relief"));
    this.v.terrainProvider = p;
    this.v.scene.requestRender();
  }
  get mode() {
    const mode = this.v.scene.mode;
    return mode === this.C.SceneMode.SCENE3D
      ? "3D"
      : mode === this.C.SceneMode.SCENE2D
        ? "2D"
        : "Transition";
  }
  async setMode(mode) {
    if (this.transition) await this.transition;
    if (this.dead || this.mode === mode) return;
    const scene = this.v.scene;
    const state = this.getCameraState();
    if (mode === "2D")
      this.savedOrientation = { pitch: state.pitch, bearing: state.bearing };
    this.transition = new Promise((resolve) => {
      this.endTransition = resolve;
    });
    const done = scene.morphComplete.addEventListener(() => {
      done();
      this.lastEye = null;
      this.setCamera(
        this.afterMorph ?? {
          ...state,
          ...(mode === "3D" ? this.savedOrientation : { pitch: 0, bearing: 0 }),
        },
      );
      this.afterMorph = null;
      this.endTransition();
      this.transition = null;
    });
    if (mode === "2D") scene.morphTo2D(0.7);
    else scene.morphTo3D(0.7);
    scene.requestRender();
    return this.transition;
  }
  setCamera(s) {
    const C = this.C,
      c = this.v.camera,
      t = C.Cartesian3.fromDegrees(s.lon, s.lat, s.elevation || 0);
    if (this.mode === "Transition") {
      this.afterMorph = { ...s };
      return;
    }
    if (this.mode === "2D") {
      const width = (scaleAt(s.lat) * this.host.clientWidth) / 2 ** s.zoom;
      c.setView({ destination: C.Cartesian3.fromDegrees(s.lon, s.lat, width) });
      this.last = { ...s, pitch: 0, bearing: 0 };
      this.v.scene.requestRender();
      return;
    }
    c.lookAt(
      t,
      new C.HeadingPitchRange(
        s.bearing * rad,
        (clamp(s.pitch, 0, 84) - 90) * rad,
        rangeAt(s, this.host.clientHeight, c.frustum.fovy),
      ),
    );
    c.lookAtTransform(C.Matrix4.IDENTITY);
    if (s.pitch === 0) {
      // At nadir the eye and target share a vertical axis; lookAt alone loses the heading.
      c.setView({
        orientation: { heading: s.bearing * rad, pitch: -Math.PI / 2, roll: 0 },
      });
    }
    this.last = { ...s };
    this.lastEye = C.Cartesian3.clone(c.positionWC);
    this.lastDir = C.Cartesian3.clone(c.directionWC);
    this.lastUp = C.Cartesian3.clone(c.upWC);
    this.v.scene.requestRender();
  }
  getCameraState() {
    const C = this.C,
      c = this.v.camera;
    if (this.mode === "Transition") return this.last;
    if (this.mode === "2D") {
      const pos = c.pickEllipsoid(
        new C.Cartesian2(
          this.canvas.clientWidth / 2,
          this.canvas.clientHeight / 2,
        ),
      );
      if (!pos) return this.last;
      const geo = C.Cartographic.fromCartesian(pos);
      const lat = geo.latitude / rad;
      return {
        lon: geo.longitude / rad,
        lat,
        elevation:
          this.v.terrainProvider instanceof C.EllipsoidTerrainProvider
            ? 0
            : this.v.scene.globe.getHeight(geo) || 0,
        bearing: 0,
        pitch: 0,
        zoom: clamp(
          Math.log2(
            (scaleAt(lat) * this.canvas.clientWidth) /
              (c.frustum.right - c.frustum.left),
          ),
          0,
          22,
        ),
      };
    }
    if (
      this.lastEye &&
      C.Cartesian3.distance(c.positionWC, this.lastEye) < 0.05 &&
      C.Cartesian3.distance(c.directionWC, this.lastDir) < 1e-8 &&
      C.Cartesian3.distance(c.upWC, this.lastUp) < 1e-8
    )
      return this.last;
    const ray = c.getPickRay(
      new C.Cartesian2(
        this.canvas.clientWidth / 2,
        this.canvas.clientHeight / 2,
      ),
    );
    const t =
      (!(this.v.terrainProvider instanceof C.EllipsoidTerrainProvider) &&
        this.v.scene.globe.pick(ray, this.v.scene)) ||
      c.pickEllipsoid(
        new C.Cartesian2(
          this.canvas.clientWidth / 2,
          this.canvas.clientHeight / 2,
        ),
      );
    if (!t) return this.last;
    const geo = C.Cartographic.fromCartesian(t),
      lat = geo.latitude / rad,
      dist = C.Cartesian3.distance(t, c.positionWC);
    const local = C.Matrix4.multiplyByPoint(
      C.Matrix4.inverseTransformation(
        C.Transforms.eastNorthUpToFixedFrame(t),
        new C.Matrix4(),
      ),
      c.positionWC,
      new C.Cartesian3(),
    );
    return {
      lon: geo.longitude / rad,
      lat,
      elevation: geo.height,
      zoom: zoomAt(lat, dist, this.host.clientHeight, c.frustum.fovy),
      bearing:
        Math.hypot(local.x, local.y) < 0.1
          ? c.heading / rad
          : Math.atan2(-local.x, -local.y) / rad,
      pitch: clamp(Math.acos(clamp(local.z / dist, -1, 1)) / rad, 0, 84),
    };
  }
  async elevation(lon, lat) {
    const C = this.C,
      pos = C.Cartographic.fromDegrees(lon, lat),
      p = this.v.terrainProvider;
    if (p instanceof C.EllipsoidTerrainProvider) return 0;
    if (p.availability) {
      try {
        return (await C.sampleTerrainMostDetailed(p, [pos]))[0].height || 0;
      } catch {}
    }
    return this.v.scene.globe.getHeight(pos) || 0;
  }
  // A large billboard can project beyond the limb even when its base is behind Earth.
  // Test the line of sight to the anchor in ellipsoid-scaled coordinates.
  updateHorizon() {
    const C = this.C,
      scene = this.v.scene,
      earth = scene.globe.ellipsoid;
    if (this.mode !== "3D") {
      for (const b of this.visiblePins) b.show = true;
      return;
    }
    const eye = earth.transformPositionToScaledSpace(
      this.v.camera.positionWC,
      this.scaledEye,
    );
    const eyeSquared = C.Cartesian3.magnitudeSquared(eye);
    if (eyeSquared <= 1) {
      for (const b of this.visiblePins) b.show = true;
      return;
    }
    const horizon = Math.sqrt(eyeSquared - 1);
    for (const b of this.visiblePins) {
      const dot = C.Cartesian3.dot(b.id.normal, eye);
      if (dot >= 1) b.show = true;
      else if (dot < 1 - horizon * 0.06)
        b.show = false; // Beyond even a 10 km summit.
      else {
        const height = Math.max(0, scene.globe.getHeight(b.id.geo) || 0);
        const radius = 1 + height / earth.minimumRadius;
        b.show = dot * radius >= 1 - horizon * Math.sqrt(radius * radius - 1);
      }
    }
  }
  renderMarkers(items) {
    const C = this.C;
    const active = new Set();
    this.visiblePins.length = 0;
    for (const item of items) {
      active.add(item.key);
      let b = this.pins.get(item.key);
      const moved =
        !b ||
        b.id.atlasItem.lon !== item.lon ||
        b.id.atlasItem.lat !== item.lat;
      if (!b) {
        const size = item.count ? 40 : 26;
        b = this.billboards.add({
          position: C.Cartesian3.fromDegrees(item.lon, item.lat),
          heightReference: C.HeightReference.CLAMP_TO_GROUND,
          verticalOrigin: C.VerticalOrigin.BOTTOM,
          pixelOffset: new C.Cartesian2(0, -2),
          disableDepthTestDistance: 0,
          width: size,
          height: size,
          image: sprite(item),
          id: { atlasItem: item },
        });
        this.pins.set(item.key, b);
      } else {
        const old = b.id.atlasItem;
        if (old.lon !== item.lon || old.lat !== item.lat)
          b.position = C.Cartesian3.fromDegrees(item.lon, item.lat);
        if (old.icon !== item.icon || old.count !== item.count)
          b.image = sprite(item);
        b.id.atlasItem = item;
        b.show = true;
      }
      if (moved) {
        const earth = this.v.scene.globe.ellipsoid;
        b.id.normal = earth.transformPositionToScaledSpace(b.position);
        b.id.geo = C.Cartographic.fromDegrees(item.lon, item.lat);
      }
      this.visiblePins.push(b);
    }
    for (const [key, b] of this.pins) {
      if (active.has(key)) continue;
      if (b.id.atlasItem.count || b.id.atlasItem.secondary) {
        this.billboards.remove(b);
        this.pins.delete(key);
      } else b.show = false;
    }
    this.v.scene.requestRender();
  }
  resize() {
    this.v.resize();
    this.v.scene.requestRender();
  }
  destroy() {
    super.destroy();
    this.endTransition?.();
    if (this.v && !this.v.isDestroyed()) this.v.destroy();
  }
}
