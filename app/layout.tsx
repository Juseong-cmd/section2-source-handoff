import type { Metadata } from "next";
import type { ReactNode } from "react";
import { appAppleTouchIcon, appDescription, appIconPrefix, appShortName, appTitle } from "./site-config";
import "./globals.css";
import "./day-detail-readable.css";
import "./day-detail-workspace.css";
import "./lounge/lounge.css";
import "./bay/bay.css";
import "./common-events/common-events.css";
import "./continuous-attendance.css";

export const metadata: Metadata = {
  title: appTitle,
  description: appDescription,
  icons: {
    icon: [
      { url: `/${appIconPrefix}-192.png`, sizes: "192x192", type: "image/png" },
      { url: `/${appIconPrefix}-512.png`, sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: appAppleTouchIcon, sizes: "180x180", type: "image/png" }],
  },
  manifest: "/api/manifest",
  appleWebApp: {
    capable: true,
    title: appShortName,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
