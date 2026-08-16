import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const inputArg = process.argv[2];
if (!inputArg) throw new Error('Usage: npm run backup:verify -- <backup-file.json>');
const backup = JSON.parse(await readFile(resolve(inputArg), 'utf8'));
if (backup.format !== 'gsm-critical-backup/v1' || !backup.data) throw new Error('Unsupported backup format');
const expectedTables = ['supply_demand_snapshots', 'supply_demand_cells', 'hotspots', 'audit_logs'];
for (const table of expectedTables) {
  if (!Array.isArray(backup.data[table])) throw new Error(`Missing table ${table}`);
  if (backup.tables?.[table] !== backup.data[table].length) throw new Error(`Count mismatch for ${table}`);
}
const checksum = createHash('sha256').update(JSON.stringify(backup.data)).digest('hex');
if (checksum !== backup.sha256) throw new Error('Backup checksum mismatch');

const snapshotIds = new Set(backup.data.supply_demand_snapshots.map(({ id }) => String(id)));
const orphanCells = backup.data.supply_demand_cells.filter(({ snapshot_id }) => !snapshotIds.has(String(snapshot_id)));
const orphanHotspots = backup.data.hotspots.filter(({ snapshot_id }) => !snapshotIds.has(String(snapshot_id)));
if (orphanCells.length || orphanHotspots.length) {
  throw new Error(`Relational verification failed: ${orphanCells.length} cells and ${orphanHotspots.length} hotspots are orphaned`);
}
if (backup.data.audit_logs.some(({ created_at }) => Number.isNaN(Date.parse(created_at)))) {
  throw new Error('Audit backup contains an invalid timestamp');
}
console.log(JSON.stringify({ valid: true, format: backup.format, tables: backup.tables, sha256: checksum }, null, 2));
