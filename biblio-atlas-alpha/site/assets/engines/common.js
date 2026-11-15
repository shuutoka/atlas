export const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
export const rad = Math.PI / 180;
export const home = {
  lon: -20,
  lat: 30,
  zoom: 1.6,
  bearing: 0,
  pitch: 0,
  elevation: 0,
};
export function density(q) {
  const d = window.devicePixelRatio || 1;
  return q === "perf"
    ? Math.min(1, d)
    : q === "high"
      ? Math.min(3, Math.max(1.5, d))
      : Math.min(3, Math.max(1, d));
}
export function scaleAt(lat) {
  return (40075016.686 * Math.max(0.08, Math.cos(lat * rad))) / 512;
}
export function rangeAt(s, height, fov) {
  return (scaleAt(s.lat) * height) / (2 * Math.tan(fov / 2) * 2 ** s.zoom);
}
export function zoomAt(lat, dist, height, fov) {
  return clamp(
    Math.log2(
      (scaleAt(lat) * height) / (Math.max(1, dist) * 2 * Math.tan(fov / 2)),
    ),
    0,
    22,
  );
}
export const loadScript = (url, global) =>
  window[global]
    ? Promise.resolve()
    : new Promise((ok, no) => {
        const s = document.createElement("script");
        s.src = url;
        s.onload = ok;
        s.onerror = () => no(Error("Chargement impossible : " + url));
        document.head.append(s);
      });
export class MapEngine {
  constructor(host, events) {
    this.host = host;
    this.events = events;
    this.frames = 0;
    this.dead = false;
    this.markerCount = 0;
    this.clusterCount = 0;
  }
  // Saved camera pitch is an orbit inclination in degrees from local vertical.
  // Each engine maps a normalized slider to its supported orbit inclination.
  get maxViewInclination() {
    return 75;
  }
  getViewTilt(state = this.getCameraState()) {
    return clamp(state.pitch / this.maxViewInclination, 0, 1);
  }
  setViewTilt(value) {
    this.setCamera({
      ...this.getCameraState(),
      pitch: clamp(value, 0, 1) * this.maxViewInclination,
    });
  }
  setHeading(bearing) {
    this.setCamera({ ...this.getCameraState(), bearing });
  }
  frame() {
    this.frames++;
  }
  updateMarkers(items) {
    this.markerCount = items.filter((x) => !x.count).length;
    this.clusterCount = items.length - this.markerCount;
    this.renderMarkers(items);
  }
  flyTo(camera) {
    this.setCamera(camera);
  }
  destroy() {
    this.dead = true;
  }
}
const settings = window.ATLAS_SETTINGS;
export const imagery = {
  satellite: {
    label: "Satellite · Sentinel-2 (2023)",
    url: "https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2023_3857/default/g/{z}/{y}/{x}.jpg",
    max: 14,
    credit:
      "EOxCloudless – EOX IT Services GmbH · Copernicus Sentinel 2023 modifié",
    link: "https://cloudless.eox.at/",
  },
  physical: {
    label: "Fond physique · local",
    url: new URL("assets/physical/", document.baseURI).href + "{z}/{x}/{y}.jpg",
    max: 3,
    credit: "Natural Earth II",
    link: "https://www.naturalearthdata.com/",
  },
  street: {
    label: "Carte · OpenStreetMap",
    url: settings.tileUrl,
    max: 19,
    credit: settings.tileCredit,
    link: settings.tileCreditUrl,
  },
};
export const terrain = {
  reearth: {
    label: "Re:Earth / Mapterhorn",
    mesh: "https://terrain.reearth.land/cesium-mesh/ellipsoid",
    terrarium:
      "https://terrain.reearth.land/terrarium/elevation/{z}/{x}/{y}.webp",
    rgb: "https://terrain.reearth.land/mapbox/ellipsoid/{z}/{x}/{y}.webp",
  },
  none: { label: "Sans relief" },
  ion: { label: "Cesium World Terrain" },
  custom: { label: "Terrain Cesium configuré", mesh: settings.terrainUrl },
};
export function sprite(item) {
  if (!item.count) return item.icon;
  return (
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="160" viewBox="0 0 48 48"><circle cx="24" cy="24" r="21" fill="#153b3d" stroke="#f4debb" stroke-width="2"/><text x="24" y="29" text-anchor="middle" font-family="sans-serif" font-weight="bold" font-size="15" fill="white">' +
        item.count +
        "</text></svg>",
    )
  );
}
