/**
 * @module hash-map
 *
 * Persistent immutable hash map backed by a Hash Array Mapped Trie (HAMT).
 *
 * Every mutation (set, delete, merge) returns a new HashMap that shares
 * structure with the original. Only the path from root to the changed
 * leaf is copied (~7 nodes for millions of entries). This keeps memory
 * usage close to a mutable Map while providing full immutability.
 *
 * Keys are hashed via a fast 32-bit hash (FNV-1a for strings, identity
 * for numbers, fallback to toString for other types). Collisions are
 * handled by chaining at leaf nodes.
 *
 * **Time complexities (N = number of entries):**
 * - `get`: O(log32 N) — effectively O(1), max 7 levels for 2^35 entries
 * - `set`: O(log32 N) — copies only the path to the leaf
 * - `delete`: O(log32 N) — same structural sharing
 * - `has`: O(log32 N)
 * - `merge`: O(M log32 N) where M is the size of the other map
 * - iteration: O(N)
 *
 * @example
 * ```ts
 * const map = HashMap.of([['a', 1], ['b', 2]]);
 * const updated = map.set('c', 3);
 *
 * map.get('c');      // None (original unchanged)
 * updated.get('c');  // Some(3)
 * updated.size;      // 3
 * ```
 */

import type { Option } from "../core/option.js";
import { None, Some } from "../core/option.js";

// ── Hashing ──────────────────────────────────────────────────────────────────

