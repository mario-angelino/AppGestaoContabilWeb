import { NavLink } from 'react-router-dom'
import {
  BookOpen,
  Calendar,
  Building2,
  Layers,
  BarChart2,
  FileText,
  Briefcase,
  LogOut,
  FolderTree,
  Scale,
  LayoutDashboard,
  TrendingUp,
  PieChart
} from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { useActivePlan } from '../contexts/ActivePlanContext'

interface NavItemProps {
  to: string
  icon: React.ReactNode
  label: string
  end?: boolean
}

function NavItem({ to, icon, label, end = false }: NavItemProps): JSX.Element {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${isActive
          ? 'bg-blue-600 text-white'
          : 'text-gray-300 hover:bg-gray-700 hover:text-white'
        }`
      }
    >
      <span className="w-4 h-4 flex-shrink-0">{icon}</span>
      {label}
    </NavLink>
  )
}

function SectionLabel({ label }: { label: string }): JSX.Element {
  return (
    <p className="px-3 pt-4 pb-1 text-xs font-semibold text-gray-500 uppercase tracking-wider">
      {label}
    </p>
  )
}

export default function Sidebar(): JSX.Element {
  const { user, signOut } = useAuth()
  const { activePlan } = useActivePlan()

  return (
    <aside className="w-60 flex-shrink-0 bg-gray-900 flex flex-col h-screen">
      {/* Logo */}
      <div className="px-4 py-5 border-b border-gray-800">
        <h1 className="text-sm font-bold text-white leading-tight">
          Gestão Contábil Ebisa
        </h1>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        <SectionLabel label="Principal" />
        <NavItem to="/dashboard" icon={<LayoutDashboard size={16} />} label="Dashboard" end />
        <NavItem
          to="/planos"
          icon={<BookOpen size={16} />}
          label="Planos de Contas"
        />
        <NavItem
          to="/balancetes"
          icon={<Scale size={16} />}
          label="Balancetes"
          end
        />

        <SectionLabel label="DFs" />
        <NavItem to="/dfs/dre" icon={<TrendingUp size={16} />} label="DRE" end />
        <NavItem to="/dfs/bp" icon={<PieChart size={16} />} label="Balanço Patrimonial" end />

        <SectionLabel label="Auxiliar" />
        <NavItem to="/vigencias" icon={<Calendar size={16} />} label="Vigências" end />
        <NavItem to="/empresas" icon={<Building2 size={16} />} label="Empresas" end />

        <SectionLabel label="Classificações" />
        <NavItem to="/crud/grupo" icon={<Layers size={16} />} label="Grupo" end />
        <NavItem to="/crud/subgrupo" icon={<FolderTree size={16} />} label="Subgrupo" end />
        <NavItem to="/crud/bpdre" icon={<BarChart2 size={16} />} label="BP/DRE" end />
        <NavItem
          to="/crud/nota-explicativa"
          icon={<FileText size={16} />}
          label="Nota Explicativa"
          end
        />
        <NavItem
          to="/crud/papel-trabalho"
          icon={<Briefcase size={16} />}
          label="Papel de Trabalho"
          end
        />
      </nav>

      {/* Active plan indicator */}
      {activePlan && (
        <div className="mx-2 mb-2 px-3 py-2 bg-blue-900/40 rounded-lg border border-blue-800">
          <p className="text-xs text-blue-400 font-medium mb-0.5">Plano ativo</p>
          <p className="text-xs text-white truncate">{activePlan.nome}</p>
        </div>
      )}

      {/* User / logout */}
      <div className="px-2 py-3 border-t border-gray-800">
        <p className="px-3 text-xs text-gray-500 truncate mb-2">{user?.email}</p>
        <button
          onClick={signOut}
          className="flex items-center gap-2.5 w-full px-3 py-2 rounded-lg text-sm text-gray-300 hover:bg-gray-700 hover:text-white transition-colors"
        >
          <LogOut size={16} />
          Sair
        </button>
      </div>
    </aside>
  )
}
