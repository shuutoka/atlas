import { cpSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const site = fileURLToPath(new URL('./site/', import.meta.url));
const dist = resolve(site, '../dist');
const base = '/atlas/';
const openGlobus = '../../vendor/openglobus/og.es.js';

export default defineConfig({
  root: site,
  appType: 'mpa',
  base,
  publicDir: false,
  envDir: false,
  build: {
    outDir: dist,
    emptyOutDir: true,
    target: 'es2022',
    rollupOptions: {
      input: [join(site, 'index.html'), join(site, 'atlas.html')],
      external: [openGlobus],
      output: { paths: { [openGlobus]: base + 'vendor/openglobus/og.es.js' } }
    }
  },
  plugins: [{
    name: 'atlas-runtime-files',
    transformIndexHtml(html, { path }) {
      if (path !== '/atlas.html') return html;
      return [{
        tag: 'script',
        children: 'window.CESIUM_BASE_URL = new URL("vendor/Cesium/", document.baseURI).href;',
        injectTo: 'head-prepend'
      }];
    },
    writeBundle() {
      // Preserve URLs used by Cesium workers, the exported catalogue and classic scripts.
      for (const name of ['vendor', 'data', 'settings.js', 'assets/supercluster.min.js']) {
        cpSync(join(site, name), join(dist, name), { recursive: true });
      }
      cpSync(join(site, 'assets'), join(dist, 'assets'), {
        recursive: true,
        filter: path => !/\.(js|css)$/i.test(path)
      });
    }
  }]
});
