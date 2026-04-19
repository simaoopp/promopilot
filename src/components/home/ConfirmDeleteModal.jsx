import React from "react";
export default function ConfirmDeleteModal({ campanha, onCancel, onConfirm }) {
  if(!campanha) return null;
  return <div className="popup-overlay" role="dialog" aria-modal="true"><div className="popup-card" style={{maxWidth:520}}><div className="popup-header popup-header-pro"><div><div className="popup-eyebrow">Confirmação</div><h2>Apagar campanha</h2><p className="popup-subtitle">Esta ação remove a campanha do histórico. Não pode ser desfeita automaticamente.</p></div><button type="button" className="popup-close" onClick={onCancel}>×</button></div><div className="ai-popup-scroll"><p>Tens a certeza que queres apagar <strong>{campanha.titulo||"esta campanha"}</strong>?</p></div><div className="popup-actions popup-actions-pro"><button type="button" className="btn btn-secondary" onClick={onCancel}>Cancelar</button><button type="button" className="btn btn-primary" onClick={()=>onConfirm(campanha.id)}>Apagar campanha</button></div></div></div>;
}
