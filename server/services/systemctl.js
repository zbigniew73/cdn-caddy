import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

const STATUS_PROPS = 'ActiveState,SubState,UnitFileState,MainPID,ExecMainStartTimestamp,Description,MemoryCurrent,LoadState';

function parseProps(stdout) {
  const props = {};
  for (const line of stdout.split('\n')) {
    const idx = line.indexOf('=');
    if (idx === -1) continue;
    props[line.slice(0, idx)] = line.slice(idx + 1);
  }
  return props;
}

async function getUnitStatus(unit) {
  const { stdout } = await execFileAsync('systemctl', ['show', unit, '--no-page', '-p', STATUS_PROPS]);
  const props = parseProps(stdout);
  if (!props.LoadState || props.LoadState === 'not-found') {
    return { unit, found: false };
  }

  const memoryBytes = parseInt(props.MemoryCurrent, 10);
  return {
    unit,
    found: true,
    description: props.Description || '',
    activeState: props.ActiveState || 'unknown',
    subState: props.SubState || '',
    enabled: props.UnitFileState || 'unknown',
    memoryBytes: Number.isFinite(memoryBytes) ? memoryBytes : null,
    mainPid: props.MainPID && props.MainPID !== '0' ? Number(props.MainPID) : null,
    since: props.ExecMainStartTimestamp || null
  };
}

export { getUnitStatus };
