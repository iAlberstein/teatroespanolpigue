import { Routes, Route, Link } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Cartelera from './pages/Cartelera.jsx';
import Detalle from './pages/Detalle.jsx';
import Perfil from './pages/Perfil.jsx';
import Boleteria from './pages/Boleteria.jsx';
import Auth from './pages/Auth.jsx';
import Admin from './pages/Admin.jsx';

export default function App() {
  return (
    <div style={{ padding: 16 }}>
      <nav style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
        <Link to="/">Home</Link>
        <Link to="/cartelera">Cartelera</Link>
        <Link to="/perfil">Perfil</Link>
        <Link to="/boleteria">Boletería</Link>
        <Link to="/admin">Admin</Link>
        <Link to="/auth">Login/Register</Link>
      </nav>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/cartelera" element={<Cartelera />} />
        <Route path="/cartelera/:id" element={<Detalle />} />
        <Route path="/perfil" element={<Perfil />} />
        <Route path="/boleteria" element={<Boleteria />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/auth" element={<Auth />} />
      </Routes>
    </div>
  );
}
