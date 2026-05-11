export default function ResumoCard({ label, value }) {
  return (
    <div className="resumo-card">
      <span className="resumo-label">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
