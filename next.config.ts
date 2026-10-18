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
  //
  // TESTING COPY AND SHARE ON YOUR PHONE
  // Over Wi-Fi (http://192.168...) the page isn't "secure", so phones switch
  // off copying and the share menu (src/components/page/clipboard.ts). To get
  // a secure https:// address for your laptop, run a Cloudflare quick tunnel
  // in a second terminal (install once: winget install --id Cloudflare.cloudflared):
  //     cloudflared tunnel --url http://localhost:3000
  // It prints an https://something.trycloudflare.com address: open that on
  // your phone. The last pattern below lets that address through.
  allowedDevOrigins: ["192.168.*.*", "10.*.*.*", "172.*.*.*", "*.trycloudflare.com"],

  // The personal-use fonts (Bockley, Paperbreak, Neoradical: src/app/brand-fonts.css)
  // are only for comparing on your own computer. Their licences don't allow
  // them online, so even if the files end up on the server by mistake, the
  // live site answers "not found" instead of handing them out.
  async rewrites() {
    if (process.env.NODE_ENV !== "production") return [];
    return {
      beforeFiles: [{ source: "/fonts/:file(bockley|paperbreak|neoradical)\\.otf", destination: "/not-a-page" }],
      afterFiles: [],
      fallback: [],
    };
  },
};

export default nextConfig;
