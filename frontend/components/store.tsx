"use client";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  ChevronRight,
  Clock3,
  Flame,
  Heart,
  Instagram,
  MapPin,
  Menu,
  MessageCircle,
  Minus,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  SlidersHorizontal,
  Truck,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { Brand } from "./brand";
import { Modal } from "./modal";
import { api } from "@/lib/api";
import {
  type AddOn,
  type CartItem,
  type Catalog,
  type Order,
  type Product,
  dateLabel,
  money,
} from "@/lib/types";

const cartKey = "carbons-cart-v1";
export default function Store() {
  const [catalog, setCatalog] = useState<Catalog | null>(null),
    [loadError, setLoadError] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]),
    [hydrated, setHydrated] = useState(false);
  const [selected, setSelected] = useState<Product | null>(null),
    [cartOpen, setCartOpen] = useState(false),
    [checkout, setCheckout] = useState(false);
  const [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [mobileNav, setMobileNav] = useState(false),
    [toast, setToast] = useState("");
  const refresh = useCallback(() => {
    setLoadError("");
    api<Catalog>("/catalog")
      .then(setCatalog)
      .catch((e) => setLoadError(e.message));
  }, []);
  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(cartKey) || "[]");
      if (
        Array.isArray(saved) &&
        saved.every(
          (i: CartItem) =>
            i.product?.id &&
            Number.isInteger(i.quantity) &&
            i.quantity > 0 &&
            i.quantity <= 10 &&
            Number.isFinite(i.unit_price),
        )
      )
        setCart(saved);
    } catch {}
    setHydrated(true);
  }, []);
  useEffect(() => {
    if (hydrated) localStorage.setItem(cartKey, JSON.stringify(cart));
  }, [cart, hydrated]);
  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(""), 3500);
      return () => clearTimeout(timer);
    }
  }, [toast]);
  const count = cart.reduce((n, i) => n + i.quantity, 0),
    subtotal = cart.reduce((n, i) => n + i.quantity * i.unit_price, 0);
  const add = (item: CartItem) => {
    if (count + item.quantity > 10) {
      setToast("O limite é de 10 lanches por pedido.");
      return;
    }
    setCart([...cart, item]);
    setSelected(null);
    setToast("Lanche adicionado à sua sacola!");
  };
  const change = (id: string, delta: number) =>
    setCart((items) =>
      items.flatMap((i) =>
        i.id !== id
          ? [i]
          : i.quantity + delta <= 0
            ? []
            : [
                {
                  ...i,
                  quantity:
                    delta > 0 && count >= 10 ? i.quantity : i.quantity + delta,
                },
              ],
      ),
    );
  const filtered = catalog?.products.filter(
    (p) =>
      (filter === "all" ||
        (filter === "classics"
          ? p.id.startsWith("classico")
          : !p.id.startsWith("classico"))) &&
      p.name.toLowerCase().includes(search.toLowerCase()),
  );
  const service = catalog
    ? dateLabel(catalog.operation.service_date)
    : "sexta-feira";
  return (
    <>
      <a className="skip-link" href="#cardapio">
        Pular para o cardápio
      </a>
      <div className="topbar">
        <Flame size={13} />
        <span>Sua sexta-feira merece um Carbon’s.</span>
        <span className="topbar-location">
          <MapPin size={12} /> Pirassununga, SP
        </span>
      </div>
      <header className="site-header">
        <div className="container nav">
          <Brand />
          <nav
            aria-label="Principal"
            className={mobileNav ? "nav-links nav-open" : "nav-links"}
          >
            <a href="#cardapio" onClick={() => setMobileNav(false)}>
              Cardápio
            </a>
            <a href="#como-funciona" onClick={() => setMobileNav(false)}>
              Como funciona
            </a>
            <a href="#sobre" onClick={() => setMobileNav(false)}>
              A Carbon’s
            </a>
            <Link href="/acompanhar">Acompanhar pedido</Link>
          </nav>
          <div className="nav-actions">
            <button
              className="cart-button"
              aria-label={`Sua sacola, ${count} lanches`}
              onClick={() => {
                setCartOpen(true);
                setCheckout(false);
              }}
            >
              <ShoppingBag size={18} />
              <span>Sua sacola</span>
              <b>{count}</b>
            </button>
            <button
              className="icon-button nav-toggle"
              aria-label="Abrir menu"
              aria-expanded={mobileNav}
              onClick={() => setMobileNav(!mobileNav)}
            >
              {mobileNav ? <X /> : <Menu />}
            </button>
          </div>
        </div>
      </header>
      {catalog?.operation.demo_mode && (
        <div className="demo-notice">
          <span className="demo-dot" />
          Modo demonstração · Os pedidos aqui são testes e não geram vendas
          reais.
        </div>
      )}
      <main>
        <section className="hero">
          <div className="hero-grain" />
          <div className="container hero-inner">
            <div className="hero-copy">
              <span className="eyebrow light">
                <span />
                ARTESANAL DE VERDADE. DE PIRASSUNUNGA.
              </span>
              <h1>
                Sextou.
                <br />
                Acenda a sua
                <br />
                <em>fome.</em>
                <span className="hero-spark" aria-hidden="true">
                  ✳︎
                </span>
              </h1>
              <p>
                Carne VPJ Angus, ingredientes de respeito
                <br className="desktop-break" /> e aquele sabor que faz a semana
                valer a pena.
              </p>
              <a className="button button-yellow" href="#cardapio">
                Escolher meu burguer <ArrowRight size={18} />
              </a>
              <div className="hero-caption">
                <span className="tiny-burger">
                  <UtensilsCrossed size={17} />
                </span>
                <span>
                  Feito na hora. Do seu jeito.
                  <br />
                  <b>Sem pressa no preparo. Sem economia no sabor.</b>
                </span>
              </div>
            </div>
            <div className="hero-visual">
              <div className="hero-halo" />
              <Image
                src="/images/burger.webp"
                alt="Imagem ilustrativa de um hambúrguer artesanal com queijo e salada"
                fill
                sizes="(max-width: 700px) 100vw, 60vw"
                className="hero-burger"
                priority
              />
              <div className="hero-stamp">
                <span>CARNE</span>
                <strong>VPJ</strong>
                <span>100% ANGUS</span>
              </div>
              <div className="hero-note">
                <span>O ingrediente principal?</span>
                <b>Capricho em cada camada.</b>
                <svg
                  width="75"
                  height="40"
                  viewBox="0 0 75 40"
                  aria-hidden="true"
                >
                  <path
                    d="M3 4Q15 42 68 26M57 17l12 9-12 10"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  />
                </svg>
              </div>
            </div>
          </div>
          <div className="hero-bottom container">
            <span>
              <span className="status-dot" />
              {catalog?.operation.real_open
                ? "Agendamentos abertos"
                : catalog?.operation.message || "Toda sexta tem Carbon’s"}
            </span>
            <span>
              <CalendarDays size={15} /> Próxima sexta · {service}
            </span>
            <a href="#cardapio" aria-label="Ver cardápio">
              <ArrowDown size={19} />
            </a>
          </div>
        </section>
        <div className="service-strip">
          <div className="container service-grid">
            <div>
              <CalendarDays />
              <span>
                <b>Sexta é o nosso dia</b>
                <small>Entrega e retirada, das 20h às 22h</small>
              </span>
            </div>
            <div>
              <Truck />
              <span>
                <b>Da nossa cozinha até você</b>
                <small>Área urbana de Pirassununga · R$ 6</small>
              </span>
            </div>
            <div>
              <UtensilsCrossed />
              <span>
                <b>Poucos lanches. Muito capricho.</b>
                <small>Lote semanal limitado a 40 hambúrgueres</small>
              </span>
            </div>
          </div>
        </div>
        <section id="cardapio" className="menu-section container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">O CARDÁPIO</span>
              <h2>
                Escolha o seu
                <br />
                <span>próximo favorito.</span>
              </h2>
            </div>
            <p>
              Seis receitas. Um ingrediente em comum:
              <br />
              vontade de fazer bem feito.
            </p>
          </div>
          <div className="menu-toolbar">
            <div className="filter-tabs" aria-label="Filtrar cardápio">
              {[
                ["all", "Todos os lanches"],
                ["classics", "Os clássicos"],
                ["specials", "Pra ir além"],
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={filter === id ? "active" : ""}
                  onClick={() => setFilter(id)}
                  aria-pressed={filter === id}
                >
                  {id === "all" && <Flame size={16} />} {label}
                </button>
              ))}
            </div>
            <label className="search-box">
              <Search size={18} />
              <input
                aria-label="Buscar lanche"
                placeholder="Qual é a sua vontade?"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          {loadError ? (
            <div className="empty-state" role="alert">
              <h3>Não conseguimos carregar o cardápio.</h3>
              <p>{loadError}</p>
              <button className="button" onClick={refresh}>
                Tentar novamente
              </button>
            </div>
          ) : !catalog ? (
            <div className="product-grid" aria-label="Carregando cardápio">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div className="skeleton" key={i} />
              ))}
            </div>
          ) : (
            <>
              {!catalog.operation.open && (
                <div className="notice">
                  <Clock3 size={18} />
                  {catalog.operation.message}. Você pode conhecer o cardápio
                  enquanto espera.
                </div>
              )}
              <div className="product-grid">
                {filtered?.map((product, index) => (
                  <article
                    className={`product-card ${!product.available ? "sold-out" : ""}`}
                    key={product.id}
                  >
                    <button
                      className="product-image-button"
                      onClick={() => setSelected(product)}
                      aria-label={`Personalizar ${product.name}`}
                      disabled={!product.available}
                    >
                      <div className="product-photo">
                        <Image
                          src={product.image}
                          alt={`Imagem ilustrativa do ${product.name}`}
                          fill
                          sizes="(max-width: 600px) 90vw, (max-width: 1000px) 45vw, 30vw"
                        />
                        {product.id === "ultimat-burguer" && (
                          <span className="product-tag">
                            <Flame size={12} /> CHEIO DE PERSONALIDADE
                          </span>
                        )}
                        {!product.available && (
                          <span className="product-tag sold-tag">
                            INDISPONÍVEL
                          </span>
                        )}
                        <span className="photo-caption">
                          Imagem ilustrativa
                        </span>
                      </div>
                    </button>
                    <div className="product-info">
                      <span className="product-kicker">{product.badge}</span>
                      <h3>{product.name}</h3>
                      <p>{product.description}</p>
                      <div className="product-bottom">
                        <span className="product-price">
                          {money(product.price)}
                        </span>
                        <button
                          className="add-button"
                          aria-label={`Adicionar ${product.name}`}
                          disabled={
                            !product.available || !catalog.operation.open
                          }
                          onClick={() => setSelected(product)}
                        >
                          <Plus size={18} />
                          <span>Adicionar</span>
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              {!filtered?.length && (
                <div className="empty-state">
                  Nenhum lanche encontrado. Experimente outro nome.
                </div>
              )}
              <div className="menu-footnote">
                <SlidersHorizontal size={16} />
                <span>
                  Seu lanche, suas regras. Retire ingredientes e adicione o que
                  você gosta.
                </span>
                <span className="stock-label">
                  {catalog.stock.available > 0 ? (
                    <>
                      <span className="status-dot" />
                      {catalog.stock.low
                        ? `Últimos ${catalog.stock.available} hambúrgueres da semana`
                        : `${catalog.stock.available} hambúrgueres disponíveis nesta semana`}
                    </>
                  ) : (
                    "Lote da semana esgotado"
                  )}
                </span>
              </div>
            </>
          )}
        </section>
        <section id="como-funciona" className="how-section">
          <div className="container">
            <div className="section-heading">
              <div>
                <span className="eyebrow">
                  DO PRIMEIRO CLIQUE À PRIMEIRA MORDIDA
                </span>
                <h2>
                  A sexta boa
                  <br />
                  começa aqui.
                </h2>
              </div>
              <p>
                Você escolhe. A gente capricha.
                <br />O resto é aproveitar.
              </p>
            </div>
            <div className="steps-grid">
              {[
                {
                  n: "01",
                  icon: <ShoppingBag />,
                  title: "Monte do seu jeito",
                  text: "Escolha seu burguer, retire ingredientes e dê aquele toque com seus adicionais favoritos.",
                },
                {
                  n: "02",
                  icon: <CalendarDays />,
                  title: "Reserve a sua sexta",
                  text: "Agende a partir de segunda, às 15h. Na sexta, os pedidos do dia abrem às 18h e vão até 21h30.",
                },
                {
                  n: "03",
                  icon: <Heart />,
                  title: "Deixe o resto com a gente",
                  text: "Receba em casa ou retire das 20h às 22h. Acompanhe cada etapa pelo seu link exclusivo.",
                },
              ].map((step) => (
                <div className="step" key={step.n}>
                  <div className="step-top">
                    <span className="step-icon">{step.icon}</span>
                    <span className="step-number">{step.n}</span>
                  </div>
                  <h3>{step.title}</h3>
                  <p>{step.text}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section id="sobre" className="about-section container">
          <div className="about-art">
            <Flame size={62} strokeWidth={1.1} />
            <span>
              BOA CARNE.
              <br />
              BOA COMPANHIA.
              <br />
              <em>BOA SEXTA.</em>
            </span>
            <small>CARBON’S BURGUER · PIRASSUNUNGA</small>
            <div className="art-star" aria-hidden="true">
              <svg viewBox="0 0 100 100" width="220" height="220">
                <path
                  d="M50 5v90M5 50h90M18 18l64 64M18 82l64-64"
                  stroke="currentColor"
                  strokeWidth="8"
                  strokeLinecap="round"
                />
              </svg>
            </div>
          </div>
          <div className="about-copy">
            <span className="eyebrow">PRAZER, SOMOS A CARBON’S</span>
            <h2>
              Pequena produção.
              <br />
              Sabor sem medida.
            </h2>
            <p>
              A gente acredita que um bom hambúrguer não precisa de complicação.
              Precisa de boa carne, ingredientes escolhidos e atenção a cada
              detalhe.
            </p>
            <p>
              Por isso, nossa produção é limitada. Cada sexta-feira tem um lote
              de 40 hambúrgueres, preparado com o cuidado que você merece.
            </p>
            <div className="about-signature">
              <Image src="/images/logo.webp" width={62} height={62} alt="" />
              <span>
                Da nossa cozinha para a sua sexta.
                <br />
                <b>Com carinho, Carbon’s Burguer.</b>
              </span>
            </div>
          </div>
        </section>
        <section className="contact-band">
          <div className="container">
            <div>
              <span className="eyebrow">BATEU UMA DÚVIDA?</span>
              <h2>A gente está por aqui.</h2>
            </div>
            <a
              className="button button-dark"
              href="https://wa.me/5519996784305"
              target="_blank"
              rel="noreferrer"
            >
              <MessageCircle size={19} />
              Chamar no WhatsApp
              <ArrowRight size={17} />
            </a>
          </div>
        </section>
      </main>
      <footer className="site-footer">
        <div className="container footer-top">
          <div>
            <Brand light />
            <p>
              Artesanal de verdade.
              <br />
              Sua sexta tem mais sabor.
            </p>
          </div>
          <div>
            <h3>Vem de Carbon’s</h3>
            <a href="#cardapio">Nosso cardápio</a>
            <a href="#como-funciona">Como pedir</a>
            <Link href="/acompanhar">Acompanhar pedido</Link>
          </div>
          <div>
            <h3>Fale com a gente</h3>
            <a
              href="https://wa.me/5519996784305"
              target="_blank"
              rel="noreferrer"
            >
              (19) 99678-4305 <ArrowRight size={12} />
            </a>
            <a
              href="https://www.instagram.com/carbonsburguer/"
              target="_blank"
              rel="noreferrer"
            >
              <Instagram size={15} /> @carbonsburguer
            </a>
            <span>Pirassununga, São Paulo</span>
          </div>
          <div className="footer-hours">
            <h3>Anota aí</h3>
            <span>Sexta-feira · 20h às 22h</span>
            <small>
              Agendamentos a partir de
              <br />
              segunda-feira, às 15h.
            </small>
            <Link href="/politicas">Entrega, cancelamento e privacidade</Link>
          </div>
        </div>
        <div className="container footer-bottom">
          <span>
            © {new Date().getFullYear()} Carbon’s Burguer. Feito com capricho.
          </span>
          <span>
            <ShieldCheck size={14} />
            Compra sem cadastro · Link de acompanhamento seguro
          </span>
          <Link href="/admin">
            Área da equipe <ChevronRight size={13} />
          </Link>
        </div>
      </footer>
      {count > 0 && !cartOpen && !selected && (
        <button
          className="mobile-cart"
          onClick={() => {
            setCartOpen(true);
            setCheckout(false);
          }}
        >
          <ShoppingBag size={20} />
          <span>
            Ver sacola · {count} {count === 1 ? "lanche" : "lanches"}
          </span>
          <b>{money(subtotal)}</b>
        </button>
      )}
      <div className="toast-region" role="status" aria-live="polite">
        {toast && (
          <div className="toast">
            <Check size={18} />
            {toast}
          </div>
        )}
      </div>
      {catalog && (
        <Customize
          product={selected}
          addons={catalog.add_ons}
          maxQuantity={10 - count}
          onClose={() => setSelected(null)}
          onAdd={add}
        />
      )}
      <Modal
        title={checkout ? "Finalize seu pedido" : "Sua sacola"}
        open={cartOpen}
        onClose={() => setCartOpen(false)}
        drawer
      >
        {checkout && catalog ? (
          <Checkout
            cart={cart}
            catalog={catalog}
            onBack={() => setCheckout(false)}
            onSuccess={() => {
              setCart([]);
              localStorage.removeItem(cartKey);
            }}
          />
        ) : (
          <>
            <div className="drawer-content">
              {!count ? (
                <div className="empty-bag">
                  <ShoppingBag size={55} strokeWidth={1} />
                  <h3>Sua próxima sexta começa aqui.</h3>
                  <p>Escolha um lanche e monte do seu jeito.</p>
                  <button className="button" onClick={() => setCartOpen(false)}>
                    Explorar o cardápio <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                cart.map((item) => (
                  <div className="cart-item" key={item.id}>
                    <Image
                      src={item.product.image}
                      width={82}
                      height={82}
                      alt=""
                    />
                    <div>
                      <h3>{item.product.name}</h3>
                      {item.removed.length > 0 && (
                        <small>Sem: {item.removed.join(", ")}</small>
                      )}
                      {Object.entries(item.additions).map(([id, qty]) => (
                        <small key={id}>
                          + {qty}×{" "}
                          {catalog?.add_ons.find((a) => a.id === id)?.name ||
                            id}
                        </small>
                      ))}
                      <b>{money(item.unit_price * item.quantity)}</b>
                      <div className="quantity-control">
                        <button
                          aria-label={`Diminuir ${item.product.name}`}
                          onClick={() => change(item.id, -1)}
                        >
                          <Minus size={14} />
                        </button>
                        <span>{item.quantity}</span>
                        <button
                          disabled={count >= 10}
                          aria-label={`Aumentar ${item.product.name}`}
                          onClick={() => change(item.id, 1)}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                    <button
                      className="icon-button remove-item"
                      aria-label={`Remover ${item.product.name}`}
                      onClick={() =>
                        setCart(cart.filter((i) => i.id !== item.id))
                      }
                    >
                      <X size={17} />
                    </button>
                  </div>
                ))
              )}
            </div>
            {count > 0 && (
              <div className="drawer-footer">
                <div className="summary-row">
                  <span>Subtotal</span>
                  <b>{money(subtotal)}</b>
                </div>
                <p className="muted small">
                  A taxa de entrega é calculada na próxima etapa.
                </p>
                <button
                  className="button button-yellow full"
                  disabled={!catalog?.operation.open}
                  onClick={() => setCheckout(true)}
                >
                  Continuar para o pedido <ArrowRight size={18} />
                </button>
                <p className="secure-note">
                  <ShieldCheck size={13} /> Sem cadastro. Sem complicação.
                </p>
              </div>
            )}
          </>
        )}
      </Modal>
    </>
  );
}

function Customize({
  product,
  addons,
  maxQuantity,
  onClose,
  onAdd,
}: {
  product: Product | null;
  addons: AddOn[];
  maxQuantity: number;
  onClose: () => void;
  onAdd: (item: CartItem) => void;
}) {
  const [removed, setRemoved] = useState<string[]>([]),
    [additions, setAdditions] = useState<Record<string, number>>({}),
    [quantity, setQuantity] = useState(1),
    [tab, setTab] = useState("ingredients");
  useEffect(() => {
    setRemoved([]);
    setAdditions({});
    setQuantity(1);
    setTab("ingredients");
  }, [product]);
  if (!product) return null;
  const unit =
    product.price +
    addons.reduce((sum, a) => sum + a.price * (additions[a.id] || 0), 0);
  return (
    <Modal title="Seu burguer, do seu jeito" open={!!product} onClose={onClose}>
      <div className="customize-image">
        <Image
          src={product.image}
          alt={`Imagem ilustrativa do ${product.name}`}
          fill
          sizes="540px"
        />
        <span>Imagem ilustrativa</span>
      </div>
      <div className="customize-intro">
        <span className="eyebrow">FEITO PRA VOCÊ</span>
        <h3>{product.name}</h3>
        <p>{product.description}</p>
        <b>{money(product.price)}</b>
      </div>
      <div className="custom-tabs">
        <button
          className={tab === "ingredients" ? "active" : ""}
          onClick={() => setTab("ingredients")}
        >
          Retirar ingredientes
        </button>
        <button
          className={tab === "addons" ? "active" : ""}
          onClick={() => setTab("addons")}
        >
          Turbinar meu lanche
        </button>
      </div>
      <div className="custom-options">
        {tab === "ingredients" ? (
          <>
            <p className="muted small">
              Desmarque o que você prefere deixar de fora. O preço não muda.
            </p>
            {product.ingredients.map((ingredient) => (
              <label className="ingredient-option" key={ingredient}>
                <span>{ingredient}</span>
                <input
                  type="checkbox"
                  checked={!removed.includes(ingredient)}
                  onChange={(e) =>
                    setRemoved(
                      e.target.checked
                        ? removed.filter((i) => i !== ingredient)
                        : [...removed, ingredient],
                    )
                  }
                />
              </label>
            ))}
          </>
        ) : (
          <>
            <p className="muted small">
              Até 5 unidades de cada adicional por lanche. Hambúrguer extra
              também utiliza o estoque semanal.
            </p>
            {addons
              .filter((a) => a.available)
              .map((addon) => (
                <div className="addon-option" key={addon.id}>
                  <span>
                    {addon.name}
                    <small>+ {money(addon.price)}</small>
                  </span>
                  <div className="quantity-control">
                    <button
                      aria-label={`Retirar ${addon.name}`}
                      disabled={!additions[addon.id]}
                      onClick={() =>
                        setAdditions({
                          ...additions,
                          [addon.id]: Math.max(
                            0,
                            (additions[addon.id] || 0) - 1,
                          ),
                        })
                      }
                    >
                      <Minus size={14} />
                    </button>
                    <span>{additions[addon.id] || 0}</span>
                    <button
                      aria-label={`Acrescentar ${addon.name}`}
                      disabled={additions[addon.id] >= 5}
                      onClick={() =>
                        setAdditions({
                          ...additions,
                          [addon.id]: (additions[addon.id] || 0) + 1,
                        })
                      }
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>
              ))}
          </>
        )}
      </div>
      <div className="custom-footer">
        <div className="quantity-control large">
          <button
            aria-label="Diminuir quantidade"
            disabled={quantity <= 1}
            onClick={() => setQuantity(quantity - 1)}
          >
            <Minus size={17} />
          </button>
          <span>{quantity}</span>
          <button
            aria-label="Aumentar quantidade"
            disabled={quantity >= maxQuantity}
            onClick={() => setQuantity(quantity + 1)}
          >
            <Plus size={17} />
          </button>
        </div>
        <button
          className="button button-yellow"
          disabled={maxQuantity < 1}
          onClick={() =>
            onAdd({
              id: crypto.randomUUID(),
              product,
              quantity,
              removed,
              additions: Object.fromEntries(
                Object.entries(additions).filter(([, v]) => v > 0),
              ),
              addition_versions: Object.fromEntries(
                addons.map((a) => [a.id, a.version]),
              ),
              unit_price: unit,
            })
          }
        >
          <ShoppingBag size={17} />
          {maxQuantity < 1
            ? "Sacola cheia"
            : `Adicionar · ${money(unit * quantity)}`}
        </button>
      </div>
    </Modal>
  );
}

function Checkout({
  cart,
  catalog,
  onBack,
  onSuccess,
}: {
  cart: CartItem[];
  catalog: Catalog;
  onBack: () => void;
  onSuccess: () => void;
}) {
  const [fulfillment, setFulfillment] = useState(
      catalog.operation.delivery_available ? "delivery" : "pickup",
    ),
    [payment, setPayment] = useState("cash"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const request = useRef<{ fingerprint: string; key: string } | null>(null);
  const subtotal = cart.reduce((s, i) => s + i.unit_price * i.quantity, 0),
    fee = fulfillment === "delivery" ? 600 : 0,
    total = subtotal + fee;
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setBusy(true);
    const values = new FormData(event.currentTarget),
      value = (key: string) => String(values.get(key) || "");
    const data = {
      customer_name: value("customer_name"),
      phone: value("phone"),
      email: payment === "pix" ? value("email") : null,
      fulfillment,
      address:
        fulfillment === "delivery"
          ? {
              street: value("street"),
              number: value("number"),
              neighborhood: value("neighborhood"),
              city: value("city"),
              cep: value("cep"),
              complement: value("complement"),
              area: value("area"),
            }
          : null,
      payment_method: payment,
      change_for:
        payment === "cash" && value("change_for")
          ? Math.round(Number(value("change_for").replace(",", ".")) * 100)
          : null,
      service_date: catalog.operation.service_date,
      slot: value("slot"),
      items: cart.map((i) => ({
        product_id: i.product.id,
        version: i.product.version,
        quantity: i.quantity,
        removed: i.removed,
        additions: i.additions,
        addition_versions: i.addition_versions,
      })),
      whatsapp_consent: values.has("whatsapp_consent"),
      terms_accepted: values.has("terms"),
      expected_total: total,
    };
    const fingerprint = JSON.stringify(data);
    if (!request.current || request.current.fingerprint !== fingerprint)
      request.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const result = await api<{ order: Order; token: string }>("/orders", {
        method: "POST",
        headers: { "Idempotency-Key": request.current.key },
        body: JSON.stringify(data),
      });
      onSuccess();
      sessionStorage.setItem("carbons-last-order", result.token);
      window.location.assign(`/acompanhar/${result.token}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="checkout-form">
      <div className="drawer-content">
        <button type="button" className="back-link" onClick={onBack}>
          <ArrowLeft size={15} />
          Voltar à sacola
        </button>
        {catalog.operation.demo_mode && (
          <div className="notice">
            Pedido de demonstração. Nenhuma venda ou cobrança será realizada.
            Para testar entrega, use o CEP 13630-000.
          </div>
        )}
        <h3 className="form-section-title">
          <span>1</span> Como você quer receber?
        </h3>
        <div className="choice-grid">
          <button
            type="button"
            disabled={!catalog.operation.delivery_available}
            className={`choice ${fulfillment === "delivery" ? "selected" : ""}`}
            onClick={() => setFulfillment("delivery")}
          >
            <Truck size={21} />
            <b>Entrega</b>
            <small>Taxa de {money(600)}</small>
          </button>
          <button
            type="button"
            disabled={!catalog.operation.pickup_available}
            className={`choice ${fulfillment === "pickup" ? "selected" : ""}`}
            onClick={() => setFulfillment("pickup")}
          >
            <ShoppingBag size={21} />
            <b>Retirada</b>
            <small>Sem taxa</small>
          </button>
        </div>
        <div className="schedule-box">
          <CalendarDays size={19} />
          <div>
            <b>Sexta-feira, {dateLabel(catalog.operation.service_date)}</b>
            <span>Atendimento entre 20h e 22h</span>
          </div>
        </div>
        <label className="field">
          Horário desejado
          <select name="slot" required>
            <option value="20:00">20h às 20h30</option>
            <option value="20:30">20h30 às 21h</option>
            <option value="21:00">21h às 21h30</option>
            <option value="21:30">21h30 às 22h</option>
          </select>
          <small>A equipe confirma a previsão após analisar seu pedido.</small>
        </label>
        <h3 className="form-section-title">
          <span>2</span> Como podemos chamar você?
        </h3>
        <label className="field">
          Seu nome
          <input
            name="customer_name"
            placeholder="Nome e sobrenome"
            autoComplete="name"
            minLength={2}
            maxLength={100}
            required
          />
        </label>
        <label className="field">
          Celular com DDD
          <input
            name="phone"
            type="tel"
            placeholder="(19) 99999-9999"
            autoComplete="tel"
            maxLength={20}
            required
            pattern="[0-9()+ .-]{11,20}"
          />
          <small>Usado para falar sobre este pedido.</small>
        </label>
        {fulfillment === "delivery" && (
          <>
            <h3 className="form-section-title">
              <span>3</span> Onde vamos entregar?
            </h3>
            <label className="field">
              CEP
              <input
                name="cep"
                placeholder="13630-000"
                autoComplete="postal-code"
                required
                pattern="[0-9]{5}-?[0-9]{3}"
              />
            </label>
            <div className="field-row">
              <label className="field">
                Rua
                <input
                  name="street"
                  autoComplete="address-line1"
                  minLength={3}
                  maxLength={120}
                  required
                />
              </label>
              <label className="field narrow">
                Número
                <input name="number" maxLength={15} required />
              </label>
            </div>
            <label className="field">
              Bairro
              <input
                name="neighborhood"
                maxLength={80}
                minLength={2}
                required
              />
            </label>
            <label className="field">
              Complemento <span className="muted">(opcional)</span>
              <input
                name="complement"
                maxLength={120}
                autoComplete="address-line2"
              />
            </label>
            <label className="field">
              Cidade
              <input
                name="city"
                defaultValue="Pirassununga"
                autoComplete="address-level2"
                required
              />
            </label>
            <label className="field">
              Área do endereço
              <select name="area" required>
                <option value="urban">Área urbana</option>
                <option value="rural">Área rural — não atendida</option>
              </select>
            </label>
            <p className="muted small">
              Entregamos exclusivamente em CEPs urbanos de Pirassununga
              cadastrados pela equipe. Endereços fora da área serão bloqueados.
            </p>
          </>
        )}
        <h3 className="form-section-title">
          <span>{fulfillment === "delivery" ? 4 : 3}</span> Como prefere pagar?
        </h3>
        <div className="payment-options">
          {[
            ["cash", "Dinheiro", "Pagamento ao receber"],
            ["debit", "Cartão de débito", "Presencial, por aproximação"],
            ["credit", "Cartão de crédito", "Presencial, por aproximação"],
            [
              "pix",
              "Pix",
              catalog.operation.pix_enabled
                ? "QR Code com reserva de 30 minutos"
                : "Aguardando ativação",
            ],
          ].map(([id, label, note]) => (
            <label
              className={`payment-choice ${payment === id ? "selected" : ""} ${id === "pix" && !catalog.operation.pix_enabled ? "disabled" : ""}`}
              key={id}
            >
              <input
                type="radio"
                name="payment"
                value={id}
                checked={payment === id}
                disabled={id === "pix" && !catalog.operation.pix_enabled}
                onChange={() => setPayment(id)}
              />
              <span>
                <b>{label}</b>
                <small>{note}</small>
              </span>
            </label>
          ))}
        </div>
        {payment === "cash" && (
          <label className="field">
            Troco para quanto? <span className="muted">(opcional)</span>
            <input
              name="change_for"
              type="number"
              min={total / 100}
              max={1000}
              step="0.01"
              placeholder="Ex.: 100,00"
            />
            <small>Deixe em branco se não precisar de troco.</small>
          </label>
        )}
        {payment === "pix" && (
          <label className="field">
            E-mail para o Pix
            <input
              type="email"
              name="email"
              autoComplete="email"
              maxLength={254}
              required
            />
          </label>
        )}
        <label className="consent">
          <input type="checkbox" name="whatsapp_consent" />
          <span>
            Aceito receber atualizações deste pedido pelo WhatsApp.{" "}
            {catalog.operation.whatsapp_enabled
              ? ""
              : "Enquanto a integração é ativada, acompanhe pelo link do pedido."}
          </span>
        </label>
        <label className="consent">
          <input type="checkbox" name="terms" required />
          <span>
            Li e aceito as{" "}
            <Link href="/politicas" target="_blank">
              políticas de entrega, cancelamento e privacidade
            </Link>
            .
          </span>
        </label>
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
      </div>
      <div className="drawer-footer">
        <div className="summary-row">
          <span>{cart.reduce((s, i) => s + i.quantity, 0)} lanche(s)</span>
          <span>{money(subtotal)}</span>
        </div>
        <div className="summary-row">
          <span>{fulfillment === "delivery" ? "Entrega" : "Retirada"}</span>
          <span>{fee ? money(fee) : "Grátis"}</span>
        </div>
        <div className="summary-row total">
          <b>Total</b>
          <b>{money(total)}</b>
        </div>
        <button
          className="button button-yellow full"
          disabled={busy}
          type="submit"
        >
          {busy
            ? "Enviando seu pedido…"
            : catalog.operation.demo_mode
              ? "Criar pedido de teste"
              : "Finalizar pedido"}
          <ArrowRight size={18} />
        </button>
        <p className="secure-note">
          <ShieldCheck size={13} /> Seus dados são usados apenas para atender
          este pedido.
        </p>
      </div>
    </form>
  );
}
