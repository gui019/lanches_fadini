# Manual da equipe

## Preparação

1. Crie a conta administrativa com `python -m app.manage create-admin --username seu_usuario` dentro de `backend`, com o ambiente virtual ativado. Use senha exclusiva com ao menos 12 caracteres. Cadastre a URI temporária no autenticador e confirme o código. O arquivo temporário é removido após a configuração.
2. Acesse `/admin`. Nenhuma conta com senha padrão é criada.
3. Confirme o cardápio, os preços, a composição do X-Turbo e os adicionais. O material enviado traz “Cheddar CATUPIRY”; a implementação oferece os dois separadamente a R$ 3,00 cada até confirmação da operação.
4. Cadastre o endereço privado em `PICKUP_ADDRESS` e os CEPs urbanos autorizados em `DELIVERY_ALLOWED_CEPS`. Não autorize CEPs que incluam áreas rurais sem validar o logradouro. Sem lista configurada, a entrega real fica indisponível; sem endereço, a retirada real fica indisponível.
5. Confira o estoque semanal e habilite o alerta sonoro no painel. O navegador exige um clique para permitir áudio.

## Receber e preparar

- Pedido em dinheiro/cartão começa aguardando aprovação; Pix começa aguardando pagamento e passa para aprovação somente após validação do provedor.
- Confira itens, retiradas, adicionais, endereço, pagamento e troco. Preencha a previsão antes de confirmar.
- Use as ações confirmar → iniciar preparo → marcar como pronto. Retirada é concluída após registrar o recebimento. Entrega passa por despacho antes da conclusão.
- `Recebi o pagamento` vale apenas para dinheiro/cartão. Não é um botão para confirmar Pix.
- O alerta sonoro depende de o painel estar aberto. Notificações push e alertas ao administrador por WhatsApp ainda não estão implementados; não dependa deles na operação.

## Cancelamento

O cliente cancela automaticamente antes do preparo. Depois disso, a solicitação aparece no painel e deve ser analisada pela equipe. Cancelar antes do preparo libera as unidades uma única vez. Após o início do preparo, unidades já consumidas não voltam automaticamente ao estoque. Pix pago entra na outbox de reembolso. Dinheiro/cartão recebido exige devolução manual e confirmação pela API administrativa `/admin/orders/{id}/refund-confirmed` após a devolução efetiva. Nunca confirme reembolso sem efetuá-lo.

## Entrega

Na aba Rotas, selecione pedidos de entrega prontos, na sequência desejada. Gerar o link despacha os pedidos. Compartilhe o link apenas com o entregador responsável. A rota dura quatro horas e pode ser revogada. O entregador pode confirmar entrega e recebimento, ou sinalizar não localizado/problema no pagamento. O link não dá acesso a outras rotas.

## Relatórios

Use o filtro de semana. Vendas brutas excluem cancelados/expirados; recebido considera pagamentos confirmados. Reembolsos ficam separados. CSV inclui valores inteiros em centavos. “Salvar PDF” abre a impressão do navegador. Taxas do Mercado Pago, custos e lucro ainda não são conciliados: o painel não apresenta números inventados para esses campos.

## Mensagens e falhas

Verifique a aba Auditoria. `blocked` indica integração ausente; `retry`, uma tentativa futura; `failed`, tentativas esgotadas; `uncertain`, envio cujo resultado não foi confirmado. Em `uncertain`, consulte a Meta antes de reenviar. O worker precisa permanecer em execução para expirações e outbox. Para reprocessar mensagens bloqueadas, primeiro configure e homologue a integração; use uma tarefa de manutenção revisada para selecionar os eventos corretos, evitando reenvio em massa.

## Backup e privacidade

Com o banco local ativo, execute `python infra/backup.py --verify` na raiz. O script salva um dump privado em `backups/`, restaura em um banco temporário e compara contagens, sem substituir o banco de trabalho. Essa verificação requer ausência de alterações simultâneas no banco. Em produção, configure backups automáticos, retenção, restauração e armazenamento criptografado.

O comando `python -m app.manage anonymize` anonimiza dados pessoais de pedidos encerrados mais antigos que `DATA_RETENTION_DAYS` (90 por padrão) e elimina sessões expiradas. Defina a retenção com o responsável antes de agendar a rotina. Pedidos ativos não são anonimizados. O backup tem retenção própria.

## Lançamento

Consulte `requirements.md`. A aplicação está em demonstração por padrão. Publicar o código no GitHub não publica o site na Internet. Antes de qualquer venda real, são necessárias hospedagem, domínio, TLS, credenciais, conta administrativa, homologação com a equipe e revisão operacional/legal prevista no plano.
