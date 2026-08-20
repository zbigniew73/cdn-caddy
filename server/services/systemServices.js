import { getUnitStatus } from './systemctl.js';

// Szkielet monitoruje na razie tylko Caddy (rdzen tego projektu - kazdy
// POP serwuje ruch CDN przez Caddy). Kolejne moduly (patrz zakladka
// "Moduly") moga dopisac wlasne wpisy do tego rejestru.
const CADDY_UNIT = process.env.CADDY_UNIT || 'caddy.service';

const SERVICE_REGISTRY = [
  { key: 'caddy', label: 'Caddy', unit: CADDY_UNIT }
];

async function listServices() {
  return Promise.all(
    SERVICE_REGISTRY.map(async (def) => ({
      key: def.key,
      label: def.label,
      ...(await getUnitStatus(def.unit))
    }))
  );
}

export { listServices };
