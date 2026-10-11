// src/app/page.tsx
//
// The home page. For now it's the F1 intro, which ends on the page's loading
// placeholders. F2 builds the real content into that page.

import LaunchIntro from "@/components/launch/LaunchIntro";

export default function Home() {
  return <LaunchIntro />;
}
