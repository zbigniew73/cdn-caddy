import os from 'os';
import fs from 'fs';

function cpuTimesSnapshot() {
  let idle = 0;
  let total = 0;
  for (const cpu of os.cpus()) {
    for (const type in cpu.times) total += cpu.times[type];
    idle += cpu.times.idle;
  }
  return { idle, total };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getCpuUsagePercent() {
  const start = cpuTimesSnapshot();
  await sleep(200);
  const end = cpuTimesSnapshot();
  const idleDelta = end.idle - start.idle;
  const totalDelta = end.total - start.total;
  if (totalDelta <= 0) return 0;
  return Math.round((1 - idleDelta / totalDelta) * 100);
}

function getSwapInfo() {
  try {
    const content = fs.readFileSync('/proc/meminfo', 'utf-8');
    const totalMatch = content.match(/^SwapTotal:\s+(\d+) kB/m);
    const freeMatch = content.match(/^SwapFree:\s+(\d+) kB/m);
    if (!totalMatch || !freeMatch) return null;

    const totalBytes = parseInt(totalMatch[1], 10) * 1024;
    if (totalBytes === 0) return null;

    const freeBytes = parseInt(freeMatch[1], 10) * 1024;
    const usedBytes = totalBytes - freeBytes;
    return {
      totalBytes,
      freeBytes,
      usedBytes,
      usedPercent: Math.round((usedBytes / totalBytes) * 100)
    };
  } catch {
    return null;
  }
}

function getDiskInfo(mountPath) {
  try {
    const stat = fs.statfsSync(mountPath);
    const totalBytes = stat.blocks * stat.bsize;
    const freeBytes = stat.bavail * stat.bsize;
    const usedBytes = totalBytes - freeBytes;
    return {
      path: mountPath,
      totalBytes,
      freeBytes,
      usedBytes,
      usedPercent: totalBytes ? Math.round((usedBytes / totalBytes) * 100) : 0
    };
  } catch {
    return null;
  }
}

async function getSystemStats() {
  const cpus = os.cpus();
  const usagePercent = await getCpuUsagePercent();

  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  const usedMem = totalMem - freeMem;

  return {
    hostname: os.hostname(),
    uptimeSeconds: Math.floor(os.uptime()),
    cpu: {
      model: (cpus[0]?.model || '').trim(),
      cores: cpus.length,
      usagePercent
    },
    memory: {
      totalBytes: totalMem,
      freeBytes: freeMem,
      usedBytes: usedMem,
      usedPercent: totalMem ? Math.round((usedMem / totalMem) * 100) : 0
    },
    swap: getSwapInfo(),
    disk: getDiskInfo('/')
  };
}

export { getSystemStats };
