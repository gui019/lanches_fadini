import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: {
    default: "Carbon's Burguer | Sua sexta tem mais sabor",
    template: "%s | Carbon's Burguer",
  },
  description:
    "Hambúrgueres artesanais com carne VPJ Angus em Pirassununga. Monte seu lanche, agende para sexta-feira e escolha entrega ou retirada.",
  robots: { index: false, follow: false },
  icons: { icon: "/icon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
