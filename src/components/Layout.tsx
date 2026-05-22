import { Outlet, useLocation } from 'react-router-dom'
import Sidebar from './Sidebar'

export default function Layout(): JSX.Element {
  const { pathname } = useLocation()
  // Grid page needs to control its own scroll internally
  const isGridPage = pathname.includes('/itens')

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden">
      <Sidebar />
      <main
        className={`flex-1 flex flex-col ${
          isGridPage ? 'overflow-hidden' : 'overflow-y-auto'
        }`}
      >
        <Outlet />
      </main>
    </div>
  )
}
