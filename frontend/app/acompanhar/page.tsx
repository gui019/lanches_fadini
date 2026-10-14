"use client";
import { useEffect, useState } from "react";
import { ArrowRight, PackageSearch } from "lucide-react";
import { SimpleHeader } from "@/components/simple-header";
export default function FindOrder() {
  const [value, setValue] = useState(""),
    [error, setError] = useState(""),
    [last, setLast] = useState("");
  useEffect(() => {
    setLast(sessionStorage.getItem("carbons-last-order") || "");
  }, []);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const token = value.trim().split("/").filter(Boolean).pop() || "";
    if (!/^[a-f0-9]{64}$/.test(token)) {
      setError(
        "Cole o link completo ou o token de 64 caracteres do seu pedido.",
      );
      return;
    }
    window.location.assign(`/acompanhar/${token}`);
  }
  return (
    <>
      <SimpleHeader />
      <main className="tracking-form">
        <PackageSearch size={36} strokeWidth={1.4} />
        <span className="eyebrow">CADA ETAPA, BEM PERTINHO</span>
        <h1>Cadê meu burguer?</h1>
        <p>
          Cole o link de acompanhamento recebido ao finalizar o pedido. Não
          precisa criar conta.
        </p>
        <form onSubmit={submit}>
          <label className="field">
            Seu link de acompanhamento
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              placeholder="Cole seu link aqui"
              required
              autoComplete="off"
            />
          </label>
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          <button className="button button-yellow full">
            Acompanhar pedido
            <ArrowRight size={17} />
          </button>
        </form>
        {last && (
          <a
            className="button button-outline full"
            style={{ marginTop: 15 }}
            href={`/acompanhar/${last}`}
          >
            Ver meu último pedido nesta sessão
          </a>
        )}
      </main>
    </>
  );
}
