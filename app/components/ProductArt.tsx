import type { DemoArt } from "../lib/preview";

/** Soft background and a deeper ink for each colour a picture can use. */
const PALETTES = [
  { background: "#FDEBE1", ink: "#D9734A" },
  { background: "#ECE8FE", ink: "#7058E8" },
  { background: "#DEF4E8", ink: "#2E9466" },
  { background: "#E1EEFB", ink: "#3A7FC4" },
  { background: "#F7EEDB", ink: "#B5853A" },
];

/** One simple drawing per kind of item, on a 48 by 48 grid. */
function Drawing({ art, ink }: { art: DemoArt; ink: string }) {
  switch (art) {
    case "tshirt":
      return (
        <path
          d="M18 11 L10 15.5 L12.5 22 L16 20.5 V37 H32 V20.5 L35.5 22 L38 15.5 L30 11 C29 14 26.8 15.5 24 15.5 C21.2 15.5 19 14 18 11 Z"
          fill={ink}
        />
      );
    case "hoodie":
      return (
        <>
          <path
            d="M17 13 L10 18 L12.5 24 L16 22.5 V38 H32 V22.5 L35.5 24 L38 18 L31 13 C30 9.5 27.3 8 24 8 C20.7 8 18 9.5 17 13 Z"
            fill={ink}
          />
          <path
            d="M20 14 C20.5 17 22 18.5 24 18.5 C26 18.5 27.5 17 28 14"
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity="0.7"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
          <rect
            x="19"
            y="28"
            width="10"
            height="5"
            rx="1.5"
            fill="#FFFFFF"
            fillOpacity="0.35"
          />
        </>
      );
    case "cap":
      return (
        <>
          <path
            d="M11 29 C11 20 16.8 14 24 14 C31.2 14 37 20 37 29 Z"
            fill={ink}
          />
          <path
            d="M9 29 H33 C37 29 40 30.5 41 33 H9 Z"
            fill={ink}
            fillOpacity="0.75"
          />
          <circle cx="24" cy="14" r="1.8" fill={ink} />
        </>
      );
    case "socks":
      return (
        <>
          <path
            d="M19 9 H28 V27 C28 30 29 31 31 32.5 L35 35.5 C37.5 37.5 36.5 41 33.5 41 H27 C24 41 22 40 20.5 37.5 L19.5 35.8 C19 35 19 34 19 33 Z"
            fill={ink}
          />
          <rect
            x="19"
            y="9"
            width="9"
            height="4"
            fill="#FFFFFF"
            fillOpacity="0.4"
          />
        </>
      );
    case "box":
      return (
        <>
          <path
            d="M24 9 L38 16 V32 L24 39 L10 32 V16 Z"
            fill={ink}
            fillOpacity="0.85"
          />
          <path
            d="M10 16 L24 23 L38 16"
            fill="none"
            stroke="#FFFFFF"
            strokeOpacity="0.6"
            strokeWidth="1.6"
          />
          <path
            d="M24 23 V39"
            stroke="#FFFFFF"
            strokeOpacity="0.6"
            strokeWidth="1.6"
          />
        </>
      );
    case "tag":
      return (
        <>
          <path
            d="M25 9 H37 C38.1 9 39 9.9 39 11 V23 L22.5 39.5 C21.7 40.3 20.5 40.3 19.7 39.5 L8.5 28.3 C7.7 27.5 7.7 26.3 8.5 25.5 Z"
            fill={ink}
          />
          <circle
            cx="32.5"
            cy="15.5"
            r="2.6"
            fill="#FFFFFF"
            fillOpacity="0.85"
          />
        </>
      );
    default:
      return (
        <>
          <path d="M12 17 H36 L34 39 H14 Z" fill={ink} />
          <path
            d="M18.5 19 V15.5 C18.5 12.5 21 10 24 10 C27 10 29.5 12.5 29.5 15.5 V19"
            fill="none"
            stroke={ink}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
        </>
      );
  }
}

type Props = {
  art: DemoArt;
  tint: number;
  size?: number;
  /** Faded, for an item that is not in the cart. */
  faded?: boolean;
};

/**
 * A placeholder product picture for the demo cart. Drawn inline, so the app
 * needs no image hosting and the picture is there the moment the cart is.
 */
export function ProductArt({ art, tint, size = 56, faded = false }: Props) {
  const palette = PALETTES[tint % PALETTES.length];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      role="img"
      aria-hidden="true"
      style={{
        flexShrink: 0,
        borderRadius: 10,
        background: palette.background,
        opacity: faded ? 0.5 : 1,
      }}
    >
      <Drawing art={art} ink={palette.ink} />
    </svg>
  );
}
