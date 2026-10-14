"use client";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Check,
  ClipboardList,
  Download,
  ExternalLink,
  History,
  LayoutDashboard,
  LockKeyhole,
  LogOut,
  Package,
  Plus,
  RefreshCw,
  ShieldCheck,
  Truck,
  UtensilsCrossed,
  Volume2,
  VolumeX,
} from "lucide-react";
import { api } from "@/lib/api";
import {
  type Catalog,
  type Order,
  type Product,
  dateLabel,
  money,
  paymentLabels,
  statusLabels,
} from "@/lib/types";
import { Brand } from "./brand";
import { SimpleHeader } from "./simple-header";
import { Modal } from "./modal";

type Report = {
  orders: number;
  burgers: number;
  gross: number;
  received: number;
  refund_pending: number;
  refunded: number;
  average_ticket: number;
  delivery: number;
  pickup: number;
  ranking: { name: string; quantity: number; revenue: number }[];
  payments: Record<string, number>;
  fees_note: string;
};
type Batch = {
  service_date: string;
  capacity: number;
  available: number;
  reserved_or_sold: number;
  low: boolean;
};
type Run = { id: string; name: string; expires_at: string; revoked: boolean };
type AuditData = {
  audit: { action: string; target: string; created_at: string }[];
  notifications: {
    id: string;
    kind: string;
    status: string;
    attempts: number;
    last_error: string | null;
  }[];
};
const tabs = [
  { id: "orders", name: "Pedidos", icon: ClipboardList },
  { id: "reports", name: "Visão geral", icon: LayoutDashboard },
  { id: "catalog", name: "Cardápio", icon: UtensilsCrossed },
  { id: "stock", name: "Estoque", icon: Package },
  { id: "delivery", name: "Rotas de entrega", icon: Truck },
  { id: "audit", name: "Auditoria", icon: History },
];
export default function AdminPanel() {
  const [auth, setAuth] = useState<boolean | null>(null),
    [username, setUsername] = useState("");
  const [tab, setTab] = useState("orders"),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [orders, setOrders] = useState<Order[]>([]),
    [catalog, setCatalog] = useState<Catalog | null>(null),
    [batches, setBatches] = useState<Batch[]>([]),
    [report, setReport] = useState<Report | null>(null),
    [runs, setRuns] = useState<Run[]>([]),
    [audit, setAudit] = useState<AuditData | null>(null);
  const [status, setStatus] = useState(""),
    [service, setService] = useState(""),
    [page, setPage] = useState(1),
    [edit, setEdit] = useState<Product | null>(null),
    [confirmCancel, setConfirmCancel] = useState<Order | null>(null);
  const [routeIds, setRouteIds] = useState<string[]>([]),
    [routeLink, setRouteLink] = useState(""),
    [sound, setSound] = useState(false);
  const previous = useRef<Set<string> | null>(null),
    audio = useRef<AudioContext | null>(null);
  const refresh = useCallback(async () => {
    try {
      const params = new URLSearchParams({ page: String(page) });
      if (status) params.set("status", status);
      if (service) params.set("service_date", service);
      const [o, c, b, r, d, a] = await Promise.all([
        api<{ orders: Order[] }>(`/admin/orders?${params}`),
        api<Catalog>("/catalog"),
        api<{ batches: Batch[] }>("/admin/inventory"),
        api<Report>(
          `/admin/reports/sales${service ? `?service_date=${service}` : ""}`,
        ),
        api<{ runs: Run[] }>("/admin/delivery-runs"),
        api<AuditData>("/admin/audit"),
      ]);
      if (
        previous.current &&
        o.orders.some((order) => !previous.current!.has(order.id!)) &&
        sound &&
        audio.current
      ) {
        const osc = audio.current.createOscillator(),
          gain = audio.current.createGain();
        osc.connect(gain);
        gain.connect(audio.current.destination);
        gain.gain.value = 0.12;
        osc.frequency.value = 880;
        osc.start();
        osc.stop(audio.current.currentTime + 0.3);
      }
      previous.current = new Set(o.orders.map((order) => order.id!));
      setOrders(o.orders);
      setCatalog(c);
      setBatches(b.batches);
      setReport(r);
      setRuns(d.runs);
      setAudit(a);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  }, [status, service, page, sound]);
  useEffect(() => {
    api<{ username: string }>("/admin/auth/me")
      .then((data) => {
        setUsername(data.username);
        setAuth(true);
      })
      .catch(() => setAuth(false));
  }, []);
  useEffect(() => {
    if (!auth) return;
    refresh();
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, 20000);
    return () => clearInterval(timer);
  }, [auth, refresh]);
  async function mutate(path: string, body?: unknown, method = "POST") {
    setBusy(true);
    setError("");
    try {
      const result = await api<Record<string, unknown>>(path, {
        method,
        body: body ? JSON.stringify(body) : undefined,
      });
      await refresh();
      setMessage("Alteração salva.");
      return result;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }
  async function login(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError("");
    try {
      await api("/admin/auth/login", {
        method: "POST",
        body: JSON.stringify({
          username: form.get("username"),
          password: form.get("password"),
          otp: form.get("otp"),
        }),
      });
      setUsername(String(form.get("username")));
      setAuth(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    try {
      await api("/admin/auth/logout", { method: "POST" });
      setAuth(false);
      setOrders([]);
    } catch (e) {
      setError((e as Error).message);
    }
  }
  async function editSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!edit) return;
    const form = new FormData(e.currentTarget);
    const result = await mutate(
      `/admin/products/${edit.id}`,
      {
        name: form.get("name"),
        description: form.get("description"),
        price: Math.round(Number(form.get("price")) * 100),
        ingredients: String(form.get("ingredients"))
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        available: form.has("available"),
        version: edit.version,
      },
      "PATCH",
    );
    if (result) setEdit(null);
  }
  async function makeRoute(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const result = await mutate("/admin/delivery-runs", {
      name: form.get("name"),
      order_ids: routeIds,
    });
    if (result) {
      setRouteLink(`${window.location.origin}/entrega/${result.token}`);
      setRouteIds([]);
    }
  }
  if (auth === null)
    return (
      <>
        <SimpleHeader />
        <main className="narrow-page">
          <div className="empty-state">Verificando acesso da equipe…</div>
        </main>
      </>
    );
  if (!auth)
    return (
      <>
        <SimpleHeader />
        <main className="tracking-form">
          <LockKeyhole size={34} strokeWidth={1.4} />
          <span className="eyebrow">ÁREA DA EQUIPE</span>
          <h1>Por trás do capricho.</h1>
          <p>
            Entre com seu usuário, senha e o código do seu aplicativo
            autenticador.
          </p>
          <form onSubmit={login}>
            <label className="field">
              Usuário
              <input
                name="username"
                autoComplete="username"
                required
                maxLength={100}
              />
            </label>
            <label className="field">
              Senha
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                maxLength={256}
              />
            </label>
            <label className="field">
              Código do autenticador
              <input
                name="otp"
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="000000"
                pattern="[0-9]{6}"
                maxLength={6}
                required
              />
            </label>
            {error && (
              <div className="error-box" role="alert">
                {error}
              </div>
            )}
            <button className="button button-yellow full" disabled={busy}>
              {busy ? "Verificando…" : "Entrar no painel"}
              <ArrowRight size={16} />
            </button>
          </form>
          <p className="secure-note" style={{ marginTop: 20 }}>
            <ShieldCheck size={14} />
            Acesso restrito. Autenticação em duas etapas.
          </p>
        </main>
      </>
    );
  return (
    <div className="admin-layout">
      <aside className="admin-sidebar">
        <Brand light />
        <span className="admin-label">OPERAÇÃO DA CARBON’S</span>
        <nav aria-label="Painel administrativo">
          {tabs.map((t) => (
            <button
              className={tab === t.id ? "active" : ""}
              key={t.id}
              onClick={() => {
                setTab(t.id);
                setMessage("");
              }}
            >
              <t.icon />
              {t.name}
            </button>
          ))}
        </nav>
        <Link href="/" className="back-link">
          <ArrowLeft size={14} />
          Ver a loja
        </Link>
        <button className="button" onClick={logout}>
          <LogOut size={14} /> Sair · {username}
        </button>
      </aside>
      <main className="admin-main">
        <header className="admin-top">
          <div>
            <span className="eyebrow" style={{ marginBottom: 7 }}>
              BEM-VINDO À COZINHA
            </span>
            <h1>{tabs.find((t) => t.id === tab)?.name}</h1>
            <p>Atualização a cada 20 segundos · Horários de Brasília</p>
          </div>
          <button className="button button-outline" onClick={refresh}>
            <RefreshCw size={14} />
            Atualizar
          </button>
        </header>
        {catalog?.operation.demo_mode && (
          <div className="notice">
            Modo demonstração. Pedidos de teste, sem cobrança ou envio real de
            mensagens.
          </div>
        )}
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        {message && (
          <div className="notice" role="status">
            <Check size={15} />
            {message}
            <button
              className="back-link"
              style={{ margin: "0 0 0 auto" }}
              onClick={() => setMessage("")}
            >
              Dispensar
            </button>
          </div>
        )}
        {report && (
          <div className="metrics-grid">
            <Metric
              label="Pedidos válidos"
              value={String(report.orders)}
              note={`${report.burgers} lanches no total`}
            />
            <Metric
              label="Vendas brutas"
              value={money(report.gross)}
              note="Sem cancelados e expirados"
            />
            <Metric
              label="Recebido"
              value={money(report.received)}
              note="Pagamentos confirmados"
            />
            <Metric
              label="Ticket médio"
              value={money(report.average_ticket)}
              note={
                service ? `Sexta, ${dateLabel(service)}` : "Todas as semanas"
              }
            />
          </div>
        )}
        <div className="admin-toolbar">
          <label className="field" style={{ margin: 0 }}>
            Filtrar semana
            <input
              type="date"
              value={service}
              onChange={(e) => {
                setService(e.target.value);
                setPage(1);
              }}
              aria-label="Filtrar por data de atendimento"
            />
          </label>
          {service && (
            <button
              className="back-link"
              style={{ margin: 0 }}
              onClick={() => setService("")}
            >
              Ver todas
            </button>
          )}
          {tab === "orders" && (
            <button
              className="button button-outline"
              style={{ fontSize: 10 }}
              onClick={() => {
                if (!sound) {
                  audio.current = new AudioContext();
                  audio.current.resume();
                }
                setSound(!sound);
              }}
            >
              {sound ? <Volume2 size={15} /> : <VolumeX size={15} />}Alerta
              sonoro {sound ? "ativado" : "desativado"}
            </button>
          )}
        </div>
        {tab === "orders" && (
          <>
            <div className="admin-toolbar">
              <select
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
                aria-label="Filtrar status"
              >
                <option value="">Todos os status</option>
                {Object.entries(statusLabels).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
              <span className="muted small">
                Página {page} · Até 50 pedidos por página
              </span>
            </div>
            <div className="order-grid">
              {orders.map((order) => (
                <OrderCard
                  key={order.id}
                  order={order}
                  busy={busy}
                  mutate={mutate}
                  onCancel={() => setConfirmCancel(order)}
                />
              ))}
            </div>
            {orders.length === 0 && (
              <div className="empty-state">
                <ClipboardList size={33} />
                <h3 style={{ marginTop: 15 }}>A cozinha está em dia.</h3>
                <p>Os pedidos recebidos aparecerão aqui.</p>
              </div>
            )}
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                marginTop: 20,
              }}
            >
              <button
                className="button button-outline"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </button>
              <button
                className="button button-outline"
                disabled={orders.length < 50}
                onClick={() => setPage(page + 1)}
              >
                Próxima
              </button>
            </div>
          </>
        )}
        {tab === "catalog" && (
          <>
            <p className="page-lead">
              Preços em reais, ingredientes separados por vírgula. Alterações
              não modificam pedidos anteriores; o cliente precisa atualizar um
              carrinho com versão antiga.
            </p>
            <div className="admin-catalog">
              {catalog?.products.map((product) => (
                <article className="admin-product" key={product.id}>
                  <Image src={product.image} width={85} height={85} alt="" />
                  <div>
                    <h3>{product.name}</h3>
                    <p>
                      {money(product.price)} ·{" "}
                      {product.available ? "Disponível" : "Pausado ou esgotado"}{" "}
                      · v{product.version}
                    </p>
                  </div>
                  <button
                    className="button button-outline"
                    onClick={() => setEdit(product)}
                  >
                    Editar lanche
                  </button>
                </article>
              ))}
            </div>
            <section className="tracking-card" style={{ marginTop: 25 }}>
              <h2>Adicionais do cardápio</h2>
              {catalog?.add_ons.map((a) => (
                <form
                  className="admin-addon-form"
                  key={`${a.id}-${a.version}`}
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const f = new FormData(e.currentTarget);
                    await mutate(
                      `/admin/add-ons/${a.id}`,
                      {
                        name: f.get("name"),
                        price: Math.round(Number(f.get("price")) * 100),
                        available: f.has("available"),
                        version: a.version,
                      },
                      "PATCH",
                    );
                  }}
                >
                  <label className="field">
                    Nome do adicional
                    <input
                      name="name"
                      defaultValue={a.name}
                      minLength={2}
                      maxLength={100}
                      required
                    />
                  </label>
                  <label className="field">
                    Preço (R$)
                    <input
                      name="price"
                      type="number"
                      defaultValue={a.price / 100}
                      min="0.01"
                      max="1000"
                      step="0.01"
                      required
                    />
                  </label>
                  <label className="consent">
                    <input
                      type="checkbox"
                      name="available"
                      defaultChecked={a.available}
                    />
                    Ativo
                  </label>
                  <button className="button button-outline" disabled={busy}>
                    Salvar
                  </button>
                </form>
              ))}
              <p className="muted small" style={{ marginTop: 15 }}>
                Até cinco unidades de cada adicional por lanche. Hambúrguer
                extra consome uma unidade adicional do lote.
              </p>
            </section>
          </>
        )}
        {tab === "stock" && (
          <>
            <p className="page-lead">
              Cada semana começa com 40 hambúrgueres. Reservas Pix expiram em 30
              minutos. Cancelamentos liberam as unidades do lote original.
            </p>
            <div className="admin-stock-grid">
              {batches.map((batch) => (
                <section className="stock-card" key={batch.service_date}>
                  <h3>Sexta-feira · {dateLabel(batch.service_date)}</h3>
                  <span
                    className={`status-badge ${batch.low ? "expired" : "confirmed"}`}
                  >
                    {batch.available === 0
                      ? "Esgotado"
                      : batch.low
                        ? "Estoque baixo"
                        : "Disponível"}
                  </span>
                  <div className="stock-big">
                    {batch.available}
                    <small> / {batch.capacity}</small>
                  </div>
                  <p>hambúrgueres disponíveis</p>
                  <div className="stock-bar">
                    <span
                      style={{
                        width: `${(100 * batch.available) / batch.capacity}%`,
                      }}
                    />
                  </div>
                  <p>
                    {batch.reserved_or_sold} unidades reservadas ou vendidas
                  </p>
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const form = new FormData(e.currentTarget);
                      await mutate("/admin/inventory", {
                        service_date: batch.service_date,
                        capacity: Number(form.get("capacity")),
                      });
                    }}
                    style={{ marginTop: 20 }}
                  >
                    <label className="field">
                      Capacidade total do lote
                      <input
                        name="capacity"
                        type="number"
                        min={Math.max(1, batch.reserved_or_sold)}
                        max={1000}
                        defaultValue={batch.capacity}
                        required
                      />
                    </label>
                    <button
                      className="button button-outline full"
                      disabled={busy}
                    >
                      Salvar capacidade
                    </button>
                  </form>
                </section>
              ))}
            </div>
          </>
        )}
        {tab === "reports" && report && (
          <>
            <div className="admin-toolbar">
              <p className="muted small">
                Totais calculados no servidor a partir dos pedidos.
              </p>
              <div style={{ display: "flex", gap: 9 }}>
                <a
                  href={`/api/v1/admin/reports/sales.csv${service ? `?service_date=${service}` : ""}`}
                  className="button button-outline"
                >
                  <Download size={14} />
                  CSV
                </a>
                <button
                  className="button button-outline"
                  onClick={() => window.print()}
                >
                  <Download size={14} />
                  Salvar PDF
                </button>
              </div>
            </div>
            <div className="admin-two-columns">
              <section className="tracking-card">
                <h2>Os favoritos da semana</h2>
                {report.ranking.length ? (
                  report.ranking.map((item) => (
                    <div key={item.name}>
                      <div className="ranking-row">
                        <b>{item.name}</b>
                        <span>
                          {item.quantity} lanches · {money(item.revenue)}
                        </span>
                      </div>
                      <div className="ranking-bar">
                        <span
                          style={{
                            width: `${(100 * item.quantity) / Math.max(...report.ranking.map((i) => i.quantity))}%`,
                          }}
                        />
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="muted small">
                    O ranking começa com o primeiro pedido.
                  </p>
                )}
              </section>
              <section className="tracking-card">
                <h2>Recebimentos e operação</h2>
                {Object.entries(report.payments).map(([method, total]) => (
                  <div className="summary-row" key={method}>
                    <span>{paymentLabels[method]}</span>
                    <b>{money(total)}</b>
                  </div>
                ))}
                <div className="summary-row total">
                  <span>Reembolso pendente</span>
                  <b>{money(report.refund_pending)}</b>
                </div>
                <div className="summary-row">
                  <span>Reembolsado</span>
                  <span>{money(report.refunded)}</span>
                </div>
                <div className="summary-row">
                  <span>Entrega / retirada</span>
                  <span>
                    {report.delivery} / {report.pickup}
                  </span>
                </div>
                <p className="muted small" style={{ marginTop: 20 }}>
                  {report.fees_note}
                </p>
              </section>
            </div>
          </>
        )}
        {tab === "delivery" && (
          <>
            <section className="tracking-card">
              <h2>Organize uma saída</h2>
              <p className="muted small" style={{ marginBottom: 20 }}>
                Selecione pedidos de entrega prontos. A ordem da seleção define
                a sequência de paradas. O link do entregador dura quatro horas e
                pode ser revogado.
              </p>
              <form onSubmit={makeRoute}>
                <label className="field">
                  Nome da saída
                  <input
                    name="name"
                    placeholder="Ex.: Saída Centro · 20h30"
                    minLength={2}
                    maxLength={100}
                    required
                  />
                </label>
                {orders
                  .filter(
                    (o) => o.fulfillment === "delivery" && o.status === "ready",
                  )
                  .map((o) => (
                    <label className="ingredient-option" key={o.id}>
                      <span>
                        <b>
                          {routeIds.includes(o.id!)
                            ? `${routeIds.indexOf(o.id!) + 1}. `
                            : ""}
                          {o.code}
                        </b>{" "}
                        · {o.customer_name} · {o.address?.neighborhood}
                      </span>
                      <input
                        type="checkbox"
                        checked={routeIds.includes(o.id!)}
                        onChange={(e) =>
                          setRouteIds(
                            e.target.checked
                              ? [...routeIds, o.id!]
                              : routeIds.filter((id) => id !== o.id),
                          )
                        }
                      />
                    </label>
                  ))}
                {!orders.some(
                  (o) => o.fulfillment === "delivery" && o.status === "ready",
                ) && (
                  <p className="muted small" style={{ marginBottom: 20 }}>
                    Não há pedidos de entrega prontos nesta página e filtro.
                    Confira a fila de pedidos.
                  </p>
                )}
                <button
                  className="button button-yellow"
                  style={{ marginTop: 20 }}
                  disabled={busy || !routeIds.length}
                >
                  <Truck size={16} />
                  Gerar link e despachar {routeIds.length || ""}
                </button>
              </form>
              {routeLink && (
                <div
                  className="notice"
                  style={{
                    marginTop: 20,
                    display: "block",
                    overflowWrap: "anywhere",
                  }}
                >
                  Link gerado. Compartilhe apenas com o entregador desta saída.
                  <br />
                  <a
                    href={routeLink}
                    target="_blank"
                    rel="noreferrer"
                    style={{ textDecoration: "underline" }}
                  >
                    {routeLink}
                  </a>
                </div>
              )}
            </section>
            <section className="tracking-card">
              <h2>Saídas recentes</h2>
              {runs.map((run) => (
                <div className="audit-row" key={run.id}>
                  <div>
                    <b>{run.name}</b>
                    <small style={{ display: "block" }}>
                      Expira{" "}
                      {new Date(run.expires_at).toLocaleString("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                      })}
                    </small>
                  </div>
                  {run.revoked ? (
                    <span className="status-badge expired">Revogada</span>
                  ) : (
                    <button
                      className="button button-outline"
                      disabled={busy}
                      onClick={() =>
                        mutate(`/admin/delivery-runs/${run.id}/revoke`)
                      }
                    >
                      Revogar
                    </button>
                  )}
                </div>
              ))}
              {!runs.length && (
                <p className="muted small">Nenhuma saída registrada.</p>
              )}
            </section>
          </>
        )}
        {tab === "audit" && (
          <>
            <section className="tracking-card">
              <h2>Atividade administrativa</h2>
              {audit?.audit.map((a, i) => (
                <div className="audit-row" key={i}>
                  <div>
                    <b>{a.action}</b>
                    <small style={{ display: "block" }}>{a.target}</small>
                  </div>
                  <small>
                    {new Date(a.created_at).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })}
                  </small>
                </div>
              ))}
            </section>
            <section className="tracking-card">
              <h2>Mensagens e reembolsos</h2>
              {audit?.notifications.length ? (
                audit.notifications.map((n) => (
                  <div className="audit-row" key={n.id}>
                    <span>
                      {n.kind} · {n.attempts} tentativa(s)
                      <small style={{ display: "block" }}>{n.last_error}</small>
                    </span>
                    <span className="status-badge">{n.status}</span>
                  </div>
                ))
              ) : (
                <p className="muted small">Nenhum evento registrado.</p>
              )}
              <p className="muted small" style={{ marginTop: 20 }}>
                Eventos blocked dependem de configuração externa. Envios
                uncertain precisam de conferência para evitar mensagens
                duplicadas.
              </p>
            </section>
          </>
        )}
        <Modal
          open={!!edit}
          onClose={() => setEdit(null)}
          title="Editar lanche"
        >
          <form onSubmit={editSave} style={{ padding: 25, overflowY: "auto" }}>
            {edit && (
              <>
                <label className="field">
                  Nome
                  <input
                    name="name"
                    defaultValue={edit.name}
                    maxLength={100}
                    minLength={2}
                    required
                  />
                </label>
                <label className="field">
                  Descrição
                  <textarea
                    name="description"
                    defaultValue={edit.description}
                    maxLength={500}
                    minLength={5}
                    required
                    rows={3}
                  />
                </label>
                <label className="field">
                  Preço em reais
                  <input
                    name="price"
                    type="number"
                    min={0.01}
                    max={1000}
                    step={0.01}
                    defaultValue={edit.price / 100}
                    required
                  />
                </label>
                <label className="field">
                  Ingredientes (separados por vírgula)
                  <textarea
                    name="ingredients"
                    defaultValue={edit.ingredients.join(", ")}
                    required
                    rows={3}
                  />
                </label>
                <label className="consent">
                  <input
                    name="available"
                    type="checkbox"
                    defaultChecked={edit.available}
                  />
                  Disponível para pedidos
                </label>
                {error && (
                  <div className="error-box" role="alert">
                    {error}
                  </div>
                )}
                <button className="button button-yellow full" disabled={busy}>
                  Salvar alterações
                </button>
              </>
            )}
          </form>
        </Modal>
        <Modal
          open={!!confirmCancel}
          onClose={() => setConfirmCancel(null)}
          title="Cancelar pedido"
        >
          <div style={{ padding: 25 }}>
            <p className="muted small" style={{ marginBottom: 20 }}>
              Cancelar {confirmCancel?.code}? Unidades ainda não utilizadas
              serão liberadas. Se houver Pix pago, o reembolso será solicitado.
              Pagamentos presenciais já recebidos exigem devolução pela equipe.
            </p>
            <button
              className="button button-danger full"
              disabled={busy}
              onClick={async () => {
                if (confirmCancel) {
                  const result = await mutate(
                    `/admin/orders/${confirmCancel.id}`,
                    { status: "cancelled" },
                    "PATCH",
                  );
                  if (result) setConfirmCancel(null);
                }
              }}
            >
              Confirmar cancelamento
            </button>
          </div>
        </Modal>
      </main>
    </div>
  );
}
function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{note}</small>
    </div>
  );
}
function OrderCard({
  order,
  busy,
  mutate,
  onCancel,
}: {
  order: Order;
  busy: boolean;
  mutate: (path: string, body?: unknown, method?: string) => Promise<unknown>;
  onCancel: () => void;
}) {
  const [estimate, setEstimate] = useState("");
  const next: Record<string, [string, string]> = {
    pending_approval: ["confirmed", "Confirmar pedido"],
    confirmed: ["preparing", "Iniciar preparo"],
    preparing: ["ready", "Marcar como pronto"],
    ready:
      order.fulfillment === "pickup"
        ? ["completed", "Concluir retirada"]
        : ["dispatched", "Despachar entrega"],
    dispatched: ["completed", "Concluir entrega"],
  };
  const action = next[order.status];
  return (
    <article className="admin-order">
      <header>
        <h3>{order.code}</h3>
        <span className={`status-badge ${order.status}`}>
          {statusLabels[order.status]}
        </span>
      </header>
      <p>
        <b>{order.customer_name}</b> ·{" "}
        {order.fulfillment === "delivery" ? "Entrega" : "Retirada"}
      </p>
      <small>
        Sexta, {dateLabel(order.service_date)} · {order.slot} · {order.phone}
      </small>
      {order.address && (
        <p className="muted small" style={{ marginTop: 8 }}>
          {order.address.street}, {order.address.number} ·{" "}
          {order.address.neighborhood}{" "}
          {order.address.complement && `· ${order.address.complement}`}
        </p>
      )}
      <div className="admin-order-items">
        {order.items.map((item, i) => (
          <div className="order-line" key={i}>
            <div>
              <b>
                {item.quantity}× {item.name}
              </b>
              {item.removed.length > 0 && (
                <small>SEM: {item.removed.join(", ")}</small>
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
      </div>
      <div className="summary-row" style={{ marginTop: 13 }}>
        <span>
          {paymentLabels[order.payment_method]} ·{" "}
          {order.payment_status === "paid"
            ? "Recebido"
            : order.payment_status === "refund_pending"
              ? "Reembolso pendente"
              : order.payment_status === "refunded"
                ? "Reembolsado"
                : "Pendente"}
        </span>
        <b>{money(order.total)}</b>
      </div>
      {order.change_for && (
        <p className="muted small">Troco para {money(order.change_for)}</p>
      )}
      {order.estimate && (
        <p className="muted small">Previsão: {order.estimate}</p>
      )}
      {order.cancel_requested && (
        <div className="notice" style={{ marginTop: 15, marginBottom: 5 }}>
          Cliente solicitou cancelamento. Analise antes de continuar.
        </div>
      )}
      {order.status === "pending_approval" && (
        <label className="field">
          Previsão de atendimento
          <input
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
            placeholder="Ex.: entrega entre 20h30 e 21h"
            maxLength={100}
          />
        </label>
      )}
      <div className="admin-order-footer">
        {order.status === "cancelled" &&
          order.payment_method !== "pix" &&
          order.payment_status === "refund_pending" && (
            <button
              className="button button-outline"
              disabled={busy}
              onClick={() => {
                if (
                  window.confirm(
                    "Confirma que você já devolveu o pagamento ao cliente?",
                  )
                )
                  mutate(`/admin/orders/${order.id}/refund-confirmed`);
              }}
            >
              Já devolvi o pagamento
            </button>
          )}
        {action && (
          <button
            className="button button-yellow"
            disabled={
              busy || (order.status === "pending_approval" && !estimate.trim())
            }
            onClick={() =>
              mutate(
                `/admin/orders/${order.id}`,
                { status: action[0], estimate: estimate || undefined },
                "PATCH",
              )
            }
          >
            {action[1]}
            <ArrowRight size={12} />
          </button>
        )}
        {!["cancelled", "expired"].includes(order.status) &&
          order.payment_method !== "pix" &&
          order.payment_status !== "paid" && (
            <button
              className="button button-outline"
              disabled={busy}
              onClick={() => mutate(`/admin/orders/${order.id}/payment`)}
            >
              Recebi o pagamento
            </button>
          )}
        {!["cancelled", "expired", "completed", "pending_payment"].includes(
          order.status,
        ) && (
          <button
            className="button button-outline"
            style={{ color: "#a14a3e" }}
            onClick={onCancel}
            disabled={busy}
          >
            Cancelar
          </button>
        )}
      </div>
    </article>
  );
}
