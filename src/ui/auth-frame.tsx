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
        <p>Sistema operacional do balcão — agenda, comanda e caixa numa casa só.</p>
      </section>
      <section className="auth-panel">
        <h2>{title}</h2>
        {lede ? <p>{lede}</p> : null}
        {children}
      </section>
    </div>
  );
}
