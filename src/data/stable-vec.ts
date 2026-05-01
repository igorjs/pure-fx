// Copyright 2026 igorjs. SPDX-License-Identifier: Apache-2.0

/**
 * @module stable-vec
 *
 * A dense, index-stable collection backed by typed arrays.
 *
 * Standard arrays invalidate indices when elements are removed (splice
 * shifts everything after the gap). StableVec solves this by assigning
 * each element a **handle** — a (index, generation) pair that remains
 * valid even after other elements are inserted or removed.
 *
 * Internally, data is kept contiguous: removal swaps the target with the
 * last element, keeping the backing store dense for cache-friendly iteration.
 * A generation counter per slot detects stale handles (use-after-free).
 * Freed slots are reused via an implicit free list.
 *
 * **Time complexities:**
 * - `insert`: O(1) amortized
 * - `remove`: O(1) — swap-with-last
 * - `get` by handle: O(1) — one indirection + generation check
 * - `iterate`: O(n) over dense data, no gaps
 *
 * **When to use:**
 * - Long-lived collections with frequent insert/remove
 * - External code holds handles that must survive mutations
 * - Cache-friendly iteration matters (game loops, simulations, ECS)
 *
 * **When NOT to use:**
 * - Short-lived, process-once arrays (just use a plain array)
 * - Ordered collections (removal reorders via swap)
 *
 * @example
 * ```ts
 * const vec = StableVec.create<{ x: number; y: number }>();
 * const h1 = vec.insert({ x: 1, y: 2 });
 * const h2 = vec.insert({ x: 3, y: 4 });
 *
 * vec.get(h1);          // Some({ x: 1, y: 2 })
 * vec.remove(h1);       // true
 * vec.get(h1);          // None (handle invalidated)
 * vec.isValid(h1);      // false
 *
 * // Dense iteration — no gaps
 * for (const item of vec) {
 *   console.log(item.x, item.y);
 * }
 * ```
 */

import type { Option } from "../core/option.js";
import { None, Some } from "../core/option.js";

// ── Handle ──────────────────────────────────────────────────

/**
 * An opaque reference to an element in a {@link StableVec}.
 *
 * Handles are cheap to copy (two numbers) and safe to hold long-term.
 * A handle becomes invalid when the element it points to is removed;
 * subsequent `get`/`remove` calls return `None`/`false`.
 */
export interface Handle {
  /** Slot index in the indirection table. */
  readonly index: number;
  /** Generation at the time of insertion. Mismatches mean the slot was reused. */
  readonly generation: number;
}

// ── Internal slot metadata ──────────────────────────────────

/** Maps a slot to its current position in the dense data array. */
interface SlotEntry {
  /** Index into the dense data array, or -1 if the slot is free. */
  dataIndex: number;
  /** Incremented on every removal. Stale handles have a lower generation. */
  generation: number;
}

/** Stored alongside each data element to map back to its slot. */
interface DataMeta {
  /** Which slot owns this data element. */
  slotIndex: number;
}

// ── StableVec ───────────────────────────────────────────────

/**
 * A dense, index-stable collection.
 *
 * Elements are stored contiguously for cache-friendly iteration. Handles
 * (index + generation) provide O(1) access that survives mutations.
 */
export interface StableVec<T> extends Iterable<T> {
  /** Number of live elements. */
  readonly length: number;

  /** Number of allocated slots (including free slots available for reuse). */
  readonly capacity: number;

  /** Insert an element and return its stable handle. O(1) amortized. */
  insert(value: T): Handle;

  /**
   * Remove the element referenced by `handle`. O(1).
   *
   * Returns `true` if the element was removed, `false` if the handle
   * was already invalid (stale generation or out of range).
   */
  remove(handle: Handle): boolean;

  /** Retrieve the element by handle. O(1). Returns `None` for stale handles. */
  get(handle: Handle): Option<T>;

  /** Check whether a handle still points to a live element. O(1). */
  isValid(handle: Handle): boolean;

  /** Remove all elements. Slots are freed for reuse. */
  clear(): void;

  /** Iterate over all live elements in dense order (no gaps). */
  [Symbol.iterator](): Iterator<T>;

  /** Iterate over (handle, value) pairs. */
  entries(): Iterable<[Handle, T]>;

  /**
   * Apply `fn` to each live element. Faster than `for..of` because it
   * avoids iterator protocol overhead.
   */
  forEach(fn: (value: T, handle: Handle) => void): void;

