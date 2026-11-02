# Drop de escolha: calibração

Feature portada do CS Manager (`docs/csmanager/specs-portaveis.md`, seção 1), com pesos refeitos para os nossos tiers. Código: `src/engine/ultimate/drops.ts` (regras puras) e `server/ultimate-drops.ts` (servidor). Os números abaixo saem do teste `calibração` em `server/ultimate-drops.test.ts` (20.000 drops em sequência, com o pity andando, catálogo do snapshot do servidor de julho/2026, fora de evento).

## Regras

| Regra | Valor |
|---|---|
| Estoque | 1 drop a cada 20 min, no máximo 3 guardados; o tempo acima do teto se perde |
| Conta nova | começa com 1 drop pronto |
| Opções | 3 cartas distintas (por carta e por jogador), seed de 32 bits sorteada e gravada pelo servidor |
| Janela de escolha | 30 min (no original eram 30 s) |
| Vencimento | o servidor entrega a opção de **menor valor** (quick-sell da 1ª cópia; empate: menor OVR, depois chave). A tela mostra a regra e qual carta seria |
| Pity | depois de 15 drops seguidos sem opção Ouro ou melhor, o próximo garante 1 opção Ouro+ |
| Moedas extras | nenhuma (o original dava 0 a 50 por drop) |
| Ícone (92+) e specials curados | fora do drop |

## Pesos (por milhão, por raridade base)

| Raridade | OVR | Peso | % |
|---|---|---|---|
| Bronze | até 67 | 650.000 | 65% |
| Prata | 68-73 | 330.000 | 33% |
| Ouro | 74-79 | 18.000 | 1,8% |
| Ouro Raro | 80-83 | 1.800 | 0,18% |
| Elite | 84-87 | 190 | 0,019% |
| Lendário | 88-91 | 10 | 0,001% |

Os pesos do CS Manager (55% até 60 OVR, 28% 61-70, 10% 71-75, 6% 76-80, 1% 81-84) aplicados direto ao nosso catálogo dariam Ouro+ em ~7% das opções e a melhor opção valeria ~200 por drop (primeira tentativa de calibração, medida: melhor = 203, P(Ouro+ entre as 3) = 38%), quase 3 cartas do Pacote Bronze por drop grátis.

## Resultado medido

| Métrica | Valor |
|---|---|
| Valor esperado da **melhor** das 3 opções | 86,7 |
| Valor esperado da opção de **menor** valor (o que o vencimento entrega) | 19,4 |
| Drops com alguma opção Ouro+ | 9,8% |
| Drops em que o pity disparou | 4,2% |
| Pacote Bronze (2.500 créditos, 5 cartas): valor por carta | 69,9 |
| Pacote Bronze: valor por pack | 349,6 |

Valor = quick-sell da 1ª cópia (`quickSellValue(raridade, ovr, false)`), que é o que entra na economia se o jogador vender.

Leitura:
- Um drop grátis vale em média ~1,24 carta do pack mais barato (teto do teste: 1,25), e ~25% do valor de um Pacote Bronze inteiro.
- Uso pesado realista (8 h online, 24 drops) soma ~2.080 em quick-sell, abaixo do diário médio da semana (22.300 / 7 ≈ 3.186). O teste falha se passar disso.
- O teto teórico (72 drops em 24 h sem parar) daria ~6.240/dia; exige abrir um drop a cada 20 min o dia todo e escolher a cada vez. Se a telemetria mostrar farm, baixar o teto ou o peso de Prata.
- Durante um evento as versões de evento (seção 2) ocupam a vaga da carta base; elas só existem para Ouro Raro e Elite (0,2% das opções), então o efeito no valor esperado é desprezível.
