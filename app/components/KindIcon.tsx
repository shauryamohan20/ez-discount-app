import { ACCENT, ACCENT_SURFACE } from "../lib/brand";

export type DiscountKindIcon = "quantity" | "order" | "bxgy";

/** One drawing per kind of discount, on a 24 by 24 grid. */
function Drawing({ kind }: { kind: DiscountKindIcon }) {
  const line = {
    fill: "none",
    stroke: ACCENT,
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (kind) {
    // Items stacking up: more items, more off.
    case "quantity":
      return (
        <>
          <rect x="4" y="13" width="7" height="7" rx="1.5" {...line} />
          <rect x="13" y="13" width="7" height="7" rx="1.5" {...line} />
          <rect x="8.5" y="4" width="7" height="7" rx="1.5" {...line} />
        </>
      );
    // A receipt: the whole order.
    case "order":
      return (
        <>
          <path
            d="M6 3.5h12v17l-2.4-1.5-2.4 1.5-2.4-1.5-2.4 1.5L6 20.5Z"
            {...line}
          />
          <path d="M9 8.5h6M9 12h6M9 15.5h3.5" {...line} />
        </>
      );
    // A gift: something free with what you buy.
    default:
      return (
        <>
          <rect x="4" y="9" width="16" height="4" rx="1" {...line} />
          <path d="M5.5 13v7.5h13V13M12 9v11.5" {...line} />
          <path
            d="M12 9C10.5 5.5 6.5 5.5 7.2 7.6 7.7 9 12 9 12 9ZM12 9c1.5-3.5 5.5-3.5 4.8-1.4C16.3 9 12 9 12 9Z"
            {...line}
          />
        </>
      );
  }
}

/** The kind of discount as an icon in the app's accent colour. */
export function KindIcon({ kind }: { kind: DiscountKindIcon }) {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{
        flexShrink: 0,
        padding: 7,
        borderRadius: 10,
        background: ACCENT_SURFACE,
        boxSizing: "border-box",
      }}
    >
      <Drawing kind={kind} />
    </svg>
  );
}
