/**
 * Client-side schema inheritance helpers.
 *
 * TypeScript port of n8n's `NodeHelpers.mergeNodeProperties` pattern,
 * mirrored exactly after `server/services/credential_registry.py::_deep_merge`
 * so the client and server produce byte-identical results when resolving
 * a provider's `extends` chain.
 *
 * Array fields listed in `MERGE_BY_KEY_ARRAYS` merge by their `key` field:
 * child entries with a matching `key` deep-merge into the parent; unmatched
 * child entries append. Other arrays are replaced wholesale.
 *
 * Usage contexts (all additive — zero callers today):
 *
 *   1. **Future offline catalogue**: if we later bundle a
 *      `credential_providers.json` snapshot for zero-network cold starts,
 *      the client needs to resolve `extends` without a server roundtrip.
 *   2. **Phase B NodeSpec registry**: NodeSpecs inherit via the same
 *      pattern. Sharing this helper avoids duplicating merge semantics.
 *   3. **Hot-reload preview**: dev-mode UI that wants to preview a
 *      provider spec before the server reloads it.
 *
 * The credentials panel as shipped today always calls
 * `credential_registry.resolve_extends()` server-side and returns the
 * already-flattened providers to the client (see
 * `server/routers/websocket.py::handle_get_credential_catalogue`). The
 * client never needs to merge at runtime in the current shipping path.
 */

type Jsonish =
  | string
  | number
  | boolean
  | null
  | Jsonish[]
  | { [key: string]: Jsonish | undefined };

type JsonRecord = { [key: string]: Jsonish | undefined };

/**
 * Field names whose array values should be merged by each element's `key`
 * property rather than replaced wholesale. Matches the set in
 * `server/services/credential_registry.py::_MERGE_BY_KEY_ARRAYS`.
 */
export const MERGE_BY_KEY_ARRAYS: ReadonlySet<string> = new Set([
  'fields',
  'status_rows',
  'actions',
  // Frontend-shape aliases (used when this helper is applied to
  // already-rehydrated ProviderConfig objects rather than raw JSON).
  'statusRows',
]);

function isPlainObject(value: unknown): value is JsonRecord {
  if (value === null || typeof value !== 'object') return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function cloneDeep<T>(value: T): T {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => cloneDeep(item)) as unknown as T;
  const out: JsonRecord = {};
  for (const [k, v] of Object.entries(value as JsonRecord)) {
    out[k] = cloneDeep(v);
  }
  return out as unknown as T;
}

/**
 * Merge two arrays of objects by each element's `key` field.
 *
 * - Parent entries appear first, in their original order.
 * - Child entries with a matching `key` deep-merge into the parent (child
 *   wins on scalar conflicts; nested dicts recurse via {@link deepMerge}).
 * - Unmatched child entries append in child order.
 * - Entries without a `key` on either side are treated as identity
 *   replacements: the unkeyed parent is preserved, the unkeyed child
 *   appends at the end.
 */
function mergeArrayByKey(parent: Jsonish[], child: Jsonish[]): Jsonish[] {
  const byKey = new Map<string, Jsonish>();
  const order: string[] = [];

  const itemKey = (item: Jsonish, prefix: string, index: number): string => {
    if (isPlainObject(item) && typeof item.key === 'string') {
      return item.key;
    }
    return `${prefix}:${index}`;
  };

  parent.forEach((item, i) => {
    const k = itemKey(item, 'parent', i);
    byKey.set(k, cloneDeep(item));
    order.push(k);
  });

  child.forEach((item, i) => {
    if (isPlainObject(item) && typeof item.key === 'string') {
      const k = item.key;
      const existing = byKey.get(k);
      if (isPlainObject(existing)) {
        byKey.set(k, deepMerge(existing, item));
      } else {
        byKey.set(k, cloneDeep(item));
        if (!order.includes(k)) order.push(k);
      }
    } else {
      const k = `child:${i}`;
      byKey.set(k, cloneDeep(item));
      order.push(k);
    }
  });

  return order.map((k) => byKey.get(k) as Jsonish);
}

/**
 * Deep-merge `parent` with `child`:
 *
 * - Nested plain objects merge recursively.
 * - Arrays named in {@link MERGE_BY_KEY_ARRAYS} merge by `key` via
 *   {@link mergeArrayByKey}.
 * - All other arrays and scalars are replaced wholesale by the child.
 * - The child's `extends` key is ignored (resolved at a higher layer).
 */
export function deepMerge(parent: JsonRecord, child: JsonRecord): JsonRecord {
  const result: JsonRecord = cloneDeep(parent);
  for (const [key, childValue] of Object.entries(child)) {
    if (key === 'extends') continue;
    if (childValue === undefined) continue;

    const parentValue = result[key];

    if (isPlainObject(parentValue) && isPlainObject(childValue)) {
      result[key] = deepMerge(parentValue, childValue);
      continue;
    }

    if (
      MERGE_BY_KEY_ARRAYS.has(key) &&
      Array.isArray(parentValue) &&
      Array.isArray(childValue)
    ) {
      result[key] = mergeArrayByKey(parentValue, childValue);
      continue;
    }

    result[key] = cloneDeep(childValue);
  }
  return result;
}

/**
 * Public convenience: merge a parent and child `ProviderConfig`-shaped
 * blob, returning a new object with the child's `extends` stripped. The
 * returned value is always a fresh deep-clone; callers can safely mutate.
 *
 * Typical usage (once client-side `extends` resolution is wired):
 *
 *   const resolved = mergeProperties(parentSpec, childSpec);
 */
export function mergeProperties<
  P extends Record<string, unknown>,
  C extends Record<string, unknown>,
>(parent: P, child: C): P & Omit<C, 'extends'> {
  return deepMerge(parent as JsonRecord, child as JsonRecord) as P & Omit<C, 'extends'>;
}
