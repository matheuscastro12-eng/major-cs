# NOTES-PR (remover antes do merge)

## Stripe: nome "PreceptorAPG" no topo do Checkout

O nome mostrado no topo da página do Stripe Checkout (e no recibo) é o **nome
público da empresa da conta Stripe**, não um parâmetro da sessão. Não dá pra
trocar por código. Precisa mudar no Dashboard:

1. Dashboard Stripe → **Settings → Business → Public details** →
   **Public business name** = `Road to Major` (e o site/URL de suporte).
2. **Settings → Branding**: ícone/logo e cor do Road to Major (aparecem no Checkout).
3. **Settings → Business → Public details → Statement descriptor**: o prefixo
   da fatura é o descritor da conta; o código agora manda o sufixo
   `ROAD TO MAJOR` (payment_intent_data.statement_descriptor_suffix). Se a conta
   for compartilhada com outro produto (PreceptorAPG), o descritor curto
   (shortened descriptor) deve ser algo neutro, ex.: `PRECEPT`, pra fatura ficar
   `PRECEPT* ROAD TO MAJOR`.
   Alternativa limpa: criar uma conta Stripe separada pro Road to Major (outra
   STRIPE_SECRET_KEY / webhook secret na Vercel).

## Stripe: preço em USD ($6.46)

Corrigido por código: as sessões agora vão com `adaptive_pricing: { enabled: false }`
e `locale: 'pt-BR'`. Opcional: desligar também em **Settings → Payments →
Adaptive Pricing** pra valer pra qualquer sessão/Payment Link criado fora do código
(o Payment Link legado do fallback `checkoutUrl` NÃO passa pelos params da sessão:
confira nele, no Dashboard, se Adaptive Pricing está desligado).
