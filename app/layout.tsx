import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { createSiteConfig } from "@/lib/site-config";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const site = createSiteConfig(process.env);
const title = "Astra Lexa — Daily Crossword & Word Quest";
const description = "Play a free daily crossword or create a seeded word quest with accessible keyboard, touch, hints, review, and browser-local progress.";
const socialImage = site.publicUrl("og-image.png");

export const metadata: Metadata = {
  metadataBase: site.siteUrl,
  title: {
    default: title,
    template: "%s | Astra Lexa",
  },
  description,
  applicationName: "Astra Lexa",
  category: "games",
  keywords: ["daily crossword", "word puzzle", "word search", "vocabulary game", "accessible game"],
  alternates: {
    canonical: site.canonicalUrl,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Astra Lexa",
    title,
    description,
    url: site.siteUrl,
    images: [{ url: socialImage, width: 1200, height: 630, alt: "Astra Lexa daily crossword and word quest" }],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [socialImage],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  colorScheme: "dark",
  themeColor: "#020817",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
