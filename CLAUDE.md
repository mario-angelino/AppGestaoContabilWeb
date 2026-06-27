# Diretrizes do projeto

## Visão do Projeto

- App web de gestão contábil (React + Vite + TypeScript + Supabase), uso interno da empresa, hospedado na Netlify.
- Migrado do AppGestaoPlanoContas (Electron) para web pura. **Hoje é 100% web — nada mais é feito para Electron.** Não usar, sugerir ou referenciar APIs Electron (`window.electronAPI`, `ipcRenderer`, `dialog`, filesystem nativo, etc.). Toda I/O de arquivo usa a File API do browser — ver `src/lib/fileUtils.ts`.
- Estado atual: Fases 0–11 concluídas (classificação de contas, importação de balancetes, DFs). Fase 12 (DFs PDF/DOCX) implementada com arquitetura diferente da planejada — ver `docs/PATTERNS.md` para o estado real.
- Supabase project-id: `wjccwtpionrorgkozsbr`

## Arquivos de Contexto

Leia estes arquivos antes de trabalhar em qualquer feature:

- `docs/PRD.md` — requisitos e escopo do produto
- `docs/PLAN.md` — decisões de design + checklist de fases
- `docs/DATABASE.md` — scripts SQL, convenções de banco, grants obrigatórios
- `docs/PATTERNS.md` — padrões de código e arquitetura real do projeto

**Sempre leia `docs/PATTERNS.md` antes de implementar qualquer coisa.**

## Manutenção dos Arquivos de Contexto

Sempre que um novo padrão for estabelecido, uma decisão técnica for tomada, ou o estado do projeto mudar, atualizar proativamente os arquivos de contexto relevantes (`docs/PATTERNS.md`, `docs/PLAN.md`, `docs/DATABASE.md`). Não esperar o usuário pedir — esses arquivos são a memória viva do projeto.

## Dependências

Antes de qualquer implementação, verificar se todas as dependências necessárias estão instaladas (`npm ls <pacote>` ou inspecionar `package.json`). Se alguma estiver faltando, informar ao usuário e executar a instalação via `npm install` após confirmação.

## Segurança

- Nunca executar comandos git/github (commit, push, pull, etc.) — o controle do git é exclusivo do usuário.
- Ao lidar com input do usuário (uploads de planilhas, formulários, query params, filtros), considerar validação e o que acontece com dados malformados ou maliciosos.
- Ao criar ou alterar queries Supabase, verificar se a tabela tem RLS habilitado e se a política cobre o novo caso de acesso — essa é a principal linha de defesa dos dados.
- Toda alteração de banco (novas tabelas, colunas, policies, grants) deve seguir o padrão documentado em `docs/DATABASE.md` (convenções de nomes, `bigserial`, FKs, RLS "acesso autenticados", GRANT obrigatório) e o arquivo deve ser atualizado com os novos scripts antes de pedir para o usuário executar no Supabase.
- Ao adicionar uma dependência nova, rodar `npm audit` e avisar se aparecer algo de severidade alta/crítica antes de seguir.
- Antes de finalizar uma feature que toca em autenticação, dados sensíveis ou upload de arquivos, rodar a skill `security-review` no diff.
- Não usar `dangerouslySetInnerHTML`, `eval` ou interpolação de HTML não sanitizado.

## Supabase

- Ao regenerar `src/lib/database.types.ts`, usar o **padrão seguro** abaixo — o CLI do Supabase escreve erros no stdout, então um pipe direto destrói o arquivo se o comando falhar. Sempre capturar em variável, validar e só então escrever:
  ```powershell
  $types = npx supabase@latest gen types typescript --project-id wjccwtpionrorgkozsbr
  if ($types -match '^export type') {
    $types | Out-File -Encoding utf8 src/lib/database.types.ts
    Write-Host "Types gerados com sucesso."
  } else {
    Write-Error "Falha na geração — arquivo original preservado."
    $types | Select-Object -First 3
  }
  ```
- Se não estiver autenticado, o usuário deve abrir um terminal PowerShell e rodar `npx supabase@latest login` antes de gerar os tipos.
- Nunca usar a ferramenta `Bash` para este comando — usar somente `PowerShell`.
