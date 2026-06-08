import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './contexts/AuthContext'
import { ActivePlanProvider } from './contexts/ActivePlanContext'
import ProtectedRoute from './components/ProtectedRoute'
import Layout from './components/Layout'
import Login from './pages/Login'
import PlanoContas from './pages/PlanoContas'
import ItensPlano from './pages/ItensPlano'
import Vigencias from './pages/Vigencias'
import Empresas from './pages/Empresas'
import ClassGrupo from './pages/crud/ClassGrupo'
import ClassSubgrupo from './pages/crud/ClassSubgrupo'
import ClassBpDre from './pages/crud/ClassBpDre'
import ClassNotaExplicativa from './pages/crud/ClassNotaExplicativa'
import ClassPapelTrabalho from './pages/crud/ClassPapelTrabalho'
import Balancetes from './pages/Balancetes'
import Dashboard from './pages/Dashboard'
import DRE from './pages/DFs/DRE'
import BP from './pages/DFs/BP'

const queryClient = new QueryClient()

function App(): JSX.Element {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <ActivePlanProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route index element={<Navigate to="/dashboard" replace />} />
                  <Route path="/dashboard" element={<Dashboard />} />
                  <Route path="/planos" element={<PlanoContas />} />
                  <Route path="/planos/:id/itens" element={<ItensPlano />} />
                  <Route path="/balancetes" element={<Balancetes />} />
                  <Route path="/dfs/dre" element={<DRE />} />
                  <Route path="/dfs/bp" element={<BP />} />
                  <Route path="/vigencias" element={<Vigencias />} />
                  <Route path="/empresas" element={<Empresas />} />
                  <Route path="/crud/grupo" element={<ClassGrupo />} />
                  <Route path="/crud/subgrupo" element={<ClassSubgrupo />} />
                  <Route path="/crud/bpdre" element={<ClassBpDre />} />
                  <Route path="/crud/nota-explicativa" element={<ClassNotaExplicativa />} />
                  <Route path="/crud/papel-trabalho" element={<ClassPapelTrabalho />} />
                </Route>
              </Route>
            </Routes>
          </BrowserRouter>
        </ActivePlanProvider>
      </AuthProvider>
    </QueryClientProvider>
  )
}

export default App
