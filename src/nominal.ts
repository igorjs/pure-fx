// ═══════════════════════════════════════════════════════════════════════════════
// Nominal Types (Zero Runtime)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Nominal typing via phantom brand. Zero runtime cost - pure type-level.
 *
 * Parameter order reads as English: "Type UserId is a string".
 *
 *   type UserId = Type<'UserId', string>;
 *   type PostId = Type<'PostId', string>;
 *   type Latitude = Type<'Latitude', number>;
 *
 *   const userId = 'u_001' as UserId;
 *   const postId = 'p_001' as PostId;
 *
 *   function getUser(id: UserId) { ... }
 *   getUser(userId)   // ✓
 *   getUser(postId)   // TS error: PostId is not assignable to UserId
 *
 * Pairs with Schema for validated construction:
 *
 *   const UserId = Schema.string
 *     .refine(s => s.startsWith('u_'), 'UserId format')
 *     .transform(s => s as Type<'UserId', string>);
 */
declare const __brand: unique symbol;

export type Type<Name extends string, Base> = Base & { readonly [__brand]: Name };
