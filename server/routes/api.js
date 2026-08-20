import { Router } from 'express';
import { getSystemStats } from '../services/systemStats.js';
import { listServices } from '../services/systemServices.js';
import { getStatus, saveAndTestApiKey, retestApiKey, removeApiKey } from '../services/gcore.js';
import { checkForUpdate } from '../services/appUpdate.js';

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

export default router;
