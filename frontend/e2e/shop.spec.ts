import { test, expect, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import AxeBuilder from "@axe-core/playwright";
const apiURL = process.env.E2E_API_URL || "http://localhost:8010";

async function addBurger(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Adicionar Clássico Salada", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: /Adicionar · R\$/ }).click();
  await page.getByRole("button", { name: /Sua sacola/ }).click();
  await page.getByRole("button", { name: "Continuar para o pedido" }).click();
}
async function fillCustomer(page: Page) {
  await page
    .getByRole("textbox", { name: "Seu nome", exact: true })
    .fill("Cliente E2E");
  await page
    .getByRole("textbox", { name: "Celular com DDD" })
    .fill("19999999999");
  await page.locator('input[name="terms"]').check();
}
async function adminLogin(page: Page) {
  await page.goto("/admin");
  await expect(
    page.getByRole("button", { name: "Entrar no painel" }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "Usuário", exact: true })
    .fill(process.env.E2E_ADMIN_USER!);
  await page
    .getByLabel("Senha", { exact: true })
    .fill(process.env.E2E_ADMIN_PASSWORD!);
  const otp = execFileSync(
    process.env.E2E_PYTHON || "python3",
    [
      "-c",
      "import os, pyotp; print(pyotp.TOTP(os.environ['E2E_TOTP_SECRET']).now())",
    ],
    { encoding: "utf8" },
  ).trim();
  await page.getByRole("textbox", { name: "Código do autenticador" }).fill(otp);
  await page.getByRole("button", { name: "Entrar no painel" }).click();
  await expect(
    page.getByRole("heading", { name: "Pedidos", exact: true }),
  ).toBeVisible();
}

test("cardápio real, filtros e layout sem rolagem horizontal", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".product-card")).toHaveCount(6);
  await expect(
    page.getByRole("heading", { name: "Clássico Salada", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".product-card").first()).toContainText("R$ 28,00");
  await page.getByRole("button", { name: "Os clássicos", exact: true }).click();
  await expect(page.locator(".product-card")).toHaveCount(3);
  await page
    .getByRole("button", { name: "Todos os lanches", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Buscar lanche" }).fill("bbq");
  await expect(page.locator(".product-card")).toHaveCount(1);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBeTruthy();
  expect(errors).toEqual([]);
});

test("personalização limita adicionais e sacola persiste", async ({ page }) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Adicionar Clássico Salada", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Queijo prato", exact: true })
    .uncheck();
  await page.getByRole("button", { name: "Turbinar meu lanche" }).click();
  for (let i = 0; i < 5; i++)
    await page
      .getByRole("button", { name: "Acrescentar Bacon", exact: true })
      .click();
  await expect(
    page.getByRole("button", { name: "Acrescentar Bacon", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: /Adicionar · R\$/ }),
  ).toContainText("48,00");
  await page.getByRole("button", { name: /Adicionar · R\$/ }).click();
  await page.reload();
  await page.getByRole("button", { name: /Sua sacola/ }).click();
  await expect(page.getByRole("dialog")).toContainText("Sem: Queijo prato");
  await expect(page.getByRole("dialog")).toContainText("5× Bacon");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("pedido em dinheiro com entrega, acompanhamento e cancelamento", async ({
  page,
}) => {
  await addBurger(page);
  await fillCustomer(page);
  await page
    .getByRole("textbox", { name: "CEP", exact: true })
    .fill("13630-000");
  await page
    .getByRole("textbox", { name: "Rua", exact: true })
    .fill("Rua de teste");
  await page.getByRole("textbox", { name: "Número", exact: true }).fill("123");
  await page
    .getByRole("textbox", { name: "Bairro", exact: true })
    .fill("Centro");
  await page.getByRole("button", { name: "Criar pedido de teste" }).click();
  await expect(page).toHaveURL(/\/acompanhar\/[a-f0-9]{64}$/);
  await expect(
    page.getByText("Aguardando aprovação", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page
      .locator(".tracking-card")
      .filter({ hasText: "O que vai na sua sacola" }),
  ).toContainText("R$ 34,00");
  await page.getByRole("button", { name: "Cancelar este pedido" }).click();
  await page
    .getByRole("button", { name: "Confirmar cancelamento", exact: true })
    .click();
  await expect(
    page.getByText("Cancelado", { exact: true }).first(),
  ).toBeVisible();
});

test("retirada, MFA, preparo e recebimento no painel", async ({ page }) => {
  await addBurger(page);
  await fillCustomer(page);
  await page.getByRole("button", { name: /Retirada Sem taxa/ }).click();
  await page.getByRole("radio", { name: /Cartão de crédito/ }).check();
  await page.getByRole("button", { name: "Criar pedido de teste" }).click();
  await expect(page).toHaveURL(/\/acompanhar\/[a-f0-9]{64}$/);
  const token = page.url().split("/").pop();
  await expect(
    page.getByText("O local completo será exibido após a confirmação."),
  ).toBeVisible();
  const detail = await (
    await page.request.get(`${apiURL}/api/v1/orders/${token}`)
  ).json();
  await adminLogin(page);
  const card = page.locator(".admin-order").filter({
    has: page.getByRole("heading", { name: detail.code, exact: true }),
  });
  await card
    .getByRole("textbox", { name: "Previsão de atendimento" })
    .fill("20h30 às 21h");
  await card
    .getByRole("button", { name: "Confirmar pedido", exact: true })
    .click();
  await card
    .getByRole("button", { name: "Iniciar preparo", exact: true })
    .click();
  await card
    .getByRole("button", { name: "Marcar como pronto", exact: true })
    .click();
  await card
    .getByRole("button", { name: "Recebi o pagamento", exact: true })
    .click();
  await card
    .getByRole("button", { name: "Concluir retirada", exact: true })
    .click();
  await expect(card.locator(".status-badge")).toHaveText("Concluído");
  await page.getByRole("button", { name: "Visão geral", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Os favoritos da semana" }),
  ).toBeVisible();
  await page.goto(`/acompanhar/${token}`);
  await expect(
    page.getByText("Concluído", { exact: true }).first(),
  ).toBeVisible();
  await expect(
    page.getByText("Pagamento recebido", { exact: true }),
  ).toBeVisible();
});

test("acessibilidade do cardápio e modal por teclado", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".product-card")).toHaveCount(6);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    results.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
  await page
    .getByRole("button", { name: "Adicionar Clássico Salada", exact: true })
    .click();
  await page.keyboard.press("Tab");
  expect(
    await page.evaluate(() => !!document.activeElement?.closest("dialog")),
  ).toBeTruthy();
  const dialog = await new AxeBuilder({ page })
    .include("dialog[open]")
    .withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"])
    .analyze();
  expect(
    dialog.violations.map((v) => ({
      id: v.id,
      nodes: v.nodes.map((n) => n.target),
    })),
  ).toEqual([]);
});
