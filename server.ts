import express from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer as createViteServer } from 'vite';
import {
  CATALOG_SITES,
  createCustomSite,
  getPoleMapMetadata,
  POLE_MAP_TILE_MAX,
  POLE_MAP_TILE_MIN,
  POLE_MAP_TILE_ZOOM,
} from './src/server/catalog.ts';
import { runMissionAnalysis, validateSpiceAgainstHorizons } from './src/server/lunarEngine.ts';
import { spiceClient, SpiceBackendError } from './src/server/spiceClient.ts';
import type { AnalysisRequest, HealthResponse } from './src/types/lunar.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';

// In-memory cache for official NASA Moon Trek PNG tiles
const tileCache = new Map<string, Buffer>();

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '1mb' }));

  app.get('/api/health', async (_req, res) => {
    const spice = await spiceClient.getHealth();
    const payload: HealthResponse = {
      status: 'ok',
      service: 'CLPS Lunar Landing Site Navigator API',
      ephemeris_backend: spice.available
        ? `NASA/JPL NAIF SPICE (${spice.toolkit}, SpiceyPy ${spice.spiceypy_version}, DE440/MOON_ME) + JPL Horizons DE441 fallback`
        : 'NASA/JPL Horizons REST API (DE441, live fallback; SPICE unavailable)',
      terrain_dem_status:
        'NASA GSFC PGDA Product 90 LOLA DEMs active (-60°S to -90°S) with flat 0° fallback outside coverage',
      spice,
    };
    res.json(payload);
  });

  app.get('/api/sites', (_req, res) => {
    res.json(CATALOG_SITES);
  });

  app.post('/api/sites/custom', (req, res) => {
    try {
      const lat = Number(req.body?.latitude_deg);
      const lon = Number(req.body?.longitude_deg);
      const site = createCustomSite(lat, lon);
      res.json(site);
    } catch (error) {
      res.status(422).json({
        detail: error instanceof Error ? error.message : 'Invalid custom coordinates.',
      });
    }
  });

  app.get('/api/map', (_req, res) => {
    res.json(getPoleMapMetadata());
  });

  // Strict NASA Moon Trek proxy for LRO WAC South Pole Mosaic tiles (z=3 row/col 2..5 or z=4 row/col 4..11)
  app.get('/api/nasa/tile/:z/:row/:col', async (req, res) => {
    const z = Number(req.params.z);
    const row = Number(req.params.row);
    const col = Number(req.params.col);

    const validZ3 =
      z === POLE_MAP_TILE_ZOOM &&
      row >= POLE_MAP_TILE_MIN &&
      row <= POLE_MAP_TILE_MAX &&
      col >= POLE_MAP_TILE_MIN &&
      col <= POLE_MAP_TILE_MAX;
    const validZ4 =
      z === 4 && row >= 4 && row <= 11 && col >= 4 && col <= 11;

    if (!Number.isInteger(row) || !Number.isInteger(col) || (!validZ3 && !validZ4)) {
      res.status(400).json({ detail: 'Tile coordinates out of verified south pole extent.' });
      return;
    }

    const key = `${z}/${row}/${col}`;
    const cached = tileCache.get(key);
    if (cached) {
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(cached);
      return;
    }

    const nasaUrl = `https://trek.nasa.gov/tiles/Moon/SP/LRO_WAC_Mosaic_SPole60_100mp/1.0.0/default/default028mm/${z}/${row}/${col}.png`;
    try {
      const upstream = await fetch(nasaUrl, { signal: AbortSignal.timeout(12_000) });
      if (!upstream.ok) {
        res.status(502).json({ detail: `NASA Moon Trek tile returned HTTP ${upstream.status}` });
        return;
      }
      const buf = Buffer.from(await upstream.arrayBuffer());
      tileCache.set(key, buf);
      res.setHeader('Content-Type', 'image/png');
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buf);
    } catch (error) {
      res.status(502).json({
        detail:
          error instanceof Error ? error.message : 'Unable to fetch NASA Moon Trek tile.',
      });
    }
  });

  app.post('/api/analysis', async (req, res) => {
    try {
      const body = req.body as AnalysisRequest;
      const result = await runMissionAnalysis(body);
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Analysis failed.';
      const status =
        error instanceof SpiceBackendError
          ? 503
          : /horizons|http|fetch|timeout/i.test(message)
            ? 502
            : 422;
      res.status(status).json({ detail: message });
    }
  });

  app.get('/api/validation/spice-vs-horizons', async (req, res) => {
    try {
      const siteId = typeof req.query.site_id === 'string' ? req.query.site_id : undefined;
      const startIso = typeof req.query.start === 'string' ? req.query.start : undefined;
      const endIso = typeof req.query.end === 'string' ? req.query.end : undefined;
      const stepMinutes = req.query.step_minutes ? Number(req.query.step_minutes) : undefined;
      const report = await validateSpiceAgainstHorizons({
        siteId,
        startIso,
        endIso,
        stepMinutes,
      });
      res.json(report);
    } catch (error) {
      res.status(502).json({
        detail: error instanceof Error ? error.message : 'Validation comparison failed.',
      });
    }
  });

  if (isProduction) {
    const distDir = path.resolve(__dirname, 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CLPS Lunar Landing Site Navigator listening on http://localhost:${PORT}`);
  });
}

startServer();
