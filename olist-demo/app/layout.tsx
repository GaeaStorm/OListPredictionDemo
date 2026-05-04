import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Olist Delivery Promise Demo",
  description:
    "Shop sample orders and see how delivery estimates change by destination and purchase date. Powered by an asymmetric ML delivery model trained on Brazilian e-commerce data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
