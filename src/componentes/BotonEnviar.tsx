'use client';

/**
 * Boton de envio de un formulario con accion de servidor que se desactiva
 * mientras la accion corre. Sin esto, un doble toque con mala cobertura manda
 * el formulario dos veces.
 */
import { useFormStatus } from 'react-dom';

export function BotonEnviar({
  children,
  pendiente,
  className,
  ...resto
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { pendiente?: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} aria-busy={pending} className={className} {...resto}>
      {pending && pendiente ? pendiente : children}
    </button>
  );
}
