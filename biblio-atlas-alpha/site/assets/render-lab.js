import { home, clamp, imagery, terrain } from "./engines/common.js";
const $ = (id) => document.getElementById(id);
const engines = {
  cesium: async () => (await import("./engines/cesium.js")).CesiumEngine,
  maplibre: async () => (await import("./engines/maplibre.js")).MapLibreEngine,
  openglobus: async () =>
    (await import("./engines/openglobus.js")).OpenGlobusEngine,
};
function bounded(p, ms) {
  let timer;
  return Promise.race([
    p,
    new Promise(
      (_, no) =>
        (timer = setTimeout(() => no(Error("Délai de réponse dépassé")), ms)),
    ),
  ]).finally(() => clearTimeout(timer));
}
function optionText(id) {
  return $(id).selectedOptions[0]?.textContent || "—";
}
export class RenderLab {
  constructor(schema, pick) {
    this.schema = schema;
    this.pick = pick;
    this.camera = { ...home };
    this.family = [];
    this.collection = [];
    this.level = -1;
    this.serial = 0;
    this.terrainSerial = 0;
    this.moveSerial = 0;
    this.lastError = 0;
    this.ticks = [];
    for (const [k, p] of Object.entries(imagery))
      if (p.url) $("imageChoice").add(new Option(p.label, k));
    for (const [k, p] of Object.entries(terrain))
      if (k !== "custom" || p.mesh)
        $("terrainChoice").add(new Option(p.label, k));
    $("showRender").onclick = () => this.panel($("renderPanel").hidden);
    $("hideRender").onclick = () => this.panel(false);
    $("engineChoice").onchange = () => this.switchEngine();
    $("terrainChoice").onchange = () => this.changeTerrain();
    $("imageChoice").onchange = () => {
      this.lastError = 0;
      $("mapState").textContent = "";
      this.active?.setImagery(this.image);
      this.credit();
    };
    $("qualityChoice").onchange = () => {
      this.active?.setQuality(this.quality);
      this.draw(true);
    };
    $("techToggle").onchange = () => {
      $("techRead").hidden = !$("techToggle").checked;
      this.measure();
    };
    for (const mode of ["2D", "3D"])
      $("mode" + mode).onclick = async () => {
        this.moveSerial++;
        const a = this.active;
        if (!a?.setMode) return;
        const transition = a.setMode(mode);
        this.syncControls();
        await transition;
        this.draw(true);
        this.syncControls();
      };
    const turn = (delta) => {
      const a = this.active;
      if (!a || (a.setMode && a.mode !== "3D")) return;
      this.moveSerial++;
      a.setHeading(delta === 0 ? 0 : this.cameraNow().bearing + delta);
      this.syncControls();
    };
    $("north").onclick = () => turn(0);
    $("turnLeft").onclick = () => turn(-15);
    $("turnRight").onclick = () => turn(15);
    $("tilt").oninput = () => {
      this.moveSerial++;
      this.active?.setViewTilt(Number($("tilt").value));
      this.syncControls();
    };
    this.guard = () => {
      this.moveSerial++;
    };
    for (const event of ["pointerdown", "wheel", "keydown"])
      $("globe").addEventListener(event, this.guard, { passive: true });
  }
  syncControls() {
    const a = this.active;
    $("cameraTools").hidden = !a;
    if (!a) return;
    const three = !a.setMode || a.mode === "3D";
    const camera = this.cameraNow();
    const heading = a.v ? (a.v.camera.heading * 180) / Math.PI : camera.bearing;
    $("north").style.setProperty("--north", -heading + "deg");
    $("sceneModes").hidden = !a.setMode;
    for (const id of ["turnLeft", "turnRight", "north"])
      $(id).disabled = !three;
    for (const mode of ["2D", "3D"]) {
      $("mode" + mode).disabled = a.mode === "Transition";
      $("mode" + mode).setAttribute("aria-pressed", a.mode === mode);
    }
    $("tiltLabel").hidden = !three;
    if (three) {
      $("tilt").value = a.getViewTilt(camera);
      $("tilt").setAttribute(
        "aria-valuetext",
        Math.round(camera.pitch) + "° depuis la verticale",
      );
    }
  }
  get image() {
    return imagery[$("imageChoice").value];
  }
  get quality() {
    return $("qualityChoice").value;
  }
  panel(show) {
    $("renderPanel").hidden = !show;
    $("showRender").setAttribute("aria-expanded", show);
  }
  async start() {
    this.observe = new ResizeObserver(() => {
      if (this.active) this.active.resize();
    });
    this.observe.observe($("globe"));
    this.interval = setInterval(() => {
      if (!document.hidden) {
        if (!this.active?.mode || this.lastDrawFrame !== this.active.frames) {
          this.draw();
          this.lastDrawFrame = this.active?.frames;
        }
        if (this.active && !this.active.setMode) this.syncControls();
        this.measure();
      }
    }, 300);
    window.addEventListener(
      "pagehide",
      (e) => {
        if (!e.persisted) {
          clearInterval(this.interval);
          this.observe.disconnect();
          this.active?.destroy();
        }
      },
      { once: true },
    );
    await this.switchEngine();
  }
  cameraNow() {
    try {
      const s = this.active?.getCameraState();
      if (
        s &&
        ["lon", "lat", "zoom", "pitch", "bearing"].every((k) =>
          Number.isFinite(s[k]),
        )
      )
        return { ...s, pitch: clamp(s.pitch, 0, 85) };
    } catch {}
    return this.camera;
  }
  async switchEngine() {
    const seq = ++this.serial;
    this.moveSerial++;
    this.camera = this.cameraNow();
    this.active?.destroy();
    this.active = null;
    this.syncControls();
    const id = $("engineChoice").value,
      host = document.createElement("div");
    host.className = "engineMount";
    $("globe").replaceChildren(host);
    this.level = -1;
    this.appliedTerrain = "none";
    this.lastError = 0;
    $("mapState").textContent =
      "Initialisation de " + optionText("engineChoice") + "…";
    const ion = $("terrainChoice").querySelector("[value=ion]");
    ion.disabled = id !== "cesium" || !window.ATLAS_SETTINGS.cesiumIonToken;
    const custom = $("terrainChoice").querySelector("[value=custom]");
    if (custom) custom.disabled = id !== "cesium";
    if ($("terrainChoice").selectedOptions[0]?.disabled)
      $("terrainChoice").value = "reearth";
    $("renderHint").textContent =
      id === "cesium" && !window.ATLAS_SETTINGS.cesiumIonToken
        ? "World Terrain s’active avec un jeton Cesium ion dans settings.js."
        : id !== "cesium"
          ? "Inclinez avec le curseur Vue ou le bouton droit + glisser sur le volcan. Les chevrons changent le cap."
          : "";
    let adapter;
    const start = performance.now();
    try {
      if (id !== "cesium" && !document.getElementById("style-" + id)) {
        const css = document.createElement("link");
        css.rel = "stylesheet";
        css.id = "style-" + id;
        css.href =
          id === "maplibre"
            ? "vendor/maplibre/maplibre-gl.css"
            : "vendor/openglobus/og.css";
        document.head.append(css);
      }
      const Type = await engines[id]();
      if (seq !== this.serial) return;
      adapter = new Type(host, {
        cameraChanged: () => {
          if (seq === this.serial) this.syncControls();
        },
        pick: (i) => this.pick(i),
        tileError: (part) => {
          if (seq === this.serial && Date.now() - this.lastError > 8000) {
            this.lastError = Date.now();
            $("mapState").textContent =
              "Tuile " +
              (part === "imagerie" ? "d’imagerie" : "de relief") +
              " indisponible. Vérifiez le réseau ou choisissez une autre source.";
          }
        },
      });
      await bounded(
        adapter.initialize({
          quality: this.quality,
          image: this.image,
          terrain: $("terrainChoice").value,
          camera: this.camera,
        }),
        20000,
      );
      if (seq !== this.serial) {
        adapter.destroy();
        return;
      }
      this.readySince = null;
      this.viewStarted = start;
      this.active = adapter;
      this.engineId = id;
      this.syncControls();
      this.firstMs = Math.round(performance.now() - start);
      this.ticks = [];
      this.draw(true);
      $("mapState").textContent = "";
      await this.changeTerrain();
    } catch (e) {
      if (seq !== this.serial) return;
      adapter?.destroy();
      this.active = null;
      $("mapState").textContent =
        optionText("engineChoice") +
        " indisponible · " +
        e.message +
        " · Vous pouvez changer de moteur.";
      console.error(e);
    }
  }
  async changeTerrain() {
    const a = this.active;
    if (!a) return;
    const seq = ++this.terrainSerial,
      id = $("terrainChoice").value;
    this.appliedTerrain = null;
    this.readySince = null;
    this.viewStarted = performance.now();
    this.credit();
    try {
      if (id === "reearth" && this.engineId !== "cesium") {
        const format =
          this.engineId === "maplibre"
            ? "terrarium/elevation"
            : "mapbox/ellipsoid";
        const meta = await fetch(
          "https://terrain.reearth.land/" + format + "/tilejson.json",
          { signal: AbortSignal.timeout(15000) },
        );
        if (!meta.ok || !(await meta.json()).tiles?.length)
          throw Error("Catalogue de relief indisponible");
        if (seq !== this.terrainSerial || a !== this.active) return;
      }
      await bounded(a.setTerrain(id), 18000);
      if (seq !== this.terrainSerial || a !== this.active) return;
      this.appliedTerrain = id;
      this.draw(true);
      this.credit();
      if (!this.lastError) $("mapState").textContent = "";
    } catch (e) {
      if (seq !== this.terrainSerial || a !== this.active) return;
      $("terrainChoice").value = "none";
      await a.setTerrain("none");
      this.appliedTerrain = "none";
      this.draw(true);
      this.credit();
      $("mapState").textContent =
        "Relief indisponible · terrain plat actif. Vous pouvez réessayer dans Rendu.";
    }
  }
  credit() {
    const h = $("credits");
    h.replaceChildren();
    const link = (text, url) => {
      const a = document.createElement("a");
      a.textContent = text;
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      h.append(a);
    };
    link(this.image.credit, this.image.link);
    if (this.appliedTerrain === "reearth") {
      h.append(" · ");
      link("Re:Earth Terrain", "https://terrain.reearth.land/");
      h.append(" / ");
      link("Mapterhorn et sources", "https://mapterhorn.com/attribution");
      h.append(" · EGM2008 (NGA)");
    }
    if (this.appliedTerrain === "ion") h.append(" · Cesium World Terrain");
  }
  world() {
    this.moveSerial++;
    this.camera = { ...home };
    this.active?.flyTo(this.camera);
    this.draw();
  }
  focus(lon, lat, zoom) {
    this.moveSerial++;
    this.camera = { lon, lat, zoom, bearing: 0, pitch: 0, elevation: 0 };
    this.active?.flyTo(this.camera);
    this.draw();
  }
  async relief(r) {
    const a = this.active;
    if (!a) return;
    this.panel(false);
    const token = ++this.moveSerial;
    if (a.setMode && a.mode !== "3D") await a.setMode("3D");
    if (token !== this.moveSerial || this.active !== a) return;
    // An altitude in the imported description is a provisional framing hint, never a record update.
    const approx = r.description?.match(
      /(?:^|\n)altitude\s*:\s*([−-]?[\d \u00a0]+(?:[.,]\d+)?)\s*m\b/i,
    );
    const estimate = Number(
      approx?.[1]
        ?.replace(/[ \u00a0]/g, "")
        .replace(",", ".")
        .replace("−", "-"),
    );
    const elevation =
      this.appliedTerrain === "none"
        ? 0
        : (r.altitude ?? (Number.isFinite(estimate) ? estimate : 0));
    const shot = {
      lon: r.lon,
      lat: r.lat,
      zoom: 10.8,
      bearing: 32,
      pitch: 70,
      elevation,
    };
    // Center immediately; refine the target height only while the user keeps this view.
    this.readySince = null;
    this.viewStarted = performance.now();
    this.camera = shot;
    a.flyTo(shot);
    this.draw();
    try {
      const h = await bounded(
        Promise.resolve(a.elevation(r.lon, r.lat)),
        30000,
      );
      if (
        a === this.active &&
        this.moveSerial === token &&
        Number.isFinite(h)
      ) {
        shot.elevation = h;
        a.setCamera(shot);
        this.draw();
      }
    } catch {}
    if (this.appliedTerrain === "none")
      $("mapState").textContent =
        "Vue oblique sans relief. Activez Mapterhorn dans Rendu pour voir les pentes.";
  }
  setCollection(tree, rows, on) {
    this.tree = tree;
    this.collection = rows;
    this.byId = new Map(rows.map((r) => [r.id, r]));
    this.grouped = on;
    this.draw(true);
  }
  selectFeature(r, family) {
    this.moveSerial++;
    this.selected = r;
    this.family = family;
    this.draw(true);
  }
  draw(force = false) {
    const a = this.active;
    if (!a || !this.tree) return;
    const state = this.cameraNow(),
      z = clamp(Math.floor(state.zoom), 0, 18);
    if (!force && (!this.grouped || z === this.level)) return;
    this.level = z;
    const pin = (r) => ({
      key: r.id,
      lon: r.lon,
      lat: r.lat,
      title: r.name || r.id,
      icon: this.schema.marker(r),
    });
    let items = this.grouped
      ? this.tree.getClusters([-180, -90, 180, 90], z).map((f) => {
          const p = f.properties;
          if (!p.cluster) return pin(this.byId.get(p.id));
          return {
            key: "c" + p.cluster_id,
            cluster: p.cluster_id,
            count: p.point_count,
            title: p.point_count + " éléments",
            lon: f.geometry.coordinates[0],
            lat: f.geometry.coordinates[1],
          };
        })
      : this.collection.map(pin);
    items.push(...this.family.map((r) => ({ ...pin(r), secondary: true })));
    a.updateMarkers(items);
  }
  measure() {
    const a = this.active;
    if (!a) return;
    const now = performance.now();
    const ready = this.appliedTerrain != null && a.tilesReady;
    if (ready && this.readySince == null)
      this.readySince = now - this.viewStarted;
    const tileState =
      this.appliedTerrain == null
        ? "Connexion au relief…"
        : ready
          ? ""
          : "Chargement des tuiles…";
    if ($("tileState").textContent !== tileState)
      $("tileState").textContent = tileState;
    this.ticks.push([now, a.frames]);
    while (this.ticks.length > 2 && now - this.ticks[1][0] > 1500)
      this.ticks.shift();
    if ($("techRead").hidden) return;
    const [begin, n] = this.ticks[0],
      fps = Math.round((1000 * (a.frames - n)) / Math.max(1, now - begin));
    const c = a.canvas,
      s = this.cameraNow();
    $("techRead").textContent = [
      optionText("engineChoice") + " · " + optionText("qualityChoice"),
      this.appliedTerrain == null
        ? "Connexion au relief…"
        : terrain[this.appliedTerrain].label,
      this.image.label,
      "Images rendues/s : " + fps + " · init. " + this.firstMs + " ms",
      ...(a.mode
        ? [
            a.mode +
              " · pitch " +
              ((a.v.camera.pitch * 180) / Math.PI).toFixed(1) +
              "° · cap " +
              (((a.v.camera.heading * 180) / Math.PI) % 360).toFixed(1) +
              "°",
            "Rendu : " +
              (now - a.lastFrameTime > 1200 ? "suspendu" : "actif") +
              " · tuiles en attente : " +
              a.pendingTiles +
              " · tilesLoaded : " +
              a.tilesReady,
          ]
        : [
            "Navigation 3D · inclinaison " +
              (a.nativeInclination?.() ?? s.pitch).toFixed(1) +
              "° · cap " +
              s.bearing.toFixed(1) +
              "°",
          ]),
      ...(a.terrainQueue ? ["DEM : " + a.terrainQueue] : []),
      ...(a.projectionDetail ? [a.projectionDetail] : []),
      "Tuiles : " +
        (ready ? "prêtes" : "en chargement") +
        (this.readySince == null
          ? ""
          : " · premier jeu prêt " +
            (this.readySince / 1000).toFixed(1) +
            " s"),
      "Repères soumis : " + a.markerCount + " · clusters : " + a.clusterCount,
      "Canvas : " + c.width + " × " + c.height + " · DPR " + devicePixelRatio,
      "Cible : " + s.lat.toFixed(3) + "°, " + s.lon.toFixed(3) + "°",
      "Zoom " +
        s.zoom.toFixed(1) +
        " · inclinaison " +
        s.pitch.toFixed(0) +
        "°",
      performance.memory
        ? "Tas JS de l’onglet : " +
          Math.round(performance.memory.usedJSHeapSize / 1048576) +
          " Mio"
        : "Mémoire JS indisponible",
    ].join("\n");
  }
}
