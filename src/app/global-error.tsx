'use client';

/**
 * Ultimo recurso: un fallo en el propio layout. Sustituye a todo el documento,
 * asi que no hay estilos ni barra; se queda en lo minimo y en español.
 */
export default function ErrorGlobal({ reset }: { error: Error; reset: () => void }) {
  return (
    <html lang="es">
      <body
        style={{
          background: '#14110e',
          color: '#f3ece3',
          fontFamily: 'system-ui, sans-serif',
          padding: '4rem 1.5rem',
          textAlign: 'center',
        }}
      >
        <h1 style={{ fontSize: '1.5rem' }}>Algo ha fallado</h1>
        <p style={{ opacity: 0.8 }}>No se ha podido abrir Scentify. Lo guardado no se ha perdido.</p>
        <p style={{ display: 'flex', gap: '1rem', justifyContent: 'center', marginTop: '2rem' }}>
          <button type="button" onClick={reset} style={{ padding: '0.75rem 1.25rem' }}>
            Reintentar
          </button>
          <a href="/" style={{ color: '#d6a45e', padding: '0.75rem 0' }}>
            Volver a Hoy
          </a>
        </p>
      </body>
    </html>
  );
}
