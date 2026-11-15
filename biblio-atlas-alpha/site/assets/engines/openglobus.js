import * as O from "../../vendor/openglobus/og.es.js";
import {
  MapEngine,
  rangeAt,
  zoomAt,
  rad,
  clamp,
  density,
  terrain,
  sprite,
} from "./common.js";
// OpenGlobus expects a square vertex grid including both tile edges. Decode
// elevations before interpolation: RGB channel boundaries are not continuous.
class MapterhornTerrain extends O.RgbTerrain {
  _createHeights(image) {
    const size = image.width,
      last = size - 1,
      grid = this.plainGridSize,
      stride = grid + 1;
    this._ctx.drawImage(image, 0, 0);
    const bytes = this._ctx.getImageData(0, 0, size, size).data,
      heights = new Float32Array(stride * stride);
    const height = (x, y) => {
      const i = 4 * (y * size + x);
      return this.rgb2Height(bytes[i], bytes[i + 1], bytes[i + 2]);
    };
    for (let row = 0; row <= grid; row++) {
      const y = clamp((row * size) / grid - 0.5, 0, last),
        y0 = Math.floor(y),
        y1 = Math.min(last, y0 + 1),
        fy = y - y0;
      for (let col = 0; col <= grid; col++) {
        const x = clamp((col * size) / grid - 0.5, 0, last),
          x0 = Math.floor(x),
          x1 = Math.min(last, x0 + 1),
          fx = x - x0;
        heights[row * stride + col] =
          (1 - fy) * ((1 - fx) * height(x0, y0) + fx * height(x1, y0)) +
          fy * ((1 - fx) * height(x0, y1) + fx * height(x1, y1));
      }
    }
    return heights;
  }
}
export class OpenGlobusEngine extends MapEngine {
  provider(id) {
    const provider =
      id === "none"
        ? new O.EmptyTerrain()
        : new MapterhornTerrain("Mapterhorn", {
            url: terrain.reearth.rgb,
            geoidSrc: null,
            minZoom: 0,
            maxZoom: 14,
            maxNativeZoom: 14,
            plainGridSize: 32,
            gridSizeByZoom: [
              32, 32, 16, 8, 8, 8, 16, 16, 16, 32, 32, 32, 32, 32, 32, 32, 32,
              32, 32, 32, 16, 8,
            ],
            imageSize: 512,
            minHeight: -10000,
            resolution: 0.1,
            noDataValues: [],
          });
    if (provider.loader) provider.loader.MAX_REQUESTS = 8;
    return provider;
  }
  async initialize(s) {
    this.initialTerrain = s.terrain;
    this.g = new O.Globe({
      target: this.host,
      terrain: this.provider(s.terrain),
      controls: [],
      navigation: {
        active: true,
        mode: "free",
        disableTilt: false,
        disableRotation: false,
      },
      maxLoadingRequests: 8,
      nightTextureSrc: null,
      specularTextureSrc: null,
      atmosphereEnabled: false,
      dpi: density(s.quality),
      minAltitude: 5,
      maxAltitude: 70000000,
      msaa: 0,
    });
    this.entities = new Map();
    this.p = this.g.planet;
    this.p.lightEnabled = false;
    this.cam = this.p.camera;
    this.canvas = this.g.renderer.handler.canvas;
    this.layer = new O.Vector("Repères", { clampToGround: true, async: false });
    this.p.addLayer(this.layer);
    // Screen-space hit testing also covers the transparent interior of SVG pictograms.
    this.canvas.addEventListener(
      "pointerdown",
      (e) => (this.down = e.button === 0 ? [e.clientX, e.clientY] : null),
    );
    this.canvas.addEventListener("pointercancel", () => (this.down = null));
    this.canvas.addEventListener("pointerup", (e) => {
      if (
        !this.down ||
        Math.hypot(e.clientX - this.down[0], e.clientY - this.down[1]) > 5
      )
        return;
      this.down = null;
      const rect = this.canvas.getBoundingClientRect(),
        ratio = this.canvas.width / rect.width;
      let best = null,
        nearest = Infinity;
      for (const entity of this.layer.getEntities()) {
        const pos = entity.getCartesian(),
          toward = this.cam.eye.sub(pos);
        if (this.p.ellipsoid.getSurfaceNormal3v(pos).dot(toward) < 0) continue;
        const pt = this.p.getPixelFromCartesian(pos),
          item = entity.properties.atlasItem;
        const distance = Math.hypot(
          pt.x / ratio + rect.left - e.clientX,
          pt.y / ratio + rect.top - e.clientY,
        );
        if (distance < (item.count ? 20 : 14) && distance < nearest) {
          nearest = distance;
          best = item;
        }
      }
      if (best) this.events.pick(best);
    });
    this.g.renderer.events.on("postdraw", () => this.frame());
    this.setQuality(s.quality);
    if (s.image) this.setImagery(s.image);
    this.setCamera(s.camera);
  }
  setImagery(p) {
    const old = this.base;
    this.base = new O.XYZ(p.label, {
      isBaseLayer: true,
      url: p.url,
      maxNativeZoom: p.max,
      visibility: true,
    });
    this.p.addLayer(this.base);
    old?.remove();
    this.base.setVisibility(true);
  }
  async setTerrain(id) {
    if (id === this.initialTerrain) return;
    this.p.setTerrain(this.provider(id));
    this.initialTerrain = id;
  }
  get tilesReady() {
    // 0.28.7 stores imagery completion on the active quadtree, not on Planet.events.
    return (
      this.p.terrainReady && this.p.quadTreeStrategy._renderCompletedActivated
    );
  }
  get terrainQueue() {
    const loader = this.p.terrain.loader;
    return loader
      ? loader.loading + " en cours · " + loader.queue.length + " en file"
      : "sans relief";
  }
  setQuality(q) {
    this.g.renderer.handler.pixelRatio = density(q);
    this.p.quadTreeStrategy.setLodSize(
      q === "high" ? 170 : q === "perf" ? 340 : 256,
    );
    this.resize();
  }
  get maxViewInclination() {
    return 78;
  }
  nativeInclination() {
    return this.getCameraState().pitch;
  }
  setCamera(s) {
    this.g.navigation.stop();
    this.cam.stopFlying();
    const E = this.p.ellipsoid,
      point = new O.LonLat(s.lon, s.lat, s.elevation || 0),
      target = E.lonLatToCartesian(point),
      up = E.getSurfaceNormal3v(target);
    const east = E.lonLatToCartesian(
        new O.LonLat(s.lon + 0.001, s.lat, s.elevation || 0),
      )
        .sub(target)
        .getNormal(),
      north = up.cross(east).getNormal();
    const heading = north
        .scaleTo(Math.cos(s.bearing * rad))
        .add(east.scaleTo(Math.sin(s.bearing * rad))),
      tilt = this.getViewTilt(s) * this.maxViewInclination * rad,
      range = rangeAt(s, this.host.clientHeight, this.cam.getViewAngle() * rad);
    const eye = target
      .add(up.scaleTo(range * Math.cos(tilt)))
      .sub(heading.scaleTo(range * Math.sin(tilt)));
    this.cam.set(
      eye,
      target,
      heading.scaleTo(Math.cos(tilt)).add(up.scaleTo(Math.sin(tilt))),
    );
    this.cam.update();
    this.sampleState = null;
    this.last = { ...s, pitch: clamp(s.pitch, 0, this.maxViewInclination) };
    this.lastEye = this.cam.eye.clone();
    this.lastDir = this.cam.getForward().clone();
  }
  getCameraState() {
    // Terrain picking reads the depth buffer. Share the result across the UI and diagnostics.
    if (this.sampleFrame === this.frames && this.sampleState)
      return this.sampleState;
    if (
      this.lastEye &&
      this.cam.eye.distance(this.lastEye) < 0.05 &&
      this.cam.getForward().distance(this.lastDir) < 1e-8
    )
      return this.last;
    const pt = new O.Vec2(this.canvas.width / 2, this.canvas.height / 2),
      p = this.p.getCartesianFromPixelTerrain(pt);
    if (!p) return this.last;
    const ll = this.p.ellipsoid.cartesianToLonLat(p),
      delta = this.cam.eye.sub(p);
    this.sampleFrame = this.frames;
    return (this.sampleState = {
      lon: ll.lon,
      lat: ll.lat,
      elevation: ll.height,
      zoom: zoomAt(
        ll.lat,
        delta.length(),
        this.host.clientHeight,
        this.cam.getViewAngle() * rad,
      ),
      pitch:
        Math.acos(
          clamp(
            delta.getNormal().dot(this.p.ellipsoid.getSurfaceNormal3v(p)),
            -1,
            1,
          ),
        ) / rad,
      bearing: this.cam.getHeading() || 0,
    });
  }
  elevation(lon, lat) {
    return this.p.getHeightAboveELL(new O.LonLat(lon, lat));
  }
  renderMarkers(items) {
    const visible = new Set();
    for (const i of items) {
      visible.add(i.key);
      const size = (i.count ? 40 : 26) * this.g.renderer.handler.pixelRatio;
      const entry = this.entities.get(i.key);
      if (entry) {
        const old = entry.entity.properties.atlasItem;
        if (old.lon !== i.lon || old.lat !== i.lat)
          entry.entity.setLonLat(new O.LonLat(i.lon, i.lat));
        if (old.icon !== i.icon || old.count !== i.count)
          entry.entity.billboard.setSrc(sprite(i));
        if (size !== entry.size) entry.entity.billboard.setSize(size, size);
        entry.entity.properties.atlasItem = i;
        entry.size = size;
      } else {
        const entity = new O.Entity({
          name: i.title,
          properties: { atlasItem: i },
          lonlat: [i.lon, i.lat],
          billboard: { src: sprite(i), size: [size, size] },
        });
        this.layer.add(entity);
        this.entities.set(i.key, { entity, size });
      }
    }
    for (const [key, entry] of this.entities)
      if (!visible.has(key)) {
        this.layer.removeEntity(entry.entity);
        this.entities.delete(key);
      }
  }
  resize() {
    this.g.renderer.handler.setSize(
      this.host.clientWidth,
      this.host.clientHeight,
    );
  }
  destroy() {
    super.destroy();
    this.g?.destroy();
  }
}
