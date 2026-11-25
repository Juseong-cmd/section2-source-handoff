import { NextResponse } from "next/server";
import { appDescription, appIconPrefix, appShortName, appTitle } from "../../site-config";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    name: appTitle,
    short_name: appShortName,
    description: appDescription,
    start_url: "/",
    display: "standalone",
    background_color: "#f6f7fb",
    theme_color: "#1428A0",
    icons: [
      {
        src: `/${appIconPrefix}-192.png`,
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: `/${appIconPrefix}-512.png`,
        sizes: "512x512",
        type: "image/png",
      },
    ],
  });
}
