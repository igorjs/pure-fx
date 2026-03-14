/**
 * structuredClone is an HTML spec API (not ECMAScript), available in
 * Node 17+ and all modern browsers. Not included in any ES lib target.
 */
declare function structuredClone<T>(value: T): T;
