# Diretrizes do projeto

App de gestão contábil (React + Vite + Supabase), uso interno da empresa, hospedado na Netlify.

## Segurança

- Nunca executar comandos git/github (commit, push, pull, etc.) — o controle do git é exclusivo do usuário.
- Ao lidar com input do usuário (uploads de planilhas, formulários, query params, filtros), considerar validação e o que acontece com dados malformados ou maliciosos.
- Ao criar ou alterar queries Supabase, verificar se a tabela tem RLS habilitado e se a política cobre o novo caso de acesso — essa é a principal linha de defesa dos dados.
- Toda alteração de banco (novas tabelas, colunas, policies, grants) deve seguir o padrão documentado em `docs/DATABASE.md` (convenções de nomes, `bigserial`, FKs, RLS "acesso autenticados", GRANT obrigatório) e o arquivo deve ser atualizado com os novos scripts antes de pedir para o usuário executar no Supabase.
- Ao adicionar uma dependência nova, rodar `npm audit` e avisar se aparecer algo de severidade alta/crítica antes de seguir.
- Antes de finalizar uma feature que toca em autenticação, dados sensíveis ou upload de arquivos, rodar a skill `security-review` no diff.
- Não usar `dangerouslySetInnerHTML`, `eval` ou interpolação de HTML não sanitizado.