  /** Return all live elements as a plain array (snapshot, not a view). */
  toArray(): T[];
}

// ── Factory ─────────────────────────────────────────────────

function createStableVec<T>(): StableVec<T> {
  // Dense storage: data[i] and meta[i] are paired by position.
  const data: T[] = [];
  const meta: DataMeta[] = [];

  // Indirection table: slots[handle.index] → dataIndex + generation.
  const slots: SlotEntry[] = [];

  // Free list: indices of slots whose data was removed and can be reused.
  const freeSlots: number[] = [];

  function allocSlot(): number {
    if (freeSlots.length > 0) {
      return freeSlots.pop()!;
    }
    const idx = slots.length;
    slots.push({ dataIndex: -1, generation: 0 });
    return idx;
  }

  function resolveSlot(handle: Handle): SlotEntry | undefined {
    const slot = slots[handle.index];
    if (!slot) return undefined;
    if (slot.generation !== handle.generation) return undefined;
    if (slot.dataIndex < 0) return undefined;
    return slot;
  }

  const vec: StableVec<T> = {
    get length() {
      return data.length;
    },

    get capacity() {
      return slots.length;
    },

    insert(value: T): Handle {
      const slotIdx = allocSlot();
      const slot = slots[slotIdx]!;
      const dataIdx = data.length;

      data.push(value);
      meta.push({ slotIndex: slotIdx });

      slot.dataIndex = dataIdx;
      return { index: slotIdx, generation: slot.generation };
    },

    remove(handle: Handle): boolean {
      const slot = resolveSlot(handle);
      if (!slot) return false;

      const removeIdx = slot.dataIndex;
      const lastIdx = data.length - 1;

      if (removeIdx !== lastIdx) {
        // Swap with last element to keep data dense.
        data[removeIdx] = data[lastIdx]!;
        meta[removeIdx] = meta[lastIdx]!;

        // Update the swapped element's slot to point to its new position.
        const swappedSlotIdx = meta[removeIdx]!.slotIndex;
        slots[swappedSlotIdx]!.dataIndex = removeIdx;
      }

      data.pop();
      meta.pop();

      // Invalidate the removed slot: bump generation, mark free.
      slot.dataIndex = -1;
      slot.generation++;
      freeSlots.push(handle.index);

      return true;
    },

    get(handle: Handle): Option<T> {
      const slot = resolveSlot(handle);
      if (!slot) return None;
      const value = data[slot.dataIndex];
      return value !== undefined ? Some(value) : None;
    },

    isValid(handle: Handle): boolean {
      return resolveSlot(handle) !== undefined;
    },

    clear(): void {
      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i]!;
        if (slot.dataIndex >= 0) {
          slot.dataIndex = -1;
          slot.generation++;
          freeSlots.push(i);
        }
      }
      data.length = 0;
      meta.length = 0;
    },

    [Symbol.iterator](): Iterator<T> {
      let i = 0;
      return {
        next(): IteratorResult<T> {
          if (i < data.length) {
            return { done: false, value: data[i++]! };
          }
          return { done: true, value: undefined };
        },
      };
    },

    *entries(): Iterable<[Handle, T]> {
      for (let i = 0; i < data.length; i++) {
        const m = meta[i]!;
        const slot = slots[m.slotIndex]!;
        const handle: Handle = { index: m.slotIndex, generation: slot.generation };
        yield [handle, data[i]!];
      }
    },

    forEach(fn: (value: T, handle: Handle) => void): void {
      for (let i = 0; i < data.length; i++) {
        const m = meta[i]!;
        const slot = slots[m.slotIndex]!;
        fn(data[i]!, { index: m.slotIndex, generation: slot.generation });
      }
    },

    toArray(): T[] {
      return data.slice();
    },
  };

  return vec;
}

// ── Public namespace ────────────────────────────────────────

/**
 * Dense, index-stable collection with O(1) insert, remove, and access.
 *
 * @example
 * ```ts
 * const vec = StableVec.create<string>();
 * const h = vec.insert("hello");
 * vec.get(h);     // Some("hello")
 * vec.remove(h);
 * vec.get(h);     // None
 * ```
 */
export const StableVec: {
  /** Create an empty StableVec. */
  readonly create: <T>() => StableVec<T>;
} = {
  create: createStableVec,
};
