export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.4"
  }
  public: {
    Tables: {
      balancete: {
        Row: {
          ano: number
          dt_importacao: string | null
          id: number
          mes: number
          user_importacao: string | null
          vigencia_id: number
        }
        Insert: {
          ano: number
          dt_importacao?: string | null
          id?: number
          mes: number
          user_importacao?: string | null
          vigencia_id: number
        }
        Update: {
          ano?: number
          dt_importacao?: string | null
          id?: number
          mes?: number
          user_importacao?: string | null
          vigencia_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "balancete_vigencia_id_fkey"
            columns: ["vigencia_id"]
            isOneToOne: false
            referencedRelation: "plano_contas_vigencia"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balancete_vigencia_id_fkey"
            columns: ["vigencia_id"]
            isOneToOne: false
            referencedRelation: "vw_empresas_balancetes_vigencia"
            referencedColumns: ["vigencia_id"]
          },
          {
            foreignKeyName: "balancete_vigencia_id_fkey"
            columns: ["vigencia_id"]
            isOneToOne: false
            referencedRelation: "vw_empresas_planocontas_vigencia"
            referencedColumns: ["vigencia_id"]
          },
          {
            foreignKeyName: "balancete_vigencia_id_fkey"
            columns: ["vigencia_id"]
            isOneToOne: false
            referencedRelation: "vw_planocontas_vigencia"
            referencedColumns: ["vigencia_id"]
          },
        ]
      }
      balancete_itens: {
        Row: {
          balancete_id: number
          conta: string
          descricao: string
          id: number
          reduzido: number
          saldo_anterior: number
          saldo_atual: number
          val_credito: number
          val_debito: number
        }
        Insert: {
          balancete_id: number
          conta: string
          descricao: string
          id?: number
          reduzido: number
          saldo_anterior?: number
          saldo_atual?: number
          val_credito?: number
          val_debito?: number
        }
        Update: {
          balancete_id?: number
          conta?: string
          descricao?: string
          id?: number
          reduzido?: number
          saldo_anterior?: number
          saldo_atual?: number
          val_credito?: number
          val_debito?: number
        }
        Relationships: [
          {
            foreignKeyName: "balancete_itens_balancete_id_fkey"
            columns: ["balancete_id"]
            isOneToOne: false
            referencedRelation: "balancete"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "balancete_itens_balancete_id_fkey"
            columns: ["balancete_id"]
            isOneToOne: false
            referencedRelation: "vw_balancete_periodo"
            referencedColumns: ["balancete_id"]
          },
          {
            foreignKeyName: "balancete_itens_balancete_id_fkey"
            columns: ["balancete_id"]
            isOneToOne: false
            referencedRelation: "vw_empresas_balancetes_vigencia"
            referencedColumns: ["balancete_id"]
          },
        ]
      }
      class_bp_dre: {
        Row: {
          created_at: string
          desc_bp_dre: string
          id: number
        }
        Insert: {
          created_at?: string
          desc_bp_dre: string
          id?: number
        }
        Update: {
          created_at?: string
          desc_bp_dre?: string
          id?: number
        }
        Relationships: []
      }
      class_bp_dre_subgrupo: {
        Row: {
          id: number
          id_class_bp_dre: number
          id_class_subgrupo: number
          indice: number | null
        }
        Insert: {
          id?: number
          id_class_bp_dre: number
          id_class_subgrupo: number
          indice?: number | null
        }
        Update: {
          id?: number
          id_class_bp_dre?: number
          id_class_subgrupo?: number
          indice?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "class_bp_dre_subgrupo_id_class_bp_dre_fkey"
            columns: ["id_class_bp_dre"]
            isOneToOne: false
            referencedRelation: "class_bp_dre"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_bp_dre_subgrupo_id_class_bp_dre_fkey"
            columns: ["id_class_bp_dre"]
            isOneToOne: false
            referencedRelation: "vw_planocontas_vigencia"
            referencedColumns: ["bp_dre_id"]
          },
          {
            foreignKeyName: "class_bp_dre_subgrupo_id_class_subgrupo_fkey"
            columns: ["id_class_subgrupo"]
            isOneToOne: false
            referencedRelation: "class_subgrupo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_bp_dre_subgrupo_id_class_subgrupo_fkey"
            columns: ["id_class_subgrupo"]
            isOneToOne: false
            referencedRelation: "vw_planocontas_vigencia"
            referencedColumns: ["subgrupo_id"]
          },
        ]
      }
      class_grupo: {
        Row: {
          created_at: string | null
          desc_grupo: string
          id: number
        }
        Insert: {
          created_at?: string | null
          desc_grupo: string
          id?: number
        }
        Update: {
          created_at?: string | null
          desc_grupo?: string
          id?: number
        }
        Relationships: []
      }
      class_nota_explicativa: {
        Row: {
          created_at: string
          desc_ne: string
          id: number
        }
        Insert: {
          created_at?: string
          desc_ne: string
          id?: number
        }
        Update: {
          created_at?: string
          desc_ne?: string
          id?: number
        }
        Relationships: []
      }
      class_papel_trabalho: {
        Row: {
          created_at: string
          desc_papel: string
          id: number
          sigla_papel: string
        }
        Insert: {
          created_at?: string
          desc_papel: string
          id?: number
          sigla_papel: string
        }
        Update: {
          created_at?: string
          desc_papel?: string
          id?: number
          sigla_papel?: string
        }
        Relationships: []
      }
      class_subgrupo: {
        Row: {
          created_at: string
          desc_subgrupo: string
          id: number
          id_class_grupo: number
          sigla_subgrupo: string
        }
        Insert: {
          created_at?: string
          desc_subgrupo: string
          id?: number
          id_class_grupo: number
          sigla_subgrupo: string
        }
        Update: {
          created_at?: string
          desc_subgrupo?: string
          id?: number
          id_class_grupo?: number
          sigla_subgrupo?: string
        }
        Relationships: [
          {
            foreignKeyName: "class_subgrupo_id_class_grupo_fkey"
            columns: ["id_class_grupo"]
            isOneToOne: false
            referencedRelation: "class_grupo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "class_subgrupo_id_class_grupo_fkey"
            columns: ["id_class_grupo"]
            isOneToOne: false
            referencedRelation: "vw_planocontas_vigencia"
            referencedColumns: ["grupo_id"]
          },
        ]
      }
      df_campo_calculado: {
        Row: {
          created_at: string | null
          fl_indentado: boolean
          id: number
          nome: string
          tipo_df: string
        }
        Insert: {
          created_at?: string | null
          fl_indentado?: boolean
          id?: number
          nome: string
          tipo_df: string
        }
        Update: {
          created_at?: string | null
          fl_indentado?: boolean
          id?: number
          nome?: string
          tipo_df?: string
        }
        Relationships: []
      }
      df_campo_calculado_operando: {
        Row: {
          id: number
          id_campo_calculado: number
          id_campo_calculado_ref: number | null
          id_class_bp_dre: number | null
          sinal: number
        }
        Insert: {
          id?: number
          id_campo_calculado: number
          id_campo_calculado_ref?: number | null
          id_class_bp_dre?: number | null
          sinal: number
        }
        Update: {
          id?: number
          id_campo_calculado?: number
          id_campo_calculado_ref?: number | null
          id_class_bp_dre?: number | null
          sinal?: number
        }
        Relationships: [
          {
            foreignKeyName: "df_campo_calculado_operando_id_campo_calculado_fkey"
            columns: ["id_campo_calculado"]
            isOneToOne: false
            referencedRelation: "df_campo_calculado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "df_campo_calculado_operando_id_campo_calculado_ref_fkey"
            columns: ["id_campo_calculado_ref"]
            isOneToOne: false
            referencedRelation: "df_campo_calculado"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "df_campo_calculado_operando_id_class_bp_dre_fkey"
            columns: ["id_class_bp_dre"]
            isOneToOne: false
            referencedRelation: "class_bp_dre"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "df_campo_calculado_operando_id_class_bp_dre_fkey"
            columns: ["id_class_bp_dre"]
            isOneToOne: false
            referencedRelation: "vw_planocontas_vigencia"
            referencedColumns: ["bp_dre_id"]
          },
        ]
      }
      empresa: {
        Row: {
          abreviacao: string
          cnpj: string | null
          dt_cadastro: string | null
          fl_ativa: boolean | null
          fl_consolida_ebisa: boolean | null
          fl_controlada: boolean | null
          fl_controladora: boolean | null
          id: number
          nome_logo: string | null
          razao_social: string
        }
        Insert: {
          abreviacao: string
          cnpj?: string | null
          dt_cadastro?: string | null
          fl_ativa?: boolean | null
          fl_consolida_ebisa?: boolean | null
          fl_controlada?: boolean | null
          fl_controladora?: boolean | null
          id?: number
          nome_logo?: string | null
          razao_social: string
        }
        Update: {
          abreviacao?: string
          cnpj?: string | null
          dt_cadastro?: string | null
          fl_ativa?: boolean | null
          fl_consolida_ebisa?: boolean | null
          fl_controlada?: boolean | null
          fl_controladora?: boolean | null
          id?: number
          nome_logo?: string | null
          razao_social?: string
        }
        Relationships: []
      }
      nota_explicativa_bp_dre: {
        Row: {
          ano: number
          created_at: string | null
          id: number
          id_class_bp_dre: number | null
          id_empresa: number
          mes: number
          numero_nota: number | null
          texto_antes: string | null
          texto_depois: string | null
          tipo: string
          titulo: string | null
          updated_at: string | null
        }
        Insert: {
          ano: number
          created_at?: string | null
          id?: number
          id_class_bp_dre?: number | null
          id_empresa: number
          mes?: number
          numero_nota?: number | null
          texto_antes?: string | null
          texto_depois?: string | null
          tipo?: string
          titulo?: string | null
          updated_at?: string | null
        }
        Update: {
          ano?: number
          created_at?: string | null
          id?: number
          id_class_bp_dre?: number | null
          id_empresa?: number
          mes?: number
          numero_nota?: number | null
          texto_antes?: string | null
          texto_depois?: string | null
          tipo?: string
          titulo?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "nota_explicativa_bp_dre_id_class_bp_dre_fkey"
            columns: ["id_class_bp_dre"]
            isOneToOne: false
            referencedRelation: "class_bp_dre"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nota_explicativa_bp_dre_id_class_bp_dre_fkey"
            columns: ["id_class_bp_dre"]
            isOneToOne: false
            referencedRelation: "vw_planocontas_vigencia"
            referencedColumns: ["bp_dre_id"]
          },
          {
            foreignKeyName: "nota_explicativa_bp_dre_id_empresa_fkey"
            columns: ["id_empresa"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nota_explicativa_bp_dre_id_empresa_fkey"
            columns: ["id_empresa"]
            isOneToOne: false
            referencedRelation: "vw_empresas_balancetes_vigencia"
            referencedColumns: ["empresa_id"]
          },
          {
            foreignKeyName: "nota_explicativa_bp_dre_id_empresa_fkey"
            columns: ["id_empresa"]
            isOneToOne: false
            referencedRelation: "vw_empresas_planocontas_vigencia"
            referencedColumns: ["empresa_id"]
          },
          {
            foreignKeyName: "nota_explicativa_bp_dre_id_empresa_fkey"
            columns: ["id_empresa"]
            isOneToOne: false
            referencedRelation: "vw_planocontas_vigencia"
            referencedColumns: ["empresa_id"]
          },
        ]
      }
      nota_explicativa_bp_dre_itens: {
        Row: {
          created_at: string | null
          id: number
          id_class_nota_explicativa: number
          id_nota_explicativa_bp_dre: number
        }
        Insert: {
          created_at?: string | null
          id?: number
          id_class_nota_explicativa: number
          id_nota_explicativa_bp_dre: number
        }
        Update: {
          created_at?: string | null
          id?: number
          id_class_nota_explicativa?: number
          id_nota_explicativa_bp_dre?: number
        }
        Relationships: [
          {
            foreignKeyName: "nota_explicativa_bp_dre_itens_id_class_nota_explicativa_fkey"
            columns: ["id_class_nota_explicativa"]
            isOneToOne: false
            referencedRelation: "class_nota_explicativa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nota_explicativa_bp_dre_itens_id_class_nota_explicativa_fkey"
            columns: ["id_class_nota_explicativa"]
            isOneToOne: false
            referencedRelation: "vw_planocontas_vigencia"
            referencedColumns: ["nota_explicativa_id"]
          },
          {
            foreignKeyName: "nota_explicativa_bp_dre_itens_id_nota_explicativa_bp_dre_fkey"
            columns: ["id_nota_explicativa_bp_dre"]
            isOneToOne: false
            referencedRelation: "nota_explicativa_bp_dre"
            referencedColumns: ["id"]
          },
        ]
      }
      nota_explicativa_bp_dre_wrappers: {
        Row: {
          created_at: string | null
          id: number
          id_nota_explicativa_bp_dre: number
          id_nota_wrapper: number
        }
        Insert: {
          created_at?: string | null
          id?: number
          id_nota_explicativa_bp_dre: number
          id_nota_wrapper: number
        }
        Update: {
          created_at?: string | null
          id?: number
          id_nota_explicativa_bp_dre?: number
          id_nota_wrapper?: number
        }
        Relationships: [
          {
            foreignKeyName: "nota_explicativa_bp_dre_variave_id_nota_explicativa_bp_dre_fkey"
            columns: ["id_nota_explicativa_bp_dre"]
            isOneToOne: false
            referencedRelation: "nota_explicativa_bp_dre"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nota_explicativa_bp_dre_wrappers_id_nota_wrapper_fkey"
            columns: ["id_nota_wrapper"]
            isOneToOne: false
            referencedRelation: "nota_wrapper"
            referencedColumns: ["id"]
          },
        ]
      }
      nota_wrapper: {
        Row: {
          created_at: string | null
          descricao: string
          id: number
        }
        Insert: {
          created_at?: string | null
          descricao: string
          id?: number
        }
        Update: {
          created_at?: string | null
          descricao?: string
          id?: number
        }
        Relationships: []
      }
      nota_wrapper_operando: {
        Row: {
          id: number
          id_class_nota_explicativa: number
          id_nota_wrapper: number
          sinal: number
        }
        Insert: {
          id?: number
          id_class_nota_explicativa: number
          id_nota_wrapper: number
          sinal: number
        }
        Update: {
          id?: number
          id_class_nota_explicativa?: number
          id_nota_wrapper?: number
          sinal?: number
        }
        Relationships: [
          {
            foreignKeyName: "nota_variavel_operando_id_class_nota_explicativa_fkey"
            columns: ["id_class_nota_explicativa"]
            isOneToOne: false
            referencedRelation: "class_nota_explicativa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "nota_variavel_operando_id_class_nota_explicativa_fkey"
            columns: ["id_class_nota_explicativa"]
            isOneToOne: false
            referencedRelation: "vw_planocontas_vigencia"
            referencedColumns: ["nota_explicativa_id"]
          },
          {
            foreignKeyName: "nota_wrapper_operando_id_nota_wrapper_fkey"
            columns: ["id_nota_wrapper"]
            isOneToOne: false
            referencedRelation: "nota_wrapper"
            referencedColumns: ["id"]
          },
        ]
      }
      OLD_conta_natureza: {
        Row: {
          created_at: string | null
          desc_natureza: string | null
          id: number
          id_conta_grupo: number
          sigla_natureza: string | null
        }
        Insert: {
          created_at?: string | null
          desc_natureza?: string | null
          id?: number
          id_conta_grupo: number
          sigla_natureza?: string | null
        }
        Update: {
          created_at?: string | null
          desc_natureza?: string | null
          id?: number
          id_conta_grupo?: number
          sigla_natureza?: string | null
        }
        Relationships: []
      }
      plano_contas: {
        Row: {
          descricao: string | null
          dt_criacao: string | null
          id: number
          nome: string
        }
        Insert: {
          descricao?: string | null
          dt_criacao?: string | null
          id?: number
          nome: string
        }
        Update: {
          descricao?: string | null
          dt_criacao?: string | null
          id?: number
          nome?: string
        }
        Relationships: []
      }
      plano_contas_itens: {
        Row: {
          conta: string
          desc_conta: string
          fl_ativa: boolean
          id: number
          id_class_bp_dre: number | null
          id_class_nota_explicativa: number | null
          id_class_papel_trabalho: number | null
          id_class_subgrupo: number | null
          id_plano_contas: number
          reduzido: number
        }
        Insert: {
          conta: string
          desc_conta: string
          fl_ativa?: boolean
          id?: number
          id_class_bp_dre?: number | null
          id_class_nota_explicativa?: number | null
          id_class_papel_trabalho?: number | null
          id_class_subgrupo?: number | null
          id_plano_contas: number
          reduzido: number
        }
        Update: {
          conta?: string
          desc_conta?: string
          fl_ativa?: boolean
          id?: number
          id_class_bp_dre?: number | null
          id_class_nota_explicativa?: number | null
          id_class_papel_trabalho?: number | null
          id_class_subgrupo?: number | null
          id_plano_contas?: number
          reduzido?: number
        }
        Relationships: [
          {
            foreignKeyName: "plano_contas_itens_id_class_bp_dre_fkey"
            columns: ["id_class_bp_dre"]
            isOneToOne: false
            referencedRelation: "class_bp_dre"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plano_contas_itens_id_class_bp_dre_fkey"
            columns: ["id_class_bp_dre"]
            isOneToOne: false
            referencedRelation: "vw_planocontas_vigencia"
            referencedColumns: ["bp_dre_id"]
          },
          {
            foreignKeyName: "plano_contas_itens_id_class_ne_fkey"
            columns: ["id_class_nota_explicativa"]
            isOneToOne: false
            referencedRelation: "class_nota_explicativa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plano_contas_itens_id_class_ne_fkey"
            columns: ["id_class_nota_explicativa"]
            isOneToOne: false
            referencedRelation: "vw_planocontas_vigencia"
            referencedColumns: ["nota_explicativa_id"]
          },
          {
            foreignKeyName: "plano_contas_itens_id_class_papel_trabalho_fkey"
            columns: ["id_class_papel_trabalho"]
            isOneToOne: false
            referencedRelation: "class_papel_trabalho"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plano_contas_itens_id_class_papel_trabalho_fkey"
            columns: ["id_class_papel_trabalho"]
            isOneToOne: false
            referencedRelation: "vw_planocontas_vigencia"
            referencedColumns: ["papel_trabalho_id"]
          },
          {
            foreignKeyName: "plano_contas_itens_id_class_subgrupo_fkey"
            columns: ["id_class_subgrupo"]
            isOneToOne: false
            referencedRelation: "class_subgrupo"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plano_contas_itens_id_class_subgrupo_fkey"
            columns: ["id_class_subgrupo"]
            isOneToOne: false
            referencedRelation: "vw_planocontas_vigencia"
            referencedColumns: ["subgrupo_id"]
          },
          {
            foreignKeyName: "plano_contas_itens_plano_contas_id_fkey"
            columns: ["id_plano_contas"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plano_contas_itens_plano_contas_id_fkey"
            columns: ["id_plano_contas"]
            isOneToOne: false
            referencedRelation: "vw_planocontas_vigencia"
            referencedColumns: ["plano_contas_id"]
          },
        ]
      }
      plano_contas_vigencia: {
        Row: {
          ano_vigencia: number
          created_at: string | null
          empresa_id: number
          id: number
          plano_contas_id: number
        }
        Insert: {
          ano_vigencia: number
          created_at?: string | null
          empresa_id: number
          id?: number
          plano_contas_id: number
        }
        Update: {
          ano_vigencia?: number
          created_at?: string | null
          empresa_id?: number
          id?: number
          plano_contas_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "plano_contas_vigencia_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plano_contas_vigencia_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "vw_empresas_balancetes_vigencia"
            referencedColumns: ["empresa_id"]
          },
          {
            foreignKeyName: "plano_contas_vigencia_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "vw_empresas_planocontas_vigencia"
            referencedColumns: ["empresa_id"]
          },
          {
            foreignKeyName: "plano_contas_vigencia_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "vw_planocontas_vigencia"
            referencedColumns: ["empresa_id"]
          },
          {
            foreignKeyName: "plano_contas_vigencia_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plano_contas_vigencia_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "vw_planocontas_vigencia"
            referencedColumns: ["plano_contas_id"]
          },
        ]
      }
      user_perfil: {
        Row: {
          id: number
          id_empresa: number
          id_user: string
        }
        Insert: {
          id?: number
          id_empresa: number
          id_user: string
        }
        Update: {
          id?: number
          id_empresa?: number
          id_user?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_perfil_id_empresa_fkey"
            columns: ["id_empresa"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_perfil_id_empresa_fkey"
            columns: ["id_empresa"]
            isOneToOne: false
            referencedRelation: "vw_empresas_balancetes_vigencia"
            referencedColumns: ["empresa_id"]
          },
          {
            foreignKeyName: "user_perfil_id_empresa_fkey"
            columns: ["id_empresa"]
            isOneToOne: false
            referencedRelation: "vw_empresas_planocontas_vigencia"
            referencedColumns: ["empresa_id"]
          },
          {
            foreignKeyName: "user_perfil_id_empresa_fkey"
            columns: ["id_empresa"]
            isOneToOne: false
            referencedRelation: "vw_planocontas_vigencia"
            referencedColumns: ["empresa_id"]
          },
          {
            foreignKeyName: "user_perfil_id_user_fkey"
            columns: ["id_user"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          created_at: string | null
          email: string | null
          id: string
          nome: string | null
        }
        Insert: {
          created_at?: string | null
          email?: string | null
          id: string
          nome?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string | null
          id?: string
          nome?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      vw_balancete_periodo: {
        Row: {
          ano: number | null
          ano_vigencia: number | null
          balancete_id: number | null
          conta: string | null
          descricao: string | null
          dt_importacao: string | null
          empresa_id: number | null
          mes: number | null
          reduzido: number | null
          saldo_anterior: number | null
          saldo_atual: number | null
          user_importacao: string | null
          val_credito: number | null
          val_debito: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plano_contas_vigencia_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "empresa"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plano_contas_vigencia_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "vw_empresas_balancetes_vigencia"
            referencedColumns: ["empresa_id"]
          },
          {
            foreignKeyName: "plano_contas_vigencia_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "vw_empresas_planocontas_vigencia"
            referencedColumns: ["empresa_id"]
          },
          {
            foreignKeyName: "plano_contas_vigencia_empresa_id_fkey"
            columns: ["empresa_id"]
            isOneToOne: false
            referencedRelation: "vw_planocontas_vigencia"
            referencedColumns: ["empresa_id"]
          },
        ]
      }
      vw_empresas_balancetes_vigencia: {
        Row: {
          ano: number | null
          ano_vigencia: number | null
          balancete_id: number | null
          dt_importacao: string | null
          empresa_id: number | null
          empresa_nome: string | null
          empresa_razao: string | null
          mes: number | null
          plano_contas_id: number | null
          user_importacao: string | null
          vigencia_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plano_contas_vigencia_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plano_contas_vigencia_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "vw_planocontas_vigencia"
            referencedColumns: ["plano_contas_id"]
          },
        ]
      }
      vw_empresas_planocontas_vigencia: {
        Row: {
          ano_vigencia: number | null
          descricao: string | null
          empresa_id: number | null
          empresa_nome: string | null
          empresa_razao: string | null
          nome: string | null
          plano_contas_id: number | null
          vigencia_id: number | null
        }
        Relationships: [
          {
            foreignKeyName: "plano_contas_vigencia_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "plano_contas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "plano_contas_vigencia_plano_contas_id_fkey"
            columns: ["plano_contas_id"]
            isOneToOne: false
            referencedRelation: "vw_planocontas_vigencia"
            referencedColumns: ["plano_contas_id"]
          },
        ]
      }
      vw_planocontas_vigencia: {
        Row: {
          ano_vigencia: number | null
          bp_dre_id: number | null
          conta: string | null
          conta_ativa: boolean | null
          desc_bp_dre: string | null
          desc_conta: string | null
          desc_grupo: string | null
          desc_subgrupo: string | null
          empresa_abreviacao: string | null
          empresa_ativa: boolean | null
          empresa_cnpj: string | null
          empresa_id: number | null
          empresa_razao_social: string | null
          fl_consolida_ebisa: boolean | null
          fl_controlada: boolean | null
          fl_controladora: boolean | null
          grupo_id: number | null
          item_id: number | null
          nota_explicativa_desc: string | null
          nota_explicativa_id: number | null
          papel_trabalho_desc: string | null
          papel_trabalho_id: number | null
          papel_trabalho_sigla: string | null
          plano_contas_descricao: string | null
          plano_contas_id: number | null
          plano_contas_nome: string | null
          reduzido: number | null
          sigla_subgrupo: string | null
          subgrupo_id: number | null
          vigencia_id: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
