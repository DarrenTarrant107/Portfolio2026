"use client";

import { Eye } from "lucide-react";
import { useEffect, useState } from "react";

// Free public counter: /hit adds one view and returns the total, /get only reads it.
// https://abacus.jasoncameron.dev
const COUNTER_URL = "https://abacus.jasoncameron.dev";
const COUNTER_KEY = "portfolio-views";
const COUNTED_FLAG = "view-counted";

/**
 * "1,234 views" for the footer. A visit counts once per browser tab session, and only
 * on the live site, so reloads, local builds and preview deploys don't add to it.
 * Renders nothing until the number arrives, or at all if the counter can't be reached.
 */
export function ViewCount({ namespace, siteUrl }: { namespace: string; siteUrl: string }) {
  const [views, setViews] = useState<number | null>(null);

  useEffect(() => {
    const live = location.hostname === new URL(siteUrl).hostname;
    let counted = false;
    try {
      counted = sessionStorage.getItem(COUNTED_FLAG) === "1";
    } catch {}
    const action = live && !counted ? "hit" : "get";

    const controller = new AbortController();
    fetch(`${COUNTER_URL}/${action}/${namespace}/${COUNTER_KEY}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { value?: unknown } | null) => {
        if (typeof data?.value !== "number") return;
        if (action === "hit") {
          try {
            sessionStorage.setItem(COUNTED_FLAG, "1");
          } catch {}
        }
        setViews(data.value);
      })
      // A nice-to-have: if the counter service is down, the footer simply leaves it out.
      .catch(() => {});
    return () => controller.abort();
  }, [namespace, siteUrl]);

  if (views === null) return null;
  return (
    <span>
      {" · "}
      <span className="inline-flex items-center gap-1 align-bottom">
        <Eye className="size-3.5" aria-hidden="true" />
        {views.toLocaleString("en-US")} {views === 1 ? "view" : "views"}
      </span>
    </span>
  );
}
