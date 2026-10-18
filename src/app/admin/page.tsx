// src/app/admin/page.tsx
//
// The admin dashboard: /admin. Not linked from anywhere, kept out of search
// engines, and useless without the password: everything it shows comes from
// the /api/admin routes, which check the login first.
// The dashboard itself: src/components/admin/AdminApp.tsx.

import type { Metadata } from "next";
import { AdminApp } from "@/components/admin/AdminApp";

export const metadata: Metadata = {
  title: "Admin | StreamerDraft",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

export default function Admin() {
  return <AdminApp />;
}
