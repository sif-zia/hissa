import { useEffect, useState } from "preact/hooks";

/**
 * The browser's idea of whether there is a network. It can say "online" on a
 * dead connection, so anything that talks to the server still handles its
 * own failure; this is only for saying so *before* someone tries.
 */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    addEventListener("online", on);
    addEventListener("offline", off);
    return () => {
      removeEventListener("online", on);
      removeEventListener("offline", off);
    };
  }, []);
  return online;
}
