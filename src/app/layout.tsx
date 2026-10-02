import './globals.css';
import AutoDismissNotices from '../components/AutoDismissNotices';
export const metadata = { title: 'Constru-X v2 | Gestão de Obras', description: 'Gestão de obras com acesso por projeto e módulo' };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="pt-BR"><body><AutoDismissNotices />{children}</body></html>; }
