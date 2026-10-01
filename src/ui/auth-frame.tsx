export function AuthFrame({
  title,
  lede,
  children,
}: {
  title: string;
  lede: string;
  children: React.ReactNode;
}) {
  return (
    <div className="auth">
      <section className="auth-brand">
        <span className="brand-mark" aria-hidden="true">
          B
        </span>
        <h1>BeautyOS</h1>
        <p>O painel da casa. Fichas, agenda e comanda no mesmo sistema.</p>
      </section>
      <section className="auth-panel">
        <h2>{title}</h2>
        <p>{lede}</p>
        {children}
      </section>
    </div>
  );
}
