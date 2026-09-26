/** A localStorage stand-in whose keys enumerate like the real one's. */
export function fakeStorage(): Storage {
  const store: Record<string, string> = {};
  const api = {
    getItem: (k: string) => (k in store ? store[k]! : null),
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    key: (i: number) => Object.keys(store)[i] ?? null,
    get length() { return Object.keys(store).length; },
  };
  // Object.keys(localStorage) must list stored keys and nothing else.
  return new Proxy(store, {
    get: (_t, p) => (p in api ? (api as Record<string | symbol, unknown>)[p] : store[p as string]),
    ownKeys: () => Reflect.ownKeys(store),
    getOwnPropertyDescriptor: (_t, p) => Reflect.getOwnPropertyDescriptor(store, p),
  }) as unknown as Storage;
}
