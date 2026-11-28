const catalogUrl = new URL('./item-inventory-art/index.json', import.meta.url);
const unavailable = { status: 'unknown', rows: [] };

export async function loadItemInventoryData(signal) {
  const response = await fetch(catalogUrl, {
    redirect: 'error', signal: AbortSignal.any(signal ? [signal, AbortSignal.timeout(5000)] : [AbortSignal.timeout(5000)]),
  });
  if (!response.ok) throw new Error('Unable to load the original item catalogue.');
  return response.json();
}

function group(rows, definitions, key) {
  const groups = new Map();
  for (const row of rows) {
    const id = row[key];
    if (!Object.hasOwn(definitions, id)) continue;
    const saved = groups.get(id);
    if (saved) {
      saved.ownedCount++;
      saved.last = row;
    } else groups.set(id, { id, definition: definitions[id], row, ownedCount: 1, last: row });
  }
  return [...groups.values()].sort((a, b) => a.id - b.id);
}

export function projectMainItemInventory({ itemsSnapshot = unavailable, partsSnapshot = unavailable, metadata }) {
  const items = Object.fromEntries(metadata.tabs.items.map(({ kind }) => [kind, []]));
  const parts = Object.fromEntries([
    ...metadata.tabs.body, ...metadata.tabs.clothes, ...metadata.tabs.accessories,
  ].map(({ kind }) => [kind, []]));

  for (const { id, definition, row, ownedCount } of group(itemsSnapshot.rows, metadata.items, 'itemId')) {
    // BaseItemListPanel sends result-image tickets to Special. ItemListPanel does not add aliases.
    const category = definition.kind === 5 ? 3 : definition.kind;
    items[category]?.push({ id, definition, row, count: ownedCount, ownedCount });
  }
  for (const { id, definition, row, ownedCount, last } of group(partsSnapshot.rows, metadata.parts, 'partId')) {
    // BodyListPanel keeps one tile per definition, the last equip mark and the first physical detail.
    parts[definition.kind]?.push({ id, definition, row, count: 1, ownedCount,
      equipped: (last.used & 1) !== 0, activated: (row.used & 2) !== 0 });
  }
  return { items, parts, itemsStatus: itemsSnapshot.status, partsStatus: partsSnapshot.status,
    partCapacity: { count: partsSnapshot.status === 'ready' ? partsSnapshot.rows.length : null,
      capacity: partsSnapshot.capacity ?? null } };
}

function durationInMinutes(minutes) {
  if (!(minutes > 0)) return '-';
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor(minutes / 60) % 24;
  const words = [];
  if (days) words.push(days, 'D');
  if (hours) words.push(hours, 'H');
  return words.length ? words.join(' ') : `${minutes % 60} m`;
}

function clockLabel(milliseconds) {
  const day = 86400000;
  const hour = 3600000;
  const pad = value => String(value).padStart(2, '0');
  const fields = [];
  if (milliseconds > day) fields.push(Math.floor(milliseconds / day));
  if (milliseconds > hour) fields.push(pad(Math.floor(milliseconds / hour) % 24));
  fields.push(pad(Math.floor(milliseconds / 60000) % 60), pad(Math.floor(milliseconds / 1000) % 60));
  return milliseconds >= day ? `${fields[0]}d${fields[1]}h${fields[2]}m` : fields.join(':');
}

/** Original Main ItemView duration text. An expired display never removes the physical row. */
export function formatPartDuration(definition, row, now = performance.now()) {
  const duration = durationInMinutes(definition.durationMinutes);
  if (!(row.used & 2) || !Number.isInteger(row.remainingSeconds) || !Number.isFinite(row.receivedAt)) return duration;
  const remaining = Math.max(0, row.remainingSeconds * 1000 - Math.max(0, now - row.receivedAt));
  return `${duration} [${clockLabel(remaining)}]`;
}
