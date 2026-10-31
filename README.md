# PICO V5 — Identidade Visual Sony / Kit de Clonagem

**Escopo:** documentar e reproduzir a identidade visual **personalizada por Sony** das interfaces *PICO V5 / ULTRA CHAOS*: chat-terminal da landing, MailHub e painel administrativo próprio. **Não** é um guia de visual do PicoClaw da Sipeed e **não** replica a WebUI oficial.

**Origem autenticada:** repositório privado [sonyddr666/pico-dev-ultra-megabrain-v5](https://github.com/sonyddr666/pico-dev-ultra-megabrain-v5), branch `main`, árvore Git `1a7f9a13e5bab2ffe033b76cb09753ffbd688a5c`, consultada em **31/10/2026**.

> Os três exemplos mantêm o HTML e o CSS da origem no maior grau possível, sem depender de servidor. **Fidelidade visual: derivada diretamente dos arquivos reais. Funcionalidade: simulada nos recursos que exigem backend.** Os scripts de IA, SMTP, autenticação e status real não operam dentro deste kit.

## 1. Abrir agora

| Arquivo | O que reproduz | Fidelidade |
| --- | --- | --- |
| [01-chat.html](01-chat.html) | Landing original, monitor CRT, cubo ASCII 3D, estatísticas, console, logs, botões, histórico e prompt | Estrutura, cores, layout, animação e fonte originais; respostas IA locais simuladas |
| [02-mailhub.html](02-mailhub.html) | Tela de caixa de entrada, navegação lateral, listagem, leitura, modais, responsividade | HTML original e cascata CSS completa; caixas e mensagens fictícias |
| [03-painel.html](03-painel.html) | Console Sony após acesso, cards de status, botões e tela de login | Moldura, estilo, estrutura e textos derivados de `src/server.mjs`; autenticação e status fictícios |

Abra cada arquivo `.html` com dois cliques. Não precisa de Node.js, dependência, CDN, rede ou build.

### Navegação e interações

- **Chat:** digite `help`, `ia`, `admin`, `mail`, `coffee`, `matrix`, etc. O cubo 3D continua renderizado com o algoritmo original. Em `ia`, respostas são simuladas localmente, sem chamar modelos. Botões de café, bug e deploy continuam com o código do terminal original. O microfone fica oculto porque não há STT/TTS de verdade.
- **MailHub:** clique nas pastas, filtre mensagens, abra e-mails, favorite, mova para a lixeira, abra a composição e crie endereços fictícios. Nenhuma mensagem é realmente enviada ou recebida.
- **Painel:** mostra o estado de exemplo `pronto` como no template do backend. `Sair` exibe o estilo de login; o login local serve apenas para voltar à demonstração. **Nunca digite senha real nesse exemplo.**

## 2. DNA visual: CRT Neon / Retro-Futurismo

O PICO V5 não é apenas um "tema escuro". A identidade tem várias camadas reconhecíveis:

1. **Monitor físico simulado:** carcaça com moldura grossa, cantos arredondados e sombra ampla, sobre fundo roxo quase preto.
2. **CRT por dentro:** vidro escuro, linhas de varredura horizontais (scanlines), vinheta nas extremidades, brilho discreto e áreas internas recuadas.
3. **Terminal protagonista:** tipografia VT323, rótulos curtos em caixa alta, sintaxe de console `[SYSTEM]`, `>`, `dev@pico:~$`, números e status em neon.
4. **Neon sem descontrole:** âmbar como identidade/ação principal; ciano para dados e estados; roxo para metadados/divisões; rosa para alertas e interações; verde para sucesso.
5. **Humor técnico:** expressões como “CAFÉ, MEMES & GAMBIARRA”, “CONTROLE DO CAOS” e “ESTABILIDADE É UMA OPINIÃO.” São parte da voz visual.
6. **Interatividade real:** cube ASCII rotativo renderizado por JS, logs e comandos, LEDs, modais, linhas de status, botões com feedback; não substituir por screenshot estático.

### Tokens oficiais

| Papel | Token recomendado | Valor |
| --- | --- | --- |
| Fundo externo | `--bg` | `#040307` |
| Área do CRT | `--crt-bg` / `--panel` | `#090710` |
| Texto principal | `--text` / `--white` / `--ink` | `#f8f8f2` |
| Âmbar / título / ação | `--amber` | `#ffaa00` |
| Ciano / status / links | `--cyan` ou `--blue` | `#00f0ff` |
| Roxo / console / controles | `--purple` | `#a855f7` |
| Rosa / erro / usuário | `--pink` | `#ff0055` |
| Verde / sucesso | `--green` ou `--lime` | `#50fa7b` |
| Bordas principais | `--line` | `#2d2340` |
| Borda interna da landing | `--panel-border` | `#261f35` |
| Texto secundário da landing | `--dim-text` | `#6272a4` |
| Texto secundário do painel | `--sub` | `#9385b1` |
| Texto secundário MailHub | `--muted` | `#a29ab6` |

**Atenção:** as variáveis não têm nomes idênticos nos três arquivos. O valor e o papel visual são a referência; ao unir CSS, prefira os tokens acima com aliases.

```css
:root {
  color-scheme: dark;
  --bg:#040307; --crt-bg:#090710; --text:#f8f8f2;
  --amber:#ffaa00; --cyan:#00f0ff; --purple:#a855f7;
  --pink:#ff0055; --green:#50fa7b;
  --line:#2d2340; --panel-border:#261f35;
}
```

### Fonte e hierarquia

- **Fonte oficial:** VT323 Regular, com fallback `Consolas, monospace`. A fonte está incorporada nos três HTMLs, de forma que permaneça disponível offline.
- **Títulos:** VT323 em âmbar, grandes (landing com títulos internos conforme a seção; painel `clamp(42px, 7vw, 72px)`; MailHub inbox em torno de 43 px no desktop).
- **Texto do MailHub:** em torno de 17–21 px após a camada CRT, inclusive botões e mensagens.
- **Terminais:** texto com alternância de roxo, ciano, rosa, âmbar e verde; hierarquia por cor e peso, não por famílias tipográficas concorrentes.
- **Marcadores:** letras espaçadas 1–3 px, uppercase e símbolos de prompt.

## 3. Geometria exata que identifica a família

| Elemento | Landing / chat | MailHub | Painel Sony |
| --- | --- | --- | --- |
| Casca externa | `.crt-monitor`, largura máxima 1150 px | `.app`, largura máxima 1720 px | `.console`, largura máxima 1020 px |
| Espessura / canto | 3 px / 24 px | 3 px / 20 px | 3 px / 24 px |
| Superfície externa | `linear-gradient(145deg,#161222,#08060e)` | mesmo gradiente na casca | mesmo gradiente |
| Profundidade | shadow preto + halo roxo `#a855f7` | shadow preto + halo roxo | shadow preto + halo roxo |
| Superfície interna | `.crt-screen`, `#090710` | `.workspace`, `#090710` | `.shell`, radial escuro |
| Layout | 2 colunas `1fr 1.25fr` | sidebar 270px + corpo; listagem + leitor | uma área central; cards em grid |
| Bordas secundárias | 1–2 px, violeta escuro | 1 px, violeta escuro | 1 px, violeta escuro |
| Controles | roxo contornado; hover preenchido | âmbar principal; roxo secundário | âmbar sólido; roxo secundário |

### Estados, efeitos e animações

- **LEDs:** ciano para PWR e âmbar para CPU/SYS, glow com `box-shadow`; erro rosa.
- **CRT:** `repeating-linear-gradient` horizontal de 1 px com intervalos de 3–4 px; overlays com `pointer-events:none` para não bloquear cliques.
- **Focus:** borda/outline ciano, visível no teclado.
- **Hover:** fundo preenchido ou aumentado em brilho, com transições de ~150 ms.
- **Buttons:** 4–5 px de radius; campos fundos `#050409` ou `#07050c`, texto âmbar.
- **Selected:** lista MailHub ganha fundo roxo e barra interna roxa; inbox não lida usa ponto ciano.
- **Animação:** cubo a ~33 ms por quadro (origem usa `setInterval(renderFrame,33)`), `pulse` de LED, `shake` e `rainbow-glow`.
- **Acessibilidade:** `:focus-visible`, rótulos, `prefers-reduced-motion` no MailHub, sem gradiente ou overlay interferir nos elementos clicáveis.

## 4. Regras de responsividade

| Faixa | Como reproduzir |
| --- | --- |
| Desktop > 1100 px | Manter moldura inteira; MailHub com sidebar 270 px e leitor; chat com cubo e terminal lado a lado |
| 900–1100 px | Landing muda para 1 coluna aos **900 px**; MailHub reduz sidebar para 225 px aos **1100 px** |
| Até 740 px | MailHub vira sidebar de ícones com ~64 px; lista/leitor ocupam a mesma região, alternados no toque |
| Até 520 px | Chat reduz padding e fonte ASCII com `clamp(5px,1.65vw,8.5px)`; painel ajusta moldura, título e botões em coluna |

**Não impor “sem rolagem” como regra global:** o original chat pode crescer verticalmente no celular; o MailHub trava a moldura na altura da viewport, mas permite scroll nas regiões internas. O objetivo é preservar o comportamento real de cada página.

## 5. Como replicar em projetos futuros

1. Escolha a página base mais próxima: **terminal/cubo → 01**, **app com sidebar e dados → 02**, **acesso/estado/configuração → 03**.
2. Copie primeiro a carcaça externa, CSS global, fonte e palette. Só depois substitua conteúdo interno.
3. Preserve classes e estados visuais antes de renomear. Nunca remova scanlines e glow sem motivo.
4. Reaproveite os componentes adequados: `.crt-monitor`, `.crt-screen`, `.status-leds`, `.btn-action`; ou `.app`, `.sidebar`, `.mail-area`; ou `.console`, `.shell`, `.card`, `.pill`.
5. Teste pelo menos **1440×900** e **390×844** (desktop e celular).
6. Para cada novo backend, conecte endpoints **após** validar o front. Não coloque credenciais no HTML.

### Prompt de replicação pronto para copiar

> Use como design system **meu estilo PICO V5 / ULTRA CHAOS**, documentado no arquivo `README.md` do kit. Minha identidade é um terminal CRT retro-futurista neon personalizado, fonte VT323, fundo `#040307`, vidro `#090710`, âmbar `#ffaa00`, ciano `#00f0ff`, roxo `#a855f7`, rosa `#ff0055`, verde `#50fa7b`, moldura em gradiente `#161222→#08060e`, scanlines, sombra profunda e halo roxo. Reutilize fielmente o esqueleto e os componentes do exemplo que mais se aproxima do projeto. Preserve mobile, feedback de hover/focus, LEDs e personalidade textual. **Não copie nem use o layout padrão do PicoClaw; o estilo de referência é o front-end Sony das páginas MailHub, landing-chat e console administrativo.** Não transforme isso em um dashboard SaaS genérico nem em uma página verde/minimalista. Entregue um HTML autocontido com CSS e JavaScript.

## 6. Proveniência e limitação de fidelidade

| Superfície | Caminho real | Blob SHA / referência |
| --- | --- | --- |
| Chat / cubo | `public/landing.html` | `a767cc9f519289888ce362e12fb7f52ca2195806` |
| Voice frontend | `public/landing-voice-client.js` | `0316b3693f86d124fe8547c80b7cdf87b93a1344` |
| MailHub HTML | `mail-hub/public/index.html` | `ae2301b498d5f0e0cfbc3bccebbec1f563a85e44` |
| MailHub CSS | `mail-hub/public/style.css` | `776ce24e4c37869aa7ce43f91f3a5543a0076647` |
| Painel / login | `src/server.mjs` | `d514d6ff7837231507e53449afc765a5869bc6c7` |

A pasta `referencias/` contém snapshots originais dos arquivos públicos de interface (HTML/CSS/JS), a folha CSS do painel extraída do servidor e a licença OFL da fonte. Não inclui dados do banco, arquivos privados de configuração, .env, tokens ou backend.

**Pegadinha importante no MailHub:** o CSS começa com uma folha antiga **clara e esverdeada, compactada em uma linha**. O tema escuro CRT foi adicionado depois e vence pela cascata. **Não confunda a primeira linha do arquivo com o visual atual** nem corte a parte final ao reutilizar.

**O que é comprovado:** as dimensões, cores, fontes, CSS e estrutura foram extraídos dos arquivos da branch principal em 31/10/2026. **O que é simulado:** dados do MailHub, autenticação, estado do motor e respostas de IA. **O que não foi verificado:** comparação de pixels com uma sessão real autenticada, dependências remotas e recursos de servidor. O kit não realiza operações externas.

---

**Assinatura visual:** PICO/OS · CAFÉ, MEMES & GAMBIARRA · ESTABILIDADE É UMA OPINIÃO.
