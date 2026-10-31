import { useCallback, useEffect, useRef, useState } from "react";
import {
  campaignItems,
  headersFor,
  LIMITS,
  suggestMapping,
  templateCompatible,
  validateConfig,
} from "../../../shared/campaign-import/model.js";
import { createImportApi } from "./importApi";
import { extractInWorker } from "./extractInWorker";
const defaultConfig = () => {
  const start = new Date(),
    end = new Date(start);
  end.setDate(end.getDate() + 29);
  const local = (date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return {
    headerStart: 0,
    headerCount: 0,
    dataStart: 0,
    locale: "auto",
    mapping: {},
    priceConfirmed: false,
    manualPrice: false,
    startDate: local(start),
    endDate: local(end),
  };
};
function interpret(sheet, type) {
  let best = { index: 0, score: 0 };
  sheet.rows.slice(0, 10).forEach((row, index) => {
    const score = Object.keys(suggestMapping(row).mapping).length;
    if (score > best.score) best = { index, score };
  });
  return {
    ...defaultConfig(),
    sheet: sheet.name,
    fileType: type,
    headerStart: best.index,
    headerCount: best.score >= 2 ? 1 : 0,
    dataStart: best.score >= 2 ? best.index + 1 : 0,
  };
}
export function useCampaignImport({ existing, onClose }) {
  const [step, setStep] = useState(1),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [book, setBook] = useState(null),
    [config, setConfig] = useState(defaultConfig),
    [confidence, setConfidence] = useState({});
  const [templates, setTemplates] = useState([]),
    [selected, setSelected] = useState(null),
    [sessions, setSessions] = useState([]);
  const [review, setReview] = useState(null),
    [readyItems, setReadyItems] = useState([]),
    [filter, setFilter] = useState({ offset: 0, state: "", query: "" });
  const [progress, setProgress] = useState("");
  const controller = useRef(null),
    api = useRef(null),
    working = useRef(false),
    plan = useRef(null),
    resumed = useRef(null);
  const run = useCallback(async (task) => {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      await task();
    } catch (e) {
      if (!controller.current?.signal.aborted)
        setError(
          e.name === "AbortError"
            ? "O pedido demorou demasiado. Pode repetir; os lotes já guardados serão reutilizados."
            : e.message,
        );
    } finally {
      working.current = false;
      if (!controller.current?.signal.aborted) {
        setBusy(false);
        setProgress("");
      }
    }
  }, []);
  useEffect(() => {
    const abort = new AbortController();
    controller.current = abort;
    api.current = createImportApi(abort.signal);
    const request = api.current;
    const load = async () => {
      const all = [];
      let offset = 0;
      for (;;) {
        const page = await request("templates", { offset });
        all.push(...page.items);
        if (page.items.length < 100) break;
        offset += 100;
      }
      const recent = await request("sessions");
      if (!abort.signal.aborted) {
        setTemplates(all);
        setSessions(recent.items);
      }
    };
    load().catch((e) => {
      if (!abort.signal.aborted) setError(e.message);
    });
    const accessChanged = () => {
      abort.abort();
      onClose();
    };
    window.addEventListener("promopilot:access-changed", accessChanged);
    return () => {
      abort.abort();
      window.removeEventListener("promopilot:access-changed", accessChanged);
    };
  }, [onClose]);
  const sheet = book?.sheets.find((s) => s.name === config.sheet);
  const loadReview = async (sessionId, nextFilter = filter) => {
    const data = await api.current("read", { id: sessionId, ...nextFilter });
    setReview(data);
    setFilter(nextFilter);
    return data;
  };
  const applyTemplate = (template) => {
    setSelected(template);
    setNotice("");
    if (!template || !book) return;
    const target = book.sheets.find((s) => s.name === template.config.sheet);
    if (!target || !templateCompatible(template, target, book.type)) {
      setNotice(
        "O modelo tem outra estrutura. Confirme os cabeçalhos e associe os campos manualmente.",
      );
      return;
    }
    setConfig({
      ...template.config,
      startDate: config.startDate,
      endDate: config.endDate,
      priceConfirmed: false,
    });
    setConfidence({});
    setNotice("Modelo aplicado. Confirme o período e a coluna promocional.");
  };
  const readSource = (input) =>
    run(async () => {
      const parsed = await extractInWorker(input, controller.current.signal);
      if (resumed.current) {
        if (parsed.source.hash !== resumed.current.source.hash)
          throw new Error("Selecione a mesma tabela da importação parcial.");
        const target = parsed.sheets.find(
          (s) => s.name === resumed.current.config.sheet,
        );
        if (
          !target ||
          target.rows.length - resumed.current.config.dataStart !==
            resumed.current.total_rows
        )
          throw new Error("A estrutura da origem mudou.");
        setBook(parsed);
        setConfig(resumed.current.config);
        setStep(3);
        return;
      }
      setBook(parsed);
      const initial = interpret(parsed.sheets[0], parsed.type);
      const target =
        selected && parsed.sheets.find((s) => s.name === selected.config.sheet);
      setConfig(
        target && templateCompatible(selected, target, parsed.type)
          ? {
              ...selected.config,
              startDate: initial.startDate,
              endDate: initial.endDate,
              priceConfirmed: false,
            }
          : initial,
      );
      plan.current = null;
      setStep(2);
    });
  const mapFields = () =>
    run(async () => {
      if (
        !sheet ||
        !Number.isInteger(config.dataStart) ||
        config.dataStart < 0 ||
        config.dataStart >= sheet.rows.length ||
        config.headerStart < 0 ||
        (config.headerCount > 0 &&
          config.headerStart + config.headerCount > config.dataStart)
      )
        throw new Error(
          "Confirme as linhas de cabeçalho e o início dos dados.",
        );
      const suggestion = suggestMapping(
        headersFor(sheet, config),
        sheet.rows.slice(config.dataStart),
      );
      setConfig({
        ...config,
        mapping:
          selected && templateCompatible(selected, sheet, book.type)
            ? selected.config.mapping
            : suggestion.mapping,
        priceConfirmed: false,
      });
      setConfidence(suggestion.confidence);
      setStep(3);
    });
  const prepare = () =>
    run(async () => {
      validateConfig(config);
      const snapshot = {
        ...config,
        headers: headersFor(sheet, config),
        ...(selected
          ? { templateId: selected.id, templateVersion: selected.version }
          : {}),
      };
      const signature = JSON.stringify(snapshot);
      if (resumed.current) {
        if (JSON.stringify(config) !== JSON.stringify(resumed.current.config))
          throw new Error(
            "Para retomar, mantenha o mapeamento original. Corrija as linhas no passo seguinte.",
          );
        plan.current = {
          id: resumed.current.id,
          config: resumed.current.config,
          source: resumed.current.source,
          totalRows: resumed.current.total_rows,
          signature,
        };
      } else if (!plan.current || plan.current.signature !== signature)
        plan.current = {
          id: crypto.randomUUID(),
          config: snapshot,
          source: book.source,
          totalRows: sheet.rows.length - config.dataStart,
          signature,
        };
      const { signature: _, ...request } = plan.current;
      let session = await api.current("start", request);
      while (session.processed < session.total_rows) {
        setProgress(
          `A identificar artigos: ${session.processed} / ${session.total_rows}`,
        );
        const start = session.processed + config.dataStart,
          batch = [];
        let bytes = 0;
        for (
          let i = start;
          i < Math.min(sheet.rows.length, start + LIMITS.batch);
          i++
        ) {
          const row = { raw: sheet.rows[i], flags: sheet.flags[i] || [] };
          const size = new TextEncoder().encode(JSON.stringify(row)).length;
          if (batch.length && bytes + size > 800000) break;
          batch.push(row);
          bytes += size;
        }
        session = await api.current("batch", {
          id: session.id,
          offset: session.processed,
          rows: batch,
        });
      }
      resumed.current = null;
      await loadReview(session.id, { offset: 0, state: "", query: "" });
      setStep(4);
    });
  const resume = (session) =>
    run(async () => {
      if (session.state === "processing") {
        resumed.current = session;
        plan.current = null;
        setNotice(
          `Selecione novamente “${session.source.name}”. Serão retomadas as ${session.total_rows - session.processed} linhas restantes.`,
        );
        setStep(1);
        return;
      }
      await loadReview(session.id, { offset: 0, state: "", query: "" });
      setStep(4);
    });
  const edit = (rowIndex, patch) =>
    run(async () => {
      await api.current("edit", {
        id: review.session.id,
        version: review.session.version,
        rowIndex,
        ...patch,
      });
      await loadReview(review.session.id);
    });
  const finalize = () =>
    run(async () => {
      const session = await api.current("finalize", {
        id: review.session.id,
        version: review.session.version,
      });
      const rows = [];
      let offset = 0;
      for (;;) {
        const page = await api.current("read", {
          id: session.id,
          state: "valid",
          offset,
        });
        rows.push(...page.rows);
        if (page.rows.length < 100) break;
        offset += 100;
      }
      const items = campaignItems(rows, session, existing);
      setReadyItems(items);
      setNotice(
        `${rows.length - items.length} artigos já presentes foram mantidos sem alteração.`,
      );
      setStep(5);
    });

  const selectSheet = (name) => {
    setSelected(null);
    setConfig(
      interpret(
        book.sheets.find((s) => s.name === name),
        book.type,
      ),
    );
  };
  const saveTemplate = (data) =>
    run(async () => {
      validateConfig(data.config);
      const saved = await api.current("template_save", data);
      setTemplates((list) => [...list.filter((t) => t.id !== saved.id), saved]);
      setSelected(saved);
      setNotice("Modelo guardado nesta organização.");
    });
  const excludeInvalid = () =>
    run(async () => {
      await api.current("exclude_invalid", {
        id: review.session.id,
        version: review.session.version,
      });
      await loadReview(review.session.id);
    });
  const changeFilter = (next) =>
    run(() => loadReview(review.session.id, { ...next, offset: 0 }));
  const changePage = (offset) =>
    run(() => loadReview(review.session.id, { ...filter, offset }));
  const refreshReview = () => run(() => loadReview(review.session.id));
  const resetResume = () => {
    resumed.current = null;
    plan.current = null;
    setNotice("");
  };
  const back = () => setStep((current) => current - 1);
  return {
    step,
    busy,
    error,
    notice,
    progress,
    book,
    config,
    setConfig,
    confidence,
    templates,
    selected,
    sessions,
    review,
    readyItems,
    filter,
    sheet,
    isResuming: !!resumed.current,
    readSource,
    applyTemplate,
    mapFields,
    prepare,
    resume,
    edit,
    finalize,
    selectSheet,
    saveTemplate,
    excludeInvalid,
    changeFilter,
    changePage,
    refreshReview,
    resetResume,
    back,
  };
}
