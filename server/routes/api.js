import { Router } from 'express';
import { getSystemStats } from '../services/systemStats.js';
import { listServices } from '../services/systemServices.js';

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

export default router;
