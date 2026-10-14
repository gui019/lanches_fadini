export type Product = {
  id: string;
  name: string;
  description: string;
  price: number;
  ingredients: string[];
  image: string;
  badge: string;
  available: boolean;
  version: number;
};
export type AddOn = {
  id: string;
  name: string;
  price: number;
  available: boolean;
  version: number;
};
export type Operation = {
  open: boolean;
  real_open: boolean;
  demo_mode: boolean;
  message: string;
  service_date: string;
  delivery_fee: number;
  pix_enabled: boolean;
  whatsapp_enabled: boolean;
  delivery_available: boolean;
  pickup_available: boolean;
};
export type Catalog = {
  products: Product[];
  add_ons: AddOn[];
  operation: Operation;
  stock: { available: number; capacity: number; low: boolean };
};
export type CartItem = {
  id: string;
  product: Product;
  quantity: number;
  removed: string[];
  additions: Record<string, number>;
  addition_versions: Record<string, number>;
  unit_price: number;
};
export type Snapshot = {
  name: string;
  image: string;
  quantity: number;
  unit_price: number;
  removed: string[];
  additions: { name: string; quantity: number; price: number }[];
};
export type Order = {
  id?: string;
  code: string;
  customer_name: string;
  status: string;
  payment_status: string;
  payment_method: string;
  fulfillment: string;
  items: Snapshot[];
  quantity: number;
  subtotal: number;
  delivery_fee: number;
  total: number;
  slot: string;
  service_date: string;
  estimate: string | null;
  cancel_requested: boolean;
  created_at: string;
  expires_at: string | null;
  history: { status: string; message: string; created_at: string }[];
  demo_mode: boolean;
  pickup_address?: string;
  phone?: string;
  address?: {
    street: string;
    number: string;
    neighborhood: string;
    city: string;
    cep: string;
    complement: string;
  };
  change_for?: number;
  pix?: { copy_paste: string; qr_base64: string };
};
export const money = (cents: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    cents / 100,
  );
export const dateLabel = (date: string) =>
  new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/Sao_Paulo",
  }).format(new Date(date + "T12:00:00-03:00"));
export const statusLabels: Record<string, string> = {
  pending_payment: "Aguardando Pix",
  pending_approval: "Aguardando aprovação",
  confirmed: "Confirmado",
  preparing: "Em preparo",
  ready: "Pronto",
  dispatched: "Saiu para entrega",
  completed: "Concluído",
  cancelled: "Cancelado",
  expired: "Expirado",
};
export const paymentLabels: Record<string, string> = {
  pix: "Pix",
  cash: "Dinheiro",
  debit: "Débito presencial",
  credit: "Crédito presencial",
};
