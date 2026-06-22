import type { ReactNode } from 'react';
import { BrandMark } from './brand';
import { Button } from './ds';
import { LEGAL_PATHS, type LegalKind } from '../legal';

const UPDATED_AT = '22 de junho de 2026';
const CONTACT_URL = 'https://x.com/castroomath';

function ContactLink() {
  return <a href={CONTACT_URL} target="_blank" rel="noreferrer">@castroomath no X</a>;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="legal-section">
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function PrivacyContent() {
  return (
    <>
      <p className="legal-lead">
        O Road to Major é um jogo gratuito. É possível acessar todos os modos e partidas sem comprar
        uma conta. Esta política explica o que fica apenas no navegador e o que é enviado aos nossos
        servidores quando o jogador usa recursos online ou contrata a persistência em nuvem.
      </p>
      <Section title="1. Quem trata os dados">
        <p>O controlador é o Road to Major, produto digital independente operado no Brasil. Canal eletrônico para privacidade e exercício de direitos: <ContactLink />.</p>
      </Section>
      <Section title="2. Dados tratados">
        <ul>
          <li><b>Jogo gratuito:</b> perfil do manager, preferências, conquistas e saves podem ficar no armazenamento local do navegador.</li>
          <li><b>Conta opcional:</b> e-mail, nick, hash seguro da senha, situação da conta, datas e referências técnicas do pagamento.</li>
          <li><b>Persistência:</b> saves enviados à nuvem, ranking, MMR, vitórias, derrotas e histórico competitivo.</li>
          <li><b>Operação e segurança:</b> identificador aleatório de sessão, página acessada, país aproximado, navegador, dispositivo e relatórios de erro.</li>
          <li><b>Pagamento:</b> o Stripe processa Pix ou cartão. O Road to Major não recebe nem armazena o número completo do cartão.</li>
        </ul>
      </Section>
      <Section title="3. Finalidades e bases legais">
        <ul>
          <li>Executar a conta e a persistência contratadas, autenticar o jogador e sincronizar saves.</li>
          <li>Manter ranking, integridade competitiva, prevenção a fraude e segurança do serviço.</li>
          <li>Corrigir falhas e medir uso de forma limitada para melhorar e financiar a operação.</li>
          <li>Cumprir obrigações legais, fiscais, consumeristas e responder a autoridades competentes.</li>
        </ul>
        <p>As bases utilizadas, conforme o contexto, são execução de contrato, cumprimento de obrigação legal e legítimo interesse, sempre com minimização dos dados.</p>
      </Section>
      <Section title="4. Compartilhamento e serviços externos">
        <p>Usamos fornecedores necessários à operação: Vercel para hospedagem, Neon para banco de dados e Stripe para pagamentos. A página também pode carregar conteúdo do X e imagens de provedores externos, que recebem dados técnicos como endereço IP e navegador ao entregar o recurso.</p>
        <p>Não vendemos dados pessoais. Fornecedores podem processar dados fora do Brasil conforme suas políticas, contratos e mecanismos legais aplicáveis.</p>
      </Section>
      <Section title="5. Retenção">
        <ul>
          <li>Conta, save e ranking: enquanto a conta estiver ativa ou até pedido válido de exclusão.</li>
          <li>Presença online: até 24 horas.</li>
          <li>Eventos técnicos e métricas: até 24 meses.</li>
          <li>Relatórios de erro: até 90 dias.</li>
          <li>Registros financeiros: pelo prazo necessário ao cumprimento de obrigações legais e defesa de direitos.</li>
        </ul>
      </Section>
      <Section title="6. Seus direitos">
        <p>O titular pode pedir confirmação, acesso, correção, exportação e exclusão dos dados. Contas autenticadas podem exportar ou excluir os dados pelo perfil. Solicitações adicionais podem ser feitas pelo canal de contato.</p>
        <p>A exclusão da conta remove a persistência do Road to Major e não apaga automaticamente registros que o Stripe ou outros fornecedores precisem manter por obrigação legal. Dados locais permanecem sob controle do próprio navegador.</p>
      </Section>
      <Section title="7. Crianças e adolescentes">
        <p>O gameplay gratuito não possui compra obrigatória. A contratação da conta deve ser realizada por pessoa maior de 18 anos ou por responsável legal. Publicidade e serviços externos marcados como 18+ não são destinados a menores.</p>
      </Section>
      <Section title="8. Segurança e mudanças">
        <p>Adotamos hash de senha, autenticação e controles técnicos razoáveis. Nenhum sistema é infalível; incidentes relevantes serão tratados conforme a legislação. Mudanças materiais nesta política serão comunicadas nesta página.</p>
      </Section>
    </>
  );
}

function TermsContent() {
  return (
    <>
      <p className="legal-lead">Estes termos regulam o uso gratuito do jogo e a contratação opcional dos recursos persistentes do Road to Major.</p>
      <Section title="1. O jogo é gratuito">
        <p>Todos os modos, partidas e funcionalidades de gameplay podem ser usados gratuitamente, com progresso salvo no navegador. Não existe compra obrigatória, conteúdo jogável exclusivo nem vantagem competitiva vendida pelo Road to Major.</p>
      </Section>
      <Section title="2. O que é a conta de R$20">
        <p>O pagamento único remunera a criação e manutenção de uma conta autenticada, save em nuvem, sincronização entre aparelhos, ranking e MMR persistentes, histórico online e selo de apoiador. Esses recursos geram custos recorrentes de banco de dados e infraestrutura.</p>
        <p>A compra não transfere propriedade sobre o jogo, jogadores, marcas ou conteúdo de terceiros.</p>
      </Section>
      <Section title="3. Significado de acesso vitalício">
        <p>“Vitalício” significa que não há mensalidade nem nova cobrança obrigatória para manter os recursos contratados enquanto o Road to Major continuar sendo operado e tecnicamente disponibilizado. Não significa funcionamento eterno ou durante toda a vida do usuário.</p>
        <p>O serviço pode evoluir por segurança, custo, legislação ou melhoria técnica. Em eventual encerramento definitivo, buscaremos comunicar com antecedência razoável e permitir a exportação dos dados, quando tecnicamente possível.</p>
      </Section>
      <Section title="4. Conta e idade para contratação">
        <p>O jogador deve fornecer dados corretos, proteger sua senha e não compartilhar a conta. A contratação deve ser feita por maior de 18 anos ou por responsável legal. Uma conta pode ser suspensa em caso de fraude, abuso, tentativa de invasão ou manipulação do ranking, com preservação dos direitos legais do consumidor.</p>
      </Section>
      <Section title="5. Disponibilidade e saves">
        <p>Empregamos esforços razoáveis de disponibilidade e backup, mas interrupções e falhas podem ocorrer. O jogador gratuito é responsável pelos dados mantidos somente no navegador. A exportação periódica é recomendada para contas com save em nuvem.</p>
      </Section>
      <Section title="6. Conduta no online">
        <p>Não é permitido assediar outros jogadores, explorar falhas, automatizar ações, fraudar resultados, tentar acessar contas alheias ou prejudicar a infraestrutura. Medidas proporcionais podem incluir remoção de conteúdo, perda de ranking ou suspensão.</p>
      </Section>
      <Section title="7. Projeto independente e terceiros">
        <p>Road to Major é um produto comercial independente, não afiliado, patrocinado, autorizado ou endossado pela Valve Corporation, HLTV, Liquipedia, equipes ou jogadores representados. Counter-Strike e marcas relacionadas pertencem a seus respectivos titulares.</p>
        <p>Links e anúncios externos possuem termos próprios. A identificação como patrocinador não representa recomendação irrestrita nem responsabilidade do Road to Major pela operação do terceiro.</p>
      </Section>
      <Section title="8. Reembolso, privacidade e contato">
        <p>A <a href={LEGAL_PATHS.refund}>Política de Reembolso</a> e a <a href={LEGAL_PATHS.privacy}>Política de Privacidade</a> integram estes termos. Atendimento eletrônico: <ContactLink />.</p>
      </Section>
      <Section title="9. Lei aplicável">
        <p>Aplicam-se as leis brasileiras, especialmente o Código de Defesa do Consumidor e a LGPD. Estes termos não limitam direitos legais indisponíveis.</p>
      </Section>
    </>
  );
}

function RefundContent() {
  return (
    <>
      <p className="legal-lead">O gameplay é gratuito. Esta política se aplica somente ao pagamento único da conta com persistência em nuvem.</p>
      <Section title="1. Direito de arrependimento">
        <p>O consumidor pode solicitar o cancelamento e o reembolso em até 7 dias corridos da contratação online, sem necessidade de justificativa, conforme a legislação brasileira.</p>
      </Section>
      <Section title="2. Como solicitar">
        <p>Entre em contato por <ContactLink /> informando o e-mail da conta, a data aproximada e o identificador ou comprovante do pagamento. Nunca envie senha ou número completo do cartão.</p>
      </Section>
      <Section title="3. Forma e prazo do estorno">
        <p>Após a validação, o reembolso será solicitado pelo mesmo meio de pagamento. O prazo para aparecer na fatura ou conta depende do Stripe, do banco e da bandeira do cartão. O acesso aos recursos persistentes poderá ser encerrado quando o reembolso for confirmado.</p>
      </Section>
      <Section title="4. Depois de 7 dias">
        <p>Pedidos relacionados a cobrança duplicada, fraude, indisponibilidade relevante ou defeito não solucionado serão analisados individualmente, sem prejuízo das garantias previstas em lei.</p>
      </Section>
      <Section title="5. Exclusão não é reembolso">
        <p>Excluir a conta remove saves, ranking e dados operacionais associados, mas não cria automaticamente um pedido de estorno. Para reembolso, use o procedimento desta política antes de excluir a conta.</p>
      </Section>
    </>
  );
}

const TITLES: Record<LegalKind, string> = {
  privacy: 'Política de Privacidade',
  terms: 'Termos de Uso e Compra',
  refund: 'Política de Reembolso',
};

export function LegalLinks({ className = '' }: { className?: string }) {
  return (
    <nav className={`legal-links ${className}`.trim()} aria-label="Informações legais">
      <a href={LEGAL_PATHS.terms}>Termos</a>
      <a href={LEGAL_PATHS.privacy}>Privacidade</a>
      <a href={LEGAL_PATHS.refund}>Reembolso</a>
    </nav>
  );
}

export function LegalPage({ kind, onBack }: { kind: LegalKind; onBack: () => void }) {
  return (
    <main className="legal-page">
      <header className="legal-header">
        <a href="/" onClick={(event) => { event.preventDefault(); onBack(); }} className="legal-brand">
          <BrandMark size={34} />
          <span>ROAD TO <b>MAJOR</b></span>
        </a>
        <Button variant="ghost" size="sm" onClick={onBack}>Voltar</Button>
      </header>
      <article className="legal-document">
        <div className="legal-title">
          <span>TRANSPARÊNCIA</span>
          <h1>{TITLES[kind]}</h1>
          <p>Atualizado em {UPDATED_AT}</p>
        </div>
        {kind === 'privacy' && <PrivacyContent />}
        {kind === 'terms' && <TermsContent />}
        {kind === 'refund' && <RefundContent />}
      </article>
      <LegalLinks className="legal-page-links" />
    </main>
  );
}
