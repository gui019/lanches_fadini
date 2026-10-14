"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, MapPin, Phone, Truck } from "lucide-react";
import { api } from "@/lib/api";
import { money, paymentLabels } from "@/lib/types";
import { SimpleHeader } from "./simple-header";
import { Modal } from "./modal";
type Stop = {
  id: string;
  position: number;
  status: string;
  order_code: string;
  customer_name: string;
  address: {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    cep: string;
    complement: string;
  };
  phone: string;
  total: number;
  payment_status: string;
  payment_method: string;
  change_for: number | null;
};
type Run = { name: string; expires_at: string; stops: Stop[] };
export default function Driver({ token }: { token: string }) {
  const [run, setRun] = useState<Run | null>(null),
    [error, setError] = useState(""),
    [selected, setSelected] = useState<Stop | null>(null),
    [busy, setBusy] = useState(false);
  const refresh = useCallback(
    () =>
      api<Run>(`/delivery/${token}`)
        .then((data) => {
          setRun(data);
          setError("");
        })
        .catch((e) => {
          setRun(null);
          setError(e.message);
        }),
    [token],
  );
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 30000);
    return () => clearInterval(timer);
  }, [refresh]);
  async function update(stop: Stop, status: string) {
    setBusy(true);
    try {
      await api(`/delivery/${token}/stops/${stop.id}`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      setSelected(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SimpleHeader />
      <main className="narrow-page">
        <span className="eyebrow">
          <Truck size={15} /> ÁREA DO ENTREGADOR
        </span>
        <h1 className="page-title">{run?.name || "Sua rota"}</h1>
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        {run && (
          <>
            <p className="page-lead">
              {run.stops.filter((s) => s.status === "delivered").length} de{" "}
              {run.stops.length} entregas concluídas. Link válido até{" "}
              {new Date(run.expires_at).toLocaleTimeString("pt-BR", {
                timeZone: "America/Sao_Paulo",
                hour: "2-digit",
                minute: "2-digit",
              })}
              . Confirme o pagamento antes de marcar uma entrega.
            </p>
            {run.stops.map((stop) => (
              <section className="route-stop" key={stop.id}>
                <span
                  className={`status-badge ${stop.status === "delivered" ? "completed" : ""}`}
                >
                  {stop.status === "delivered"
                    ? "Entregue"
                    : stop.status === "not_found"
                      ? "Não localizado"
                      : stop.status === "payment_issue"
                        ? "Problema no pagamento"
                        : `Parada ${stop.position}`}
                </span>
                <h2 style={{ marginTop: 15 }}>
                  {stop.order_code} · {stop.customer_name}
                </h2>
                <p>
                  <MapPin size={14} /> {stop.address.street},{" "}
                  {stop.address.number} · {stop.address.neighborhood}
                </p>
                <p>
                  {stop.address.city} · {stop.address.cep}{" "}
                  {stop.address.complement && `· ${stop.address.complement}`}
                </p>
                <p>
                  <b>{money(stop.total)}</b> ·{" "}
                  {paymentLabels[stop.payment_method]} ·{" "}
                  {stop.payment_status === "paid"
                    ? "Já pago"
                    : "Receber na entrega"}
                </p>
                {stop.change_for && <p>Troco para {money(stop.change_for)}</p>}
                <a className="back-link" href={`tel:+55${stop.phone}`}>
                  <Phone size={14} />
                  Ligar para o cliente
                </a>
                {stop.status !== "delivered" && (
                  <div className="route-actions">
                    <button
                      className="button button-yellow"
                      disabled={busy}
                      onClick={() => setSelected(stop)}
                    >
                      <Check size={15} />
                      Confirmar entrega
                    </button>
                    <button
                      className="button button-outline"
                      disabled={busy}
                      onClick={() => update(stop, "not_found")}
                    >
                      Não localizado
                    </button>
                    <button
                      className="button button-outline"
                      disabled={busy}
                      onClick={() => update(stop, "payment_issue")}
                    >
                      Problema no pagamento
                    </button>
                  </div>
                )}
              </section>
            ))}
          </>
        )}
        <Modal
          open={!!selected}
          onClose={() => setSelected(null)}
          title="Confirmar entrega e recebimento"
        >
          <div style={{ padding: 25 }}>
            <p className="muted small" style={{ marginBottom: 20 }}>
              Confirma que o pedido {selected?.order_code} foi entregue e que{" "}
              {selected?.payment_status === "paid"
                ? "o pagamento já estava confirmado"
                : `você recebeu ${money(selected?.total || 0)}`}
              ? Essa ação conclui o pedido.
            </p>
            <button
              className="button button-yellow full"
              disabled={busy}
              onClick={() => selected && update(selected, "delivered")}
            >
              Sim, entrega e pagamento conferidos
            </button>
          </div>
        </Modal>
      </main>
    </>
  );
}
