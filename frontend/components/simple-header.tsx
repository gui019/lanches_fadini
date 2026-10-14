import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand } from "./brand";
export function SimpleHeader() {
  return (
    <header className="simple-header">
      <div className="container">
        <Brand />
        <Link href="/#cardapio" className="back-link">
          <ArrowLeft size={15} />
          Voltar ao cardápio
        </Link>
      </div>
    </header>
  );
}
