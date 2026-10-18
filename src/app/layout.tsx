import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import "./brand-fonts.css"; // the brand font candidates (see src/lib/brand-font.ts)

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// What shows when someone shares a link to the site (WhatsApp, Discord, Instagram
// DMs, X...): the title, a line, and the picture in public/og.png (1200 x 630).
// Link previews need the full address of that picture, so it's built from
// APP_URL (the site's address, set in .env.local and on the live server).
const DESCRIPTION = "Small streamers keep streaming as usual. Bigger creators find you, scout you, draft you and help you grow for a whole season. Launching soon: join the draft.";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.APP_URL ?? "http://localhost:3000"),
  title: "StreamerDraft | Launching soon",
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "StreamerDraft",
    title: "StreamerDraft: Nobody's watching. Yet.",
    description: DESCRIPTION,
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "StreamerDraft: Nobody's watching. Yet. Launching soon." }],
  },
  twitter: {
    card: "summary_large_image",
    title: "StreamerDraft: Nobody's watching. Yet.",
    description: DESCRIPTION,
    images: ["/og.png"],
  },
};

// Black browser bars on phones, so they blend into the intro's black screen.
export const viewport: Viewport = {
  themeColor: "#000000",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
