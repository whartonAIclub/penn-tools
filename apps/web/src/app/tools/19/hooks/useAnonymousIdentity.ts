import { useEffect, useState } from "react";

export function useAnonymousIdentity() {
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem("compass_anon_id");
    if (stored) {
      setUserId(stored);
    } else {
      const newId = `anon_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      localStorage.setItem("compass_anon_id", newId);
      setUserId(newId);
    }
  }, []);

  return { userId };
}
