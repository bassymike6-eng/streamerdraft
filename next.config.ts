import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,

  // Only matters for `npm run dev` when you open the site from your phone.
  //
  // In dev, the page keeps a live link (a websocket) back to your laptop so it
  // can reload when you save. Next 16 only lets that link through from
  // addresses listed here. If it's blocked, the page still LOOKS right but its
  // JavaScript never switches on, so taps do nothing.
  //
  // These patterns are your laptop's address on a home network (192.168...),
  // other routers (10...), and phone hotspots / college Wi-Fi (172...).
  // If the terminal ever says "Blocked cross-origin request ... from "x.x.x.x"",
  // add that exact address here and restart `npm run dev`.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*"],
};

export default nextConfig;