import { Router } from 'express';
import { getSystemStats } from '../services/systemStats.js';
import { listServices } from '../services/systemServices.js';
import { getStatus, saveAndTestApiKey, retestApiKey, removeApiKey } from '../services/gcore.js';
import { checkForUpdate } from '../services/appUpdate.js';
import { pullAndInstall } from '../services/selfUpdate.js';
import {
  listZones, createZone, deleteZone,
  listRecords, createRecord, updateRecord, deleteRecord
} from '../services/gcoreDns.js';
import { listCertificates, issueCertificate, renewCertificate, deleteCertificate } from '../services/acmeCerts.js';
import { getPoolConfig, savePoolConfig, saveMainPointHost, getDiscoveredPops, addPopPoint } from '../services/cdnPool.js';
import { checkAndSetupMain, getLastMainCheck } from '../services/caddyConfig.js';

const router = Router();

router.get('/system/summary', async (req, res) => {
  try {
    res.json(await getSystemStats());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/system/services', async (req, res) => {
  try {
    res.json(await listServices());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/system/version-check', async (req, res) => {
  try {
    res.json(await checkForUpdate());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/system/self-update', async (req, res) => {
  try {
    res.json(await pullAndInstall());
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.get('/gcore/status', (req, res) => {
  try {
    res.json(getStatus());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/gcore/apikey', async (req, res) => {
  const { apiKey } = req.body || {};
  if (!apiKey) return res.status(400).json({ error: 'Wymagane pole: apiKey' });
  try {
    res.json(await saveAndTestApiKey(apiKey));
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/gcore/test', async (req, res) => {
  try {
    res.json(await retestApiKey());
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.delete('/gcore/apikey', (req, res) => {
  try {
    removeApiKey();
    res.json(getStatus());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/gcore/zones', async (req, res) => {
  try {
    res.json(await listZones());
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/gcore/zones', async (req, res) => {
  try {
    res.json(await createZone((req.body || {}).name));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.delete('/gcore/zones/:zone', async (req, res) => {
  try {
    res.json(await deleteZone(req.params.zone));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.get('/gcore/zones/:zone/records', async (req, res) => {
  try {
    res.json(await listRecords(req.params.zone));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/gcore/zones/:zone/records', async (req, res) => {
  try {
    res.json(await createRecord(req.params.zone, req.body || {}));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.put('/gcore/zones/:zone/records/:type/:name', async (req, res) => {
  try {
    res.json(await updateRecord(req.params.zone, req.params.name, req.params.type, req.body || {}));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.delete('/gcore/zones/:zone/records/:type/:name', async (req, res) => {
  try {
    res.json(await deleteRecord(req.params.zone, req.params.name, req.params.type));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.get('/gcore/certs', (req, res) => {
  try {
    res.json(listCertificates());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/gcore/certs', async (req, res) => {
  const { domain, staging, email } = req.body || {};
  try {
    res.json(await issueCertificate(domain, { staging: staging !== false, email }));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/gcore/certs/:domain/renew', async (req, res) => {
  try {
    res.json(await renewCertificate(req.params.domain));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.delete('/gcore/certs/:domain', (req, res) => {
  try {
    deleteCertificate(req.params.domain);
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/cdn/pool', (req, res) => {
  try {
    res.json(getPoolConfig());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/cdn/pool', (req, res) => {
  try {
    res.json(savePoolConfig((req.body || {}).domain));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.get('/cdn/pops', async (req, res) => {
  try {
    res.json(await getDiscoveredPops());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/cdn/pool/main-point', (req, res) => {
  try {
    res.json(saveMainPointHost((req.body || {}).host));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.post('/cdn/pool/pop-point', async (req, res) => {
  try {
    res.json(await addPopPoint(req.body || {}));
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

router.get('/cdn/caddy/main-check', (req, res) => {
  try {
    res.json(getLastMainCheck());
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/cdn/caddy/main-check', async (req, res) => {
  try {
    res.json(await checkAndSetupMain());
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

export default router;
