-- Notas Explicativas: capa (nota_explicativa_bp_dre) + itens vinculados (nota_explicativa_bp_dre_itens)
--
-- Cada capa refere-se a exatamente 1 class_bp_dre + 1 empresa + 1 ano, e contém o texto
-- (antes/depois do quadro). Os itens vinculados (class_nota_explicativa) definem as linhas
-- dos quadros, agrupadas por subgrupo (AC/ANC/PC/PNC/...) no momento do cálculo.
--
-- Padrão conforme docs/DATABASE.md (bigserial, FK id_empresa integer, RLS "acesso autenticados", GRANT obrigatório).

create table public.nota_explicativa_bp_dre (
  id              bigserial primary key,
  id_class_bp_dre bigint  not null references public.class_bp_dre(id) on delete cascade,
  id_empresa      integer not null references public.empresa(id) on delete cascade,
  ano             integer not null,
  texto_antes     text,
  texto_depois    text,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (id_class_bp_dre, id_empresa, ano)
);

create table public.nota_explicativa_bp_dre_itens (
  id                         bigserial primary key,
  id_nota_explicativa_bp_dre bigint not null references public.nota_explicativa_bp_dre(id) on delete cascade,
  id_class_nota_explicativa  bigint not null references public.class_nota_explicativa(id) on delete cascade,
  created_at                 timestamptz default now(),
  unique (id_nota_explicativa_bp_dre, id_class_nota_explicativa)
);

-- GRANT obrigatório (PostgREST / Data API)
grant select, insert, update, delete
  on public.nota_explicativa_bp_dre
  to authenticated;

grant select, insert, update, delete
  on public.nota_explicativa_bp_dre_itens
  to authenticated;

alter table public.nota_explicativa_bp_dre       enable row level security;
alter table public.nota_explicativa_bp_dre_itens enable row level security;

create policy "nota_explicativa_bp_dre: acesso autenticados"
  on public.nota_explicativa_bp_dre for all
  using (auth.uid() is not null);

create policy "nota_explicativa_bp_dre_itens: acesso autenticados"
  on public.nota_explicativa_bp_dre_itens for all
  using (auth.uid() is not null);
