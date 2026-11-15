import {
  MapEngine,
  loadScript,
  clamp,
  density,
  terrain,
  sprite,
} from "./common.js";
export class MapLibreEngine extends MapEngine {
  async initialize(s) {
    await loadScript("vendor/maplibre/maplibre-gl.js", "maplibregl");
    if (this.dead) return;
    const cam = s.camera;
    maplibregl.setMaxParallelImageRequests(10);
    this.map = new maplibregl.Map({
      container: this.host,
      style: {
        version: 8,
        projection: { type: "globe" },
        sources: {},
        layers: [
          {
            id: "sea",
            type: "background",
            paint: { "background-color": "#28484f" },
          },
        ],
      },
      center: [cam.lon, cam.lat],
      zoom: cam.zoom,
      bearing: cam.bearing,
      pitch: this.pitchForTilt(this.getViewTilt(cam)),
      minPitch: 0,
      maxPitch: 85,
      pitchWithRotate: true,
      dragRotate: true,
      touchPitch: true,
      maxTileCacheSize: 96,
      pixelRatio: density(s.quality),
      canvasContextAttributes: { antialias: true },
      attributionControl: false,
      renderWorldCopies: false,
    });
    this.q = s.quality;
    this.canvas = this.map.getCanvas();
    this.icons = new Map();
    this.markerRevision = 0;
    this.map.on("render", () => this.frame());
    this.map.on("error", (e) =>
      this.events.tileError(e.sourceId === "dem" ? "relief" : "imagerie"),
    );
    await new Promise((ok) => this.map.once("style.load", ok));
    if (this.dead) return;
    if (s.image) this.setImagery(s.image);
  }
  get projectionDetail() {
    // The pinned renderer interpolates its globe towards Mercator at zoom 11–12.
    const z = this.map.getZoom();
    return (
      "Projection globe · " +
      (z <= 11 ? "sphérique" : z >= 12 ? "Mercator local" : "transition")
    );
  }
  get tilesReady() {
    return this.map.isStyleLoaded() && this.map.areTilesLoaded();
  }
  setLod() {
    this.map.setSourceTileLodParams(
      this.q === "high" ? 3 : 5,
      this.q === "high" ? 5 : this.q === "perf" ? 1.5 : 3,
    );
  }
  applyTerrainMesh() {
    const m = this.map;
    m.setTerrain({ source: "dem", exaggeration: 1 });
    // Select the grid before MapLibre allocates its first shared terrain mesh.
    m.terrain.meshSize = this.q === "perf" ? 64 : 128;
  }
  setQuality(q) {
    const changeMesh = (q === "perf") !== (this.q === "perf");
    this.q = q;
    if (changeMesh && this.map.getTerrain()) {
      this.map.setTerrain(null);
      this.applyTerrainMesh();
    }
    this.setLod();
    this.map.setPixelRatio(density(q));
    this.resize();
  }
  setImagery(p) {
    const m = this.map;
    if (m.getLayer("base")) m.removeLayer("base");
    if (m.getSource("base")) m.removeSource("base");
    m.addSource("base", {
      type: "raster",
      tiles: [p.url],
      tileSize: 256,
      maxzoom: p.max,
    });
    m.addLayer(
      {
        id: "base",
        type: "raster",
        source: "base",
        paint: { "raster-fade-duration": 0 },
      },
      m.getLayer("pins") ? "pins" : undefined,
    );
    this.setLod();
  }
  async setTerrain(id) {
    const m = this.map;
    m.setTerrain(null);
    if (m.getSource("dem")) m.removeSource("dem");
    if (id === "none") return;
    m.addSource("dem", {
      type: "raster-dem",
      tiles: [terrain.reearth.terrarium],
      encoding: "terrarium",
      tileSize: 512,
      maxzoom: 14,
    });
    this.applyTerrainMesh();
    this.setLod();
  }
  get maxViewInclination() {
    return 85;
  }
  pitchForTilt(viewTilt) {
    return clamp(viewTilt, 0, 1) * this.maxViewInclination;
  }
  nativeInclination() {
    return this.map.getPitch();
  }
  setViewTilt(viewTilt) {
    this.map.stop().setPitch(this.pitchForTilt(viewTilt));
  }
  setHeading(bearing) {
    this.map.stop().setBearing(bearing);
  }
  getCameraState() {
    const m = this.map,
      c = m.getCenter();
    return {
      lon: c.lng,
      lat: c.lat,
      zoom: m.getZoom(),
      pitch: m.getPitch(),
      bearing: m.getBearing(),
      elevation: m.queryTerrainElevation(c) || 0,
    };
  }
  setCamera(s) {
    this.map.jumpTo({
      center: [s.lon, s.lat],
      zoom: s.zoom,
      pitch: this.pitchForTilt(this.getViewTilt(s)),
      bearing: s.bearing,
    });
  }
  elevation(lon, lat) {
    return this.map.queryTerrainElevation([lon, lat]) || 0;
  }
  async icon(item) {
    const uri = sprite(item);
    if (!this.icons.has(uri)) {
      const name = "atlas-icon-" + this.icons.size;
      const promise = (async () => {
        const image = new Image();
        image.src = uri;
        await image.decode();
        if (!this.dead)
          this.map.addImage(name, image, {
            pixelRatio: image.naturalWidth / (item.count ? 40 : 26),
          });
        return name;
      })();
      this.icons.set(uri, promise);
    }
    return this.icons.get(uri);
  }
  async renderMarkers(items) {
    const revision = ++this.markerRevision;
    const features = await Promise.all(
      items.map(async (i) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [i.lon, i.lat] },
        properties: { key: i.key, icon: await this.icon(i) },
      })),
    ).catch(() => null);
    if (this.dead || revision !== this.markerRevision || !features) return;
    this.byKey = new Map(items.map((i) => [i.key, i]));
    const data = { type: "FeatureCollection", features };
    const m = this.map,
      source = m.getSource("pins");
    if (source) {
      source.setData(data);
      return;
    }
    m.addSource("pins", { type: "geojson", data });
    m.addLayer({
      id: "pins",
      type: "symbol",
      source: "pins",
      layout: {
        "icon-image": ["get", "icon"],
        "icon-anchor": "bottom",
        "icon-allow-overlap": true,
        "icon-ignore-placement": true,
        "icon-pitch-alignment": "viewport",
        "icon-rotation-alignment": "viewport",
      },
    });
    m.on("click", "pins", (e) => {
      const i = this.byKey.get(e.features?.[0]?.properties.key);
      if (i) this.events.pick(i);
    });
  }
  resize() {
    this.map.resize();
  }
  destroy() {
    super.destroy();
    this.map?.remove();
  }
}