/** FNV-1a 32-bit hash for strings. Fast, good distribution. */
const hashString = (s: string): number => {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/** Hash any key to a 32-bit unsigned integer. */
const hashKey = (key: unknown): number => {
  if (typeof key === "string") return hashString(key);
  if (typeof key === "number") return key >>> 0;
  return hashString(String(key));
};

// ── HAMT internals ───────────────────────────────────────────────────────────

/** Number of bits per trie level. 2^5 = 32-way branching. */
const BITS = 5;
const WIDTH = 1 << BITS;
const MASK = WIDTH - 1;

/** Extract the chunk of bits for a given trie level. */
const index = (hash: number, shift: number): number => (hash >>> shift) & MASK;

/** Count bits set to 1 below the given position in bitmap. */
const popcount = (bitmap: number, pos: number): number => {
  const below = bitmap & ((1 << pos) - 1);
  // Brian Kernighan's bit counting
  let count = 0;
  let b = below;
  while (b) {
    b &= b - 1;
    count++;
  }
  return count;
};

/** A key-value pair stored at leaf nodes. */
interface Entry<K, V> {
  readonly key: K;
  readonly value: V;
  readonly hash: number;
}

interface InternalNode<K, V> {
  readonly kind: "internal";
  /** Bitmap indicating which of the 32 child positions are occupied. */
  readonly bitmap: number;
  /** Sparse array of children, indexed by popcount(bitmap, pos). */
  readonly children: readonly Node<K, V>[];
}

interface LeafNode<K, V> {
  readonly kind: "leaf";
  /** One or more entries sharing the same hash prefix (collision chain). */
  readonly entries: readonly Entry<K, V>[];
}

type Node<K, V> = InternalNode<K, V> | LeafNode<K, V>;

const mkInternal = <K, V>(bitmap: number, children: readonly Node<K, V>[]): InternalNode<K, V> => ({
  kind: "internal",
  bitmap,
  children,
});

const mkLeaf = <K, V>(entries: readonly Entry<K, V>[]): LeafNode<K, V> => ({
  kind: "leaf",
  entries,
});

/** Replace a child at a specific index in the sparse array. */
const replaceChild = <K, V>(
  children: readonly Node<K, V>[],
  idx: number,
  child: Node<K, V>,
): Node<K, V>[] => {
  const copy = children.slice();
  copy[idx] = child;
  return copy;
};

/** Insert a child at a specific index in the sparse array. */
const insertChild = <K, V>(
  children: readonly Node<K, V>[],
  idx: number,
  child: Node<K, V>,
): Node<K, V>[] => {
  const copy: Node<K, V>[] = [];
  for (let i = 0; i < idx; i++) copy.push(children[i]!);
  copy.push(child);
  for (let i = idx; i < children.length; i++) copy.push(children[i]!);
  return copy;
};

/** Remove a child at a specific index from the sparse array. */
const removeChild = <K, V>(children: readonly Node<K, V>[], idx: number): Node<K, V>[] => {
  const copy: Node<K, V>[] = [];
  for (let i = 0; i < children.length; i++) {
    if (i !== idx) copy.push(children[i]!);
  }
  return copy;
};

// ── Trie operations ──────────────────────────────────────────────────────────

const trieGet = <K, V>(
  node: Node<K, V> | undefined,
  key: K,
  hash: number,
  shift: number,
): Option<V> => {
  if (node === undefined) return None;

  if (node.kind === "leaf") {
    for (const e of node.entries) {
      if (e.key === key) return Some(e.value);
    }
    return None;
  }

  const pos = index(hash, shift);
  const bit = 1 << pos;
  if ((node.bitmap & bit) === 0) return None;

  const idx = popcount(node.bitmap, pos);
  return trieGet(node.children[idx] as Node<K, V>, key, hash, shift + BITS);
};

const trieSet = <K, V>(
  node: Node<K, V> | undefined,
  entry: Entry<K, V>,
  shift: number,
): { node: Node<K, V>; added: boolean } => {
  if (node === undefined) {
    return { node: mkLeaf([entry]), added: true };
  }

  if (node.kind === "leaf") {
    const existing = node.entries;
    // Check for key update
    for (let i = 0; i < existing.length; i++) {
      if (existing[i]!.key === entry.key) {
        if (existing[i]!.value === entry.value) {
          return { node, added: false };
        }
        const updated = existing.slice();
        updated[i] = entry;
        return { node: mkLeaf(updated), added: false };
      }
    }

    // Same hash prefix at this level: collision chain or push down
    if (existing[0]!.hash === entry.hash) {
      return { node: mkLeaf([...existing, entry]), added: true };
    }

    // Different hash: split into an internal node
    let internal: Node<K, V> = mkInternal(0, []);
    // Re-insert existing entries
    for (const e of existing) {
      internal = trieSet(internal, e, shift).node;
    }
    // Insert new entry
    const result = trieSet(internal, entry, shift);
    return { node: result.node, added: true };
  }

  // Internal node
  const pos = index(entry.hash, shift);
  const bit = 1 << pos;
  const idx = popcount(node.bitmap, pos);

  if ((node.bitmap & bit) === 0) {
    // Empty slot: insert new leaf
    const child = mkLeaf<K, V>([entry]);
    return {
      node: mkInternal(node.bitmap | bit, insertChild(node.children, idx, child)),
      added: true,
    };
  }

  // Slot occupied: recurse
  const child = node.children[idx] as Node<K, V>;
  const result = trieSet(child, entry, shift + BITS);
  if (result.node === child) return { node, added: false };
  return {
    node: mkInternal(node.bitmap, replaceChild(node.children, idx, result.node)),
    added: result.added,
  };
};

const trieDelete = <K, V>(
  node: Node<K, V> | undefined,
  key: K,
  hash: number,
  shift: number,
): { node: Node<K, V> | undefined; removed: boolean } => {
  if (node === undefined) return { node: undefined, removed: false };

  if (node.kind === "leaf") {
    const entries = node.entries;
    const idx = entries.findIndex(e => e.key === key);
    if (idx === -1) return { node, removed: false };
    if (entries.length === 1) return { node: undefined, removed: true };
    const updated = entries.filter((_, i) => i !== idx);
    return { node: mkLeaf(updated), removed: true };
  }

  const pos = index(hash, shift);
  const bit = 1 << pos;
  if ((node.bitmap & bit) === 0) return { node, removed: false };

  const idx = popcount(node.bitmap, pos);
  const child = node.children[idx] as Node<K, V>;
  const result = trieDelete(child, key, hash, shift + BITS);

  if (!result.removed) return { node, removed: false };

  if (result.node === undefined) {
    // Child removed entirely
    if (node.children.length === 1) return { node: undefined, removed: true };
    return {
      node: mkInternal(node.bitmap ^ bit, removeChild(node.children, idx)),
      removed: true,
    };
  }

  return {
    node: mkInternal(node.bitmap, replaceChild(node.children, idx, result.node)),
    removed: true,
  };
};

/** Iterate all entries in the trie depth-first. */
function* trieEntries<K, V>(node: Node<K, V> | undefined): IterableIterator<Entry<K, V>> {
  if (node === undefined) return;
  if (node.kind === "leaf") {
    yield* node.entries;
    return;
  }
  for (const child of node.children) {
    yield* trieEntries(child as Node<K, V>);
  }
}

// ── Public interface ─────────────────────────────────────────────────────────

/**
 * An immutable hash map with structural sharing.
 *
 * Every mutation returns a new HashMap, sharing most of its structure
 * with the original. Get, set, and delete are O(log32 N), which is
 * effectively O(1) for any practical size.
 */
export interface ImmutableHashMap<K, V> extends Iterable<[K, V]> {
  /** Number of entries. */
  readonly size: number;

  /** Look up a value by key, returning Option. */
  get(key: K): Option<V>;
  /** Return true if the key exists. */
  has(key: K): boolean;
  /** Return a new HashMap with the key set to value. */
  set(key: K, value: V): ImmutableHashMap<K, V>;
  /** Return a new HashMap with the key removed. No-op if absent. */
  delete(key: K): ImmutableHashMap<K, V>;
  /** Return a new HashMap with all entries from other merged in (other wins on conflict). */
  merge(other: ImmutableHashMap<K, V>): ImmutableHashMap<K, V>;

  /** Apply fn to each value, returning a new HashMap. */
  map<U>(fn: (value: V, key: K) => U): ImmutableHashMap<K, U>;
  /** Keep only entries matching predicate. */
  filter(predicate: (value: V, key: K) => boolean): ImmutableHashMap<K, V>;
  /** Fold all entries left-to-right. */
  reduce<U>(fn: (acc: U, value: V, key: K) => U, init: U): U;
  /** Run a side-effect for each entry. */
  forEach(fn: (value: V, key: K) => void): void;
  /** Return the first entry matching predicate as Option<[K, V]>. */
  find(predicate: (value: V, key: K) => boolean): Option<[K, V]>;
  /** Return true if every entry satisfies predicate. */
  every(predicate: (value: V, key: K) => boolean): boolean;
  /** Return true if at least one entry satisfies predicate. */
  some(predicate: (value: V, key: K) => boolean): boolean;

  /** Iterate over keys. */
  keys(): IterableIterator<K>;
  /** Iterate over values. */
  values(): IterableIterator<V>;
  /** Iterate over [key, value] pairs. */
  entries(): IterableIterator<[K, V]>;

  /** Structural equality (keys compared by ===, values compared by ===). */
  equals(other: ImmutableHashMap<K, V>): boolean;
  /** Convert to a mutable Map. */
  toMap(): Map<K, V>;
  /** Convert to an array of [key, value] pairs. */
  toArray(): [K, V][];
  /** JSON-safe output as array of [key, value] pairs. */
  toJSON(): [K, V][];
  /** Human-readable string. */
  toString(): string;
}

// ── Implementation ───────────────────────────────────────────────────────────

class HashMapImpl<K, V> implements ImmutableHashMap<K, V> {
  constructor(
    private readonly root: Node<K, V> | undefined,
    readonly size: number,
  ) {}

  get(key: K): Option<V> {
    return trieGet(this.root, key, hashKey(key), 0);
  }

  has(key: K): boolean {
    return trieGet(this.root, key, hashKey(key), 0).isSome;
  }

  set(key: K, value: V): ImmutableHashMap<K, V> {
    const hash = hashKey(key);
    const result = trieSet(this.root, { key, value, hash }, 0);
    if (result.node === this.root) return this;
    return new HashMapImpl(result.node, this.size + (result.added ? 1 : 0));
  }

  delete(key: K): ImmutableHashMap<K, V> {
    const hash = hashKey(key);
    const result = trieDelete(this.root, key, hash, 0);
    if (!result.removed) return this;
    return new HashMapImpl(result.node, this.size - 1);
  }

  merge(other: ImmutableHashMap<K, V>): ImmutableHashMap<K, V> {
    let result: ImmutableHashMap<K, V> = this;
    for (const [k, v] of other) {
      result = result.set(k, v);
    }
    return result;
  }

  map<U>(fn: (value: V, key: K) => U): ImmutableHashMap<K, U> {
    let result: ImmutableHashMap<K, U> = empty;
    for (const entry of trieEntries(this.root)) {
      result = result.set(entry.key, fn(entry.value, entry.key));
    }
    return result;
  }

  filter(predicate: (value: V, key: K) => boolean): ImmutableHashMap<K, V> {
    let result: ImmutableHashMap<K, V> = empty;
    for (const entry of trieEntries(this.root)) {
      if (predicate(entry.value, entry.key)) {
        result = result.set(entry.key, entry.value);
      }
    }
    return result;
  }

  reduce<U>(fn: (acc: U, value: V, key: K) => U, init: U): U {
    let acc = init;
    for (const entry of trieEntries(this.root)) {
      acc = fn(acc, entry.value, entry.key);
    }
    return acc;
  }

  forEach(fn: (value: V, key: K) => void): void {
    for (const entry of trieEntries(this.root)) {
      fn(entry.value, entry.key);
    }
  }

  find(predicate: (value: V, key: K) => boolean): Option<[K, V]> {
    for (const entry of trieEntries(this.root)) {
      if (predicate(entry.value, entry.key)) {
        return Some([entry.key, entry.value] as [K, V]);
      }
    }
    return None;
  }

  every(predicate: (value: V, key: K) => boolean): boolean {
    for (const entry of trieEntries(this.root)) {
      if (!predicate(entry.value, entry.key)) return false;
    }
    return true;
  }

  some(predicate: (value: V, key: K) => boolean): boolean {
    for (const entry of trieEntries(this.root)) {
      if (predicate(entry.value, entry.key)) return true;
    }
    return false;
  }

  *keys(): IterableIterator<K> {
    for (const entry of trieEntries(this.root)) {
      yield entry.key;
    }
  }

  *values(): IterableIterator<V> {
    for (const entry of trieEntries(this.root)) {
      yield entry.value;
    }
  }

  *entries(): IterableIterator<[K, V]> {
    for (const entry of trieEntries(this.root)) {
      yield [entry.key, entry.value];
    }
  }

  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.entries();
  }

  equals(other: ImmutableHashMap<K, V>): boolean {
    if (this === other) return true;
    if (this.size !== other.size) return false;
    for (const entry of trieEntries(this.root)) {
      const otherVal = other.get(entry.key);
      if (otherVal.isNone || otherVal.value !== entry.value) return false;
    }
    return true;
  }

  toMap(): Map<K, V> {
    const m = new Map<K, V>();
    for (const entry of trieEntries(this.root)) {
      m.set(entry.key, entry.value);
    }
    return m;
  }

  toArray(): [K, V][] {
    const arr: [K, V][] = [];
    for (const entry of trieEntries(this.root)) {
      arr.push([entry.key, entry.value]);
    }
    return arr;
  }

  toJSON(): [K, V][] {
    return this.toArray();
  }

  toString(): string {
    const pairs: string[] = [];
    for (const entry of trieEntries(this.root)) {
      pairs.push(`${String(entry.key)} => ${String(entry.value)}`);
    }
    return `HashMap(${pairs.join(", ")})`;
  }
}

