"use client";
import { useCallback, useEffect, useState } from "react";
import {
  CalendarDays,
  Check,
  Clock3,
  Copy,
  ExternalLink,
  MapPin,
  MessageCircle,
  RefreshCw,
  ShieldCheck,
  ShoppingBag,
  Wallet,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  type Order,
  dateLabel,
  money,
  paymentLabels,
  statusLabels,
} from "@/lib/types";
import { SimpleHeader } from "./simple-header";
import { Modal } from "./modal";
export default function Tracking({ token }: { token: string }) {
  const [order, setOrder] = useState<Order | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [confirm, setConfirm] = useState(false),
    [copied, setCopied] = useState(""),
    [remaining, setRemaining] = useState("");
  const refresh = useCallback(async () => {
    try {
      setOrder(await api<Order>(`/orders/${token}`));
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [token]);
  useEffect(() => {
    refresh();
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, 15000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!order?.expires_at) return;
    const timer = setInterval(() => {
      const seconds = Math.max(
        0,
        Math.ceil((new Date(order.expires_at!).getTime() - Date.now()) / 1000),
      );
      setRemaining(
        `${Math.floor(seconds / 60)
          .toString()
          .padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`,
      );
    }, 1000);
    return () => clearInterval(timer);
  }, [order?.expires_at]);
  async function cancel() {
    setBusy(true);
    try {
      setOrder(await api<Order>(`/orders/${token}/cancel`, { method: "POST" }));
      setConfirm(false);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function pix() {
    setBusy(true);
    try {
      setOrder(
        await api<Order>("/payments/pix", {
          method: "POST",
          body: JSON.stringify({ token }),
        }),
      );
      setError("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function copy(text: string, key: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
    } catch {
      setError(
        "Não foi possível copiar automaticamente. Selecione e copie o texto.",
      );
    }
  }
  const terminal =
    order && ["completed", "cancelled", "expired"].includes(order.status);
  return (
    <>
      <SimpleHeader />
      <main className="narrow-page">
        {error && (
          <div className="error-box" role="alert">
            {error}
            <button
              className="back-link"
              style={{ display: "block", margin: "12px 0 0" }}
              onClick={refresh}
            >
              Tentar atualizar
            </button>
          </div>
        )}
        {!order ? (
          !error && <div className="empty-state">Buscando seu pedido…</div>
        ) : (
          <>
            {order.demo_mode && (
              <div className="notice">
                Pedido de demonstração · Nenhuma venda ou cobrança real foi
                realizada.
              </div>
            )}
            <div className="tracking-header">
              <div>
                <span className="eyebrow">ACOMPANHAMENTO DO PEDIDO</span>
                <h1>{order.code}</h1>
              </div>
              <span className={`status-badge ${order.status}`}>
                {statusLabels[order.status]}
              </span>
            </div>
            <div className="tracking-greeting">
              <h2>
                {order.status === "cancelled"
                  ? "Tudo certo com o cancelamento."
                  : order.status === "expired"
                    ? "A reserva deste pedido expirou."
                    : order.status === "completed"
                      ? `Valeu pela companhia, ${order.customer_name}!`
                      : `Oi, ${order.customer_name}. Já estamos por aqui.`}
              </h2>
              <p>
                {order.status === "pending_approval"
                  ? "A equipe vai conferir seu pedido e confirmar a previsão. Você pode acompanhar tudo por este link."
                  : order.status === "pending_payment"
                    ? "Seu pedido ficará reservado por até 30 minutos. A confirmação do Pix é feita pelo Mercado Pago."
                    : order.status === "cancelled"
                      ? order.payment_status === "refund_pending"
                        ? "O pedido foi cancelado. O reembolso Pix está em processamento."
                        : "O estoque reservado foi liberado. Esperamos você em uma próxima sexta."
                      : "Cada etapa do seu pedido aparece aqui. Guarde este link com você."}
              </p>
              {order.estimate && (
                <strong className="estimate">
                  <Clock3 size={16} /> Previsão: {order.estimate}
                </strong>
              )}
            </div>
            {order.status === "pending_payment" && (
              <section className="tracking-card pix-box">
                <h2>Pague com Pix</h2>
                <p className="muted small">
                  Tempo de reserva: <b>{remaining || "30:00"}</b>
                </p>
                {order.pix ? (
                  <>
                    <img
                      src={`data:image/png;base64,${order.pix.qr_base64}`}
                      alt="QR Code para pagamento Pix do pedido"
                    />
                    <textarea
                      aria-label="Código Pix Copia e Cola"
                      readOnly
                      value={order.pix.copy_paste}
                    />
                    <button
                      className="button button-yellow"
                      onClick={() => copy(order.pix!.copy_paste, "pix")}
                    >
                      <Copy size={16} />
                      {copied === "pix"
                        ? "Código copiado"
                        : "Copiar código Pix"}
                    </button>
                    <p className="muted small" style={{ marginTop: 15 }}>
                      Só o retorno validado do provedor confirma o pagamento.
                    </p>
                  </>
                ) : (
                  <button
                    className="button button-yellow"
                    disabled={busy}
                    onClick={pix}
                  >
                    {busy ? "Gerando…" : "Gerar QR Code Pix"}
                  </button>
                )}
              </section>
            )}
            <div className="tracking-columns">
              <div>
                <section className="tracking-card">
                  <h2>O caminho do seu pedido</h2>
                  <ol className="timeline">
                    {order.history.map((event, i) => (
                      <li key={`${event.created_at}-${i}`}>
                        <span className="timeline-icon">
                          <Check size={12} />
                        </span>
                        <div>
                          <b>{event.message}</b>
                          <small>
                            {new Date(event.created_at).toLocaleString(
                              "pt-BR",
                              {
                                timeZone: "America/Sao_Paulo",
                                day: "2-digit",
                                month: "2-digit",
                                hour: "2-digit",
                                minute: "2-digit",
                              },
                            )}
                          </small>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
                <section className="tracking-card">
                  <h2>O que vai na sua sacola</h2>
                  {order.items.map((item, i) => (
                    <div className="order-line" key={i}>
                      <div>
                        <b>
                          {item.quantity}× {item.name}
                        </b>
                        {item.removed.length > 0 && (
                          <small>Sem: {item.removed.join(", ")}</small>
                        )}
                        {item.additions.map((a) => (
                          <small key={a.name}>
                            + {a.quantity}× {a.name}
                          </small>
                        ))}
                      </div>
                      <span>{money(item.unit_price * item.quantity)}</span>
                    </div>
                  ))}
                  <div className="summary-row" style={{ marginTop: 15 }}>
                    <span>Subtotal</span>
                    <span>{money(order.subtotal)}</span>
                  </div>
                  <div className="summary-row">
                    <span>
                      {order.fulfillment === "delivery"
                        ? "Entrega"
                        : "Retirada"}
                    </span>
                    <span>
                      {order.delivery_fee
                        ? money(order.delivery_fee)
                        : "Grátis"}
                    </span>
                  </div>
                  <div className="summary-row total">
                    <b>Total</b>
                    <b>{money(order.total)}</b>
                  </div>
                </section>
              </div>
              <div>
                <section className="tracking-card">
                  <h2>Os detalhes da sua sexta</h2>
                  <div className="info-list">
                    <CalendarDays />
                    <div>
                      <b>Sexta, {dateLabel(order.service_date)}</b>
                      <span>
                        Horário solicitado: {order.slot}
                        <br />
                        Atendimento até 22h
                      </span>
                    </div>
                  </div>
                  <div className="info-list">
                    <MapPin />
                    <div>
                      <b>
                        {order.fulfillment === "delivery"
                          ? "Entrega em Pirassununga"
                          : "Retirada na Carbon’s"}
                      </b>
                      <span>
                        {order.fulfillment === "delivery"
                          ? "Os dados completos do endereço ficam protegidos com a equipe."
                          : order.pickup_address ||
                            "O local completo será exibido após a confirmação."}
                      </span>
                    </div>
                  </div>
                  <div className="info-list">
                    <Wallet />
                    <div>
                      <b>{paymentLabels[order.payment_method]}</b>
                      <span>
                        {order.payment_status === "paid"
                          ? "Pagamento recebido"
                          : order.payment_status === "refunded"
                            ? "Pagamento reembolsado"
                            : order.payment_status === "refund_pending"
                              ? "Reembolso em processamento"
                              : order.payment_method === "pix"
                                ? "Aguardando confirmação do Pix"
                                : "Pagamento presencial ao receber"}
                      </span>
                    </div>
                  </div>
                  <button
                    className="button button-outline full"
                    onClick={() => copy(window.location.href, "link")}
                  >
                    <Copy size={14} />
                    {copied === "link" ? "Link copiado" : "Guardar meu link"}
                  </button>
                  <p className="secure-note">
                    <ShieldCheck size={13} /> Não compartilhe seu link com
                    desconhecidos.
                  </p>
                </section>
                <section className="tracking-card">
                  <h2>Podemos ajudar?</h2>
                  <a
                    href="https://wa.me/5519996784305"
                    target="_blank"
                    rel="noreferrer"
                    className="button button-outline full"
                  >
                    <MessageCircle size={16} />
                    Falar com a equipe <ExternalLink size={13} />
                  </a>
                  {!terminal && (
                    <button
                      className="back-link"
                      style={{ margin: "20px 0 0", color: "#9b4134" }}
                      onClick={() => setConfirm(true)}
                      disabled={order.cancel_requested}
                    >
                      {order.cancel_requested
                        ? "Cancelamento solicitado à equipe"
                        : "Cancelar este pedido"}
                    </button>
                  )}
                </section>
              </div>
            </div>
            <p className="secure-note">
              <RefreshCw size={12} />
              Atualização automática a cada 15 segundos. Horários de Brasília.
            </p>
          </>
        )}
        <Modal
          open={confirm}
          onClose={() => setConfirm(false)}
          title="Cancelar pedido"
        >
          <div style={{ padding: 25 }}>
            <p className="muted small" style={{ marginBottom: 20 }}>
              {order &&
              ["preparing", "ready", "dispatched"].includes(order.status)
                ? "O preparo já começou. Vamos enviar uma solicitação para a equipe analisar o cancelamento."
                : "Seu pedido será cancelado e o estoque reservado será liberado. Se houver Pix pago, o reembolso será solicitado."}
            </p>
            <button
              className="button button-danger full"
              disabled={busy}
              onClick={cancel}
            >
              {busy ? "Enviando…" : "Confirmar cancelamento"}
            </button>
          </div>
        </Modal>
      </main>
    </>
  );
}
