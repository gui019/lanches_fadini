import Link from "next/link";
import { SimpleHeader } from "@/components/simple-header";
export default function Policies() {
  return (
    <>
      <SimpleHeader />
      <main className="narrow-page">
        <span className="eyebrow">TRANSPARÊNCIA EM CADA ETAPA</span>
        <h1 className="page-title">Combinados da casa.</h1>
        <p className="page-lead">
          Entrega, pedidos, pagamentos e cuidado com seus dados. Versão inicial
          para revisão e aprovação da operação antes das vendas reais.
        </p>
        <div className="notice">
          O site pode funcionar em modo de demonstração. Nesse modo, os pedidos
          são testes, não geram cobranças e não representam compras reais.
        </div>
        <section className="legal-section">
          <h2>1. Atendimento e entrega</h2>
          <p>
            Atendemos às sextas-feiras, das 20h às 22h. Os agendamentos abrem
            segunda-feira às 15h e ficam disponíveis até quinta-feira. Na sexta,
            os pedidos do dia são recebidos das 18h às 21h30. Todos os horários
            seguem America/Sao_Paulo.
          </p>
          <p>
            A entrega custa R$ 6,00 e se limita aos CEPs urbanos de Pirassununga
            autorizados pela equipe. Não atendemos a área rural nem outras
            cidades. A retirada não tem taxa, e o local completo aparece apenas
            no acompanhamento após a confirmação. O horário escolhido é uma
            preferência; a equipe informa a previsão confirmada.
          </p>
        </section>
        <section className="legal-section">
          <h2>2. Lanches, personalização e estoque</h2>
          <p>
            Cada pedido deve ter de um a dez lanches. Você pode retirar
            ingredientes sem alterar o preço e pedir até cinco unidades de cada
            adicional por lanche. O lote inicial é de 40 hambúrgueres por
            semana; hambúrgueres extras também consomem esse estoque. A
            disponibilidade é validada no momento do envio, e os valores finais
            são recalculados pelo servidor.
          </p>
          <p>
            As fotos do site são ilustrações geradas para a apresentação dos
            produtos. O cardápio se baseia na imagem fornecida pela operação.
            Composições e nomenclaturas devem ser confirmadas pelo responsável,
            especialmente o X-Turbo e os adicionais cheddar e Catupiry.
          </p>
        </section>
        <section className="legal-section">
          <h2>3. Pagamento</h2>
          <p>
            Dinheiro, débito e crédito são pagos presencialmente. Não
            solicitamos números ou senhas de cartão. Informe o troco necessário
            ao pedir em dinheiro. O Pix depende da ativação da integração com o
            Mercado Pago. Quando disponível, a reserva dura 30 minutos e a
            confirmação depende do retorno validado do provedor, nunca de um
            comprovante enviado ao navegador.
          </p>
        </section>
        <section className="legal-section">
          <h2>4. Cancelamento e reembolso</h2>
          <p>
            Antes do início do preparo, o cancelamento pelo link libera o
            estoque automaticamente. Após o início do preparo, o pedido de
            cancelamento é encaminhado para análise da equipe. Para Pix já pago,
            o sistema solicita reembolso e exibe o andamento; o prazo de crédito
            depende do provedor. Para pagamentos presenciais já recebidos,
            combine a devolução com a equipe. O histórico de alterações fica
            registrado.
          </p>
        </section>
        <section className="legal-section">
          <h2>5. Ingredientes e alergênicos</h2>
          <p>
            Os produtos podem conter glúten, leite, ovos, soja e outros
            alergênicos. Há possibilidade de contaminação cruzada na cozinha.
            Retirar um ingrediente não garante ausência de traços. Se você tem
            alergia ou restrição alimentar, fale com a equipe antes de fazer um
            pedido.
          </p>
        </section>
        <section className="legal-section">
          <h2>6. Privacidade e LGPD</h2>
          <p>
            Coletamos nome, telefone e, em entregas, endereço para atender seu
            pedido. O e-mail é solicitado somente quando necessário para Pix. A
            base do tratamento é a execução do pedido e as obrigações
            aplicáveis. O aceite para atualizações por WhatsApp é opcional,
            separado de marketing; nenhuma campanha está ativada neste MVP.
          </p>
          <p>
            O Mercado Pago processa o Pix quando habilitado; a Meta processa
            mensagens quando a integração WhatsApp está habilitada. Os dados
            necessários também são tratados pela infraestrutura contratada pela
            operação. Não vendemos seus dados. A sacola fica no armazenamento
            local do navegador, e o último link de pedido fica apenas na sessão.
            O painel usa um cookie de autenticação necessário.
          </p>
          <p>
            Links de acompanhamento dão acesso limitado ao próprio pedido por
            até sete dias após a data de atendimento. Links de entregador
            expiram após quatro horas ou quando revogados. Você deve mantê-los
            privados. O endereço completo de entrega não aparece no
            acompanhamento público.
          </p>
          <p>
            A rotina técnica inicial prevê anonimização de dados pessoais de
            pedidos encerrados após 90 dias, sujeita à aprovação da política e
            às obrigações fiscais aplicáveis. O responsável deve configurar a
            execução periódica e a retenção dos backups. Dados comerciais
            mínimos e auditoria podem precisar de conservação por prazo legal.
          </p>
          <p>
            Para solicitar acesso, correção, exclusão ou anonimização, entre em
            contato pelo WhatsApp{" "}
            <a href="https://wa.me/5519996784305">(19) 99678-4305</a>. A
            identificação jurídica do controlador, a hospedagem e os prazos
            finais serão preenchidos pela operação antes do lançamento.
          </p>
        </section>
        <section className="legal-section">
          <h2>7. Uso do site</h2>
          <p>
            O pedido só está confirmado após a aprovação da equipe e, para Pix,
            validação do pagamento. Tentativas de fraude, automação abusiva ou
            alteração de valores podem ser bloqueadas. Não é necessário criar
            conta. Guarde o link emitido ao concluir para consultar o
            atendimento.
          </p>
        </section>
        <Link href="/#cardapio" className="button button-yellow">
          Voltar para o cardápio
        </Link>
      </main>
    </>
  );
}
