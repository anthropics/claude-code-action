import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt = "GlobalCard — Premium Card Issuing";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  return new ImageResponse(
    <div
      style={{
        background:
          "linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "sans-serif",
      }}
    >
      <div
        style={{
          fontSize: 72,
          fontWeight: 900,
          color: "white",
          marginBottom: 24,
          letterSpacing: "-2px",
        }}
      >
        GlobalCard
      </div>
      <div
        style={{
          fontSize: 28,
          color: "rgba(255,255,255,0.75)",
          textAlign: "center",
          maxWidth: 700,
        }}
      >
        Premium Card Issuing for 25 Countries
      </div>
      <div
        style={{
          fontSize: 18,
          color: "rgba(255,255,255,0.45)",
          marginTop: 32,
        }}
      >
        Virtual & Physical Cards · 8 Plan Tiers · Instant Issuance
      </div>
    </div>,
    { ...size },
  );
}
