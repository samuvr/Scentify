'use client';

import { useActionState } from 'react';
import { accionRegistrarse } from '../acciones';

export function FormularioRegistro({ codigo, siguiente }: { codigo?: string; siguiente?: string }) {
  const [estado, accion, pendiente] = useActionState(accionRegistrarse, null);

  return (
    <form action={accion} className="tarjeta space-y-4">
      {siguiente ? <input type="hidden" name="siguiente" value={siguiente} /> : null}
      <div>
        <label htmlFor="email">Correo</label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          defaultValue={estado?.email}
          required
          className="mt-1"
        />
      </div>
      <div>
        <label htmlFor="password">Contraseña</label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          className="mt-1"
        />
        <p className="mt-1 text-xs text-texto-tenue">Al menos 8 caracteres.</p>
      </div>
      <div>
        <label htmlFor="codigo">Código de invitación</label>
        <input
          id="codigo"
          name="codigo"
          type="text"
          autoComplete="off"
          autoCapitalize="none"
          spellCheck={false}
          defaultValue={estado?.codigo ?? codigo}
          required
          className="mt-1"
        />
      </div>
      {estado ? <p className="aviso-error">{estado.error}</p> : null}
      <button type="submit" disabled={pendiente} className="boton-primario w-full">
        {pendiente ? 'Creando la cuenta…' : 'Crear cuenta'}
      </button>
    </form>
  );
}
