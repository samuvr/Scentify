'use client';

import { useActionState } from 'react';
import { accionIniciarSesion } from '../acciones';

export function FormularioLogin({ siguiente }: { siguiente?: string }) {
  const [error, accion, pendiente] = useActionState(accionIniciarSesion, null);

  return (
    <form action={accion} className="tarjeta space-y-4">
      {/* A donde volver despues de entrar: lo usa "Compartir con Scentify",
          que si no perderia la ficha compartida al pedir la contrasenia. */}
      {siguiente ? <input type="hidden" name="siguiente" value={siguiente} /> : null}
      <div>
        <label htmlFor="email">Correo</label>
        <input id="email" name="email" type="email" autoComplete="username" required className="mt-1" />
      </div>
      <div>
        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-1"
        />
      </div>
      {error ? <p className="aviso-error">{error}</p> : null}
      <button type="submit" disabled={pendiente} className="boton-primario w-full">
        {pendiente ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
