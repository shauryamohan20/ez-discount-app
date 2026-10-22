import type { CSSProperties } from "react";

import type { DemoLine, PreviewResult } from "../lib/preview";
import { DEMO_SHIPPING } from "../lib/preview";
import type { LineNote } from "../lib/preview-explain";
import { ProductArt } from "./ProductArt";

/**
 * The demo cart's colours. Purple marks what the discount touched, green
 * what was taken off, and orange a line the discount skipped.
 */
const COLOR = {
  text: "#303030",
  subdued: "#616161",
  border: "#E3E3E3",
  surface: "#FFFFFF",
  accent: "#7458F0",
  accentSurface: "#F6F3FF",
  success: "#0C7A43",
  skipped: "#B9480F",
};

const FONT =
  "Inter, -apple-system, BlinkMacSystemFont, 'San Francisco', 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif";

const styles = {
  tile: {
    fontFamily: FONT,
    color: COLOR.text,
    background: COLOR.surface,
    border: `1px solid ${COLOR.border}`,
    borderRadius: 14,
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  },
  heading: { fontSize: 13, color: COLOR.subdued, fontWeight: 500 },
  line: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: 10,
    borderRadius: 12,
    border: `1px solid ${COLOR.border}`,
    background: COLOR.surface,
    transition: "border-color 160ms ease, background-color 160ms ease",
  },
  lineEmpty: { borderStyle: "dashed", background: "transparent" },
  lineApplied: {
    border: `1.5px solid ${COLOR.accent}`,
    background: COLOR.accentSurface,
  },
  details: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  },
  title: { fontSize: 14, fontWeight: 650, lineHeight: 1.3 },
  price: { fontSize: 13, color: COLOR.subdued },
  noteApplied: { fontSize: 13, fontWeight: 600, color: COLOR.success },
  noteSkipped: { fontSize: 13, fontWeight: 600, color: COLOR.skipped },
  noteDetail: { fontSize: 12, color: COLOR.subdued },
  stepper: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    border: `1px solid ${COLOR.border}`,
    borderRadius: 999,
    background: COLOR.surface,
    padding: "0 2px",
    flexShrink: 0,
  },
  count: {
    minWidth: 20,
    textAlign: "center",
    fontSize: 14,
    fontWeight: 600,
    fontVariantNumeric: "tabular-nums",
  },
  totals: {
    borderTop: `1px solid ${COLOR.border}`,
    paddingTop: 10,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 12,
    fontSize: 14,
    fontVariantNumeric: "tabular-nums",
  },
  total: { fontSize: 15, fontWeight: 700 },
  totalAmount: { fontSize: 20, fontWeight: 700 },
} satisfies Record<string, CSSProperties>;

function Note({
  note,
  money,
}: {
  note: LineNote | undefined;
  money: (amount: number) => string;
}) {
  if (!note) return null;

  switch (note.state) {
    case "applied":
      return (
        <span style={styles.noteApplied}>
          ✓ {note.label}: {money(note.amount)} off
        </span>
      );
    case "none":
      return (
        <>
          <span style={styles.noteSkipped}>✕ {note.label}</span>
          <span style={styles.noteDetail}>{note.detail}</span>
        </>
      );
    case "counts":
      return <span style={styles.noteDetail}>{note.label}</span>;
    default:
      return <span style={styles.noteDetail}>Not in the cart</span>;
  }
}

type Props = {
  lines: DemoLine[];
  result: PreviewResult;
  notes: Map<string, LineNote>;
  money: (amount: number) => string;
  onQuantity: (line: DemoLine, delta: number) => void;
};

/** The demo cart tile: a card per line, then the totals. */
export function DemoCart({ lines, result, notes, money, onQuantity }: Props) {
  // Free shipping shows on the shipping row, so it is not counted again here,
  // which keeps the rows adding up to the total.
  const discount = result.productDiscount + result.orderDiscount;
  const freeShipping =
    result.shippingPrice > 0 && result.shippingDiscount >= result.shippingPrice;

  return (
    <div style={styles.tile}>
      <span style={styles.heading}>Cart</span>

      {lines.map((line) => {
        const note = notes.get(line.id);
        const applied = note?.state === "applied";
        const empty = line.quantity === 0;

        return (
          <div
            key={line.id}
            style={{
              ...styles.line,
              ...(empty ? styles.lineEmpty : {}),
              ...(applied ? styles.lineApplied : {}),
            }}
          >
            <ProductArt art={line.art} tint={line.tint} faded={empty} />

            <div style={styles.details}>
              <span style={styles.title}>{line.title}</span>
              <span style={styles.price}>
                {money(line.unitPrice)}
                {line.quantity > 1 ? ` × ${line.quantity}` : ""}
              </span>
              <Note note={note} money={money} />
            </div>

            <div style={styles.stepper}>
              <s-button
                variant="tertiary"
                icon="minus"
                accessibilityLabel={`One less ${line.title}`}
                {...(empty ? { disabled: true } : {})}
                onClick={() => onQuantity(line, -1)}
              />
              <span style={styles.count}>{line.quantity}</span>
              <s-button
                variant="tertiary"
                icon="plus"
                accessibilityLabel={`One more ${line.title}`}
                onClick={() => onQuantity(line, 1)}
              />
            </div>
          </div>
        );
      })}

      <div style={styles.totals}>
        <div style={styles.row}>
          <span>Subtotal</span>
          <span style={{ fontWeight: 600 }}>{money(result.subtotal)}</span>
        </div>

        {discount > 0 && (
          <div style={styles.row}>
            <span>Discount applied</span>
            <span style={{ fontWeight: 600, color: COLOR.accent }}>
              −{money(discount)}
            </span>
          </div>
        )}

        <div style={styles.row}>
          <span>{DEMO_SHIPPING.title}</span>
          {result.shippingPrice === 0 ? (
            <span style={{ color: COLOR.subdued }}>Empty cart</span>
          ) : freeShipping ? (
            <span>
              <s style={{ color: COLOR.subdued, marginRight: 6 }}>
                {money(result.shippingPrice)}
              </s>
              <span style={{ fontWeight: 600, color: COLOR.success }}>
                Free
              </span>
            </span>
          ) : (
            <span style={{ fontWeight: 600 }}>
              {money(result.shippingPrice - result.shippingDiscount)}
            </span>
          )}
        </div>

        <div style={styles.row}>
          <span style={styles.total}>Total</span>
          <span style={styles.totalAmount}>{money(result.total)}</span>
        </div>
      </div>
    </div>
  );
}
