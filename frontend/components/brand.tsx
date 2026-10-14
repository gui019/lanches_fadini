import Link from "next/link";
import Image from "next/image";
export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link
      href="/"
      className={`brand ${light ? "brand-light" : ""}`}
      aria-label="Carbon's Burguer — início"
    >
      <Image src="/images/logo.webp" width={65} height={65} alt="" priority />
      <span>
        CARBON’S
        <span className="brand-sub">
          BURGUER <i>•</i> ARTESANAL
        </span>
      </span>
    </Link>
  );
}
