'use client';

import { useActionState } from 'react';
import { accionIniciarSesion } from '../acciones';

export function FormularioLogin() {
  const [error, accion, pendiente] = useActionState(accionIniciarSesion, null);

  return (
    <form action={accion} className="tarjeta space-y-4">
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
