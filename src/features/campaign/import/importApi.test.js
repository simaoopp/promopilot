import { createImportApi } from "./importApi";
import { supabase } from "../../../lib/supabase";
import {
  getAccessCacheScope,
  tenantHeaders,
} from "../../../services/platformService";
jest.mock("../../../lib/supabase", () => ({
  supabase: { auth: { getSession: jest.fn() } },
}));
jest.mock("../../../services/platformService", () => ({
  getAccessCacheScope: jest.fn(),
  tenantHeaders: jest.fn(),
}));
jest.mock("../../../shared/apiBaseUrl.mjs", () => ({
  normalizeApiBaseUrl: () => "",
}));
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => {
    resolve = done;
  });
  return { promise, resolve };
};
const session = { data: { session: { access_token: "synthetic-token" } } };
beforeEach(() => {
  jest.clearAllMocks();
  getAccessCacheScope.mockReturnValue("user:org:store");
  tenantHeaders.mockReturnValue({
    "X-Organization-Id": "org",
    "X-Store-Id": "store",
  });
  supabase.auth.getSession.mockResolvedValue(session);
  global.fetch = jest.fn();
});
afterEach(() => {
  delete global.fetch;
});
test("selected tenant and store travel with user JWT and no-store", async () => {
  fetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, data: { items: [] } }),
  });
  const api = createImportApi(new AbortController().signal);
  expect(await api("sessions")).toEqual({ items: [] });
  expect(fetch.mock.calls[0][1]).toEqual(
    expect.objectContaining({
      cache: "no-store",
      headers: {
        "X-Organization-Id": "org",
        "X-Store-Id": "store",
        Authorization: "Bearer synthetic-token",
        "Content-Type": "application/json",
      },
    }),
  );
});
test("scope changed while retrieving token prevents any request", async () => {
  const pending = deferred();
  supabase.auth.getSession.mockReturnValue(pending.promise);
  const api = createImportApi(new AbortController().signal),
    result = api("sessions");
  getAccessCacheScope.mockReturnValue("other:org:store");
  pending.resolve(session);
  await expect(result).rejects.toThrow("O acesso mudou");
  expect(fetch).not.toHaveBeenCalled();
});
test("scope changed while decoding response never returns old tenant data", async () => {
  const pending = deferred(),
    started = deferred();
  fetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: () => {
      started.resolve();
      return pending.promise;
    },
  });
  const api = createImportApi(new AbortController().signal),
    result = api("sessions");
  await started.promise;
  getAccessCacheScope.mockReturnValue("other:org:store");
  pending.resolve({ ok: true, data: { sensitive: "old tenant" } });
  await expect(result).rejects.toThrow("O acesso mudou");
});
