import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { apiFetch } from '../lib/api';

export default function Cartelera(){
  const [shows, setShows] = useState([]);
  useEffect(() => {
    apiFetch('/api/shows').then(r=>r.json()).then(setShows).catch(()=>setShows([]));
  }, []);
  return (
    <div>
      <h1>Cartelera</h1>
      <ul>
        {shows.map(s => (
          <li key={s.id}><Link to={`/cartelera/${s.id}`}>{s.title} - {s.date} {s.time}</Link></li>
        ))}
      </ul>
    </div>
  );
}
