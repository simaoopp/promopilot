import { useCallback, useEffect, useRef, useState } from "react";
import { emptyDossierDraft, getDossierDraftStore } from "./dossierDraftStore";

export default function useDossierDraft(scope) {
  const store = getDossierDraftStore();
  const [state, setState] = useState(() => ({ ...(store.peek(scope) || { draft: emptyDossierDraft(), status: "loading" }), restored: false }));
  const current = useRef(state.draft), revision = useRef(0), alive = useRef(false);
  const reload = useCallback(() => {
    const request = ++revision.current;
    return store.load(scope, { fresh: true }).then(loaded => {
      if (!alive.current || request !== revision.current) return;
      current.current = loaded.draft;
      setState({ ...loaded, restored: Boolean(loaded.draft.dossier) });
    });
  }, [scope, store]);
  useEffect(() => {
    alive.current = true;
    let active = true;
    const request = revision.current;
    store.load(scope).then(loaded => {
      if (!active || request !== revision.current) return;
      current.current = loaded.draft;
      setState({ ...loaded, restored: Boolean(loaded.draft.dossier) });
    });
    return () => { active = false; alive.current = false; };
  }, [scope, store]);
  useEffect(() => {
    if (!state.expiresAt || !state.draft.dossier) return undefined;
    const check = () => { if (Date.now() >= state.expiresAt) reload(); };
    const timer = setTimeout(check, Math.max(0, state.expiresAt - Date.now()));
    window.addEventListener("focus", check);
    return () => { clearTimeout(timer); window.removeEventListener("focus", check); };
  }, [state.expiresAt, state.draft.dossier, reload]);
  useEffect(() => {
    if (!["saving", "memory", "conflict"].includes(state.status) || !state.draft.dossier) return undefined;
    const warn = event => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [state.status, state.draft.dossier]);
  const update = useCallback(updater => {
    const draft = typeof updater === "function" ? updater(current.current) : updater;
    const request = ++revision.current;
    // The store records an in-memory snapshot synchronously, before a guard can
    // unmount the editor. IndexedDB keeps photos without localStorage's quota.
    const saved = store.save(scope, draft);
    current.current = draft;
    setState({ ...store.peek(scope), draft, status: "saving", restored: false });
    saved.then(status => {
      if (alive.current && request === revision.current) setState(previous => ({ ...previous, status }));
    });
  }, [scope, store]);
  const clear = useCallback(() => {
    const request = ++revision.current; current.current = emptyDossierDraft();
    setState({ draft: current.current, status: "empty", restored: false });
    store.clear(scope).then(status => {
      if (alive.current && request === revision.current && status !== "saved") setState(previous => ({ ...previous, status: "clear_error" }));
    });
  }, [scope, store]);
  return { ...state, update, clear, reload };
}
