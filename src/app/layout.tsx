import type { Metadata, Viewport } from "next";
import "./globals.css";
import { AppShell } from "@/components/layout/AppShell";
import { LedgerProvider } from "@/lib/store";

export const metadata: Metadata = {
  metadataBase: new URL("https://khizer.shahzebzada.net"),
  title: "KHIZER LEDGER",
  description: "Property ledger",
  applicationName: "Khizer Ledger",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    title: "Khizer Ledger",
    description: "Property ledger",
    url: "https://khizer.shahzebzada.net",
    siteName: "KHIZER LEDGER",
    type: "website",
  },
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/icon.png", type: "image/png", sizes: "192x192" },
    ],
    apple: [{ url: "/apple-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    title: "Khizer Ledger",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#030D18",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en">
      <body className="min-h-dvh bg-background font-sans text-foreground antialiased">
        <LedgerProvider>
          <AppShell>{children}</AppShell>
        </LedgerProvider>
      </body>
    </html>
  );
}
