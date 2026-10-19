import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "SISMADAK Data Exporter",
  description: "Periksa dan ekspor data SISMADAK secara lokal",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