// ── Singleton empty instance ─────────────────────────────────────────────────

const empty: ImmutableHashMap<any, any> = new HashMapImpl(undefined, 0);

// ── Public factories ─────────────────────────────────────────────────────────

/**
 * Persistent immutable HashMap backed by a HAMT.
 *
 * @example
 * ```ts
 * const m = HashMap.of([['name', 'Alice'], ['age', 30]]);
 * const m2 = m.set('email', 'alice@example.com');
 *
 * m.size;              // 2 (original unchanged)
 * m2.size;             // 3
 * m2.get('name');      // Some('Alice')
 * m2.get('missing');   // None
 * ```
 */
export const HashMap: {
  /** Create an empty HashMap. */
  readonly empty: <K, V>() => ImmutableHashMap<K, V>;
  /** Create a HashMap from an array of [key, value] pairs. */
  readonly of: <K, V>(entries: readonly (readonly [K, V])[]) => ImmutableHashMap<K, V>;
  /** Create a HashMap from a native Map. */
  readonly fromMap: <K, V>(map: ReadonlyMap<K, V>) => ImmutableHashMap<K, V>;
  /** Create a HashMap from a plain object (string keys). */
  readonly fromObject: <V>(obj: Readonly<Record<string, V>>) => ImmutableHashMap<string, V>;
  /** Type guard for HashMap values. */
  readonly is: (value: unknown) => value is ImmutableHashMap<unknown, unknown>;
} = {
  empty: <K, V>() => empty as ImmutableHashMap<K, V>,

  of: <K, V>(entries: readonly (readonly [K, V])[]): ImmutableHashMap<K, V> => {
    let m: ImmutableHashMap<K, V> = empty;
    for (const [k, v] of entries) {
      m = m.set(k, v);
    }
    return m;
  },

  fromMap: <K, V>(map: ReadonlyMap<K, V>): ImmutableHashMap<K, V> => {
    let m: ImmutableHashMap<K, V> = empty;
    for (const [k, v] of map) {
      m = m.set(k, v);
    }
    return m;
  },

  fromObject: <V>(obj: Readonly<Record<string, V>>): ImmutableHashMap<string, V> => {
    let m: ImmutableHashMap<string, V> = empty;
    for (const key of Object.keys(obj)) {
      m = m.set(key, obj[key]!);
    }
    return m;
  },

  is: (value): value is ImmutableHashMap<unknown, unknown> => value instanceof HashMapImpl,
};
