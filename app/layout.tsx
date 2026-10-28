export const metadata = { title: "A.S Auto — AI Invoice Assistant" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", maxWidth: 760, margin: "32px auto", padding: "0 16px", color: "#1d2330" }}>{children}</body>
    </html>
  );
}
