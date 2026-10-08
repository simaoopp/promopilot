import { supabase } from "../../../lib/supabase";
import { pesquisarCodigosCampanha } from "./manualCampaignCodes";
jest.mock("../../../lib/supabase", () => ({ supabase: { rpc: jest.fn() } }));

beforeEach(() => supabase.rpc.mockReset());

test("pesquisa exata, códigos/EAN duplicados, falhas e motivos para cada entrada", async () => {
  const item = { artigo: "00123", descricao: "Produto", codigo_barras: "5601234567890", pvp3: "100", pvp2: "80" };
  supabase.rpc.mockImplementation((_, { p_code }) => Promise.resolve(
    p_code === "falha" ? { error: { message: "offline" } } : {
      data: ["00123", "5601234567890"].includes(p_code) ? [item]
        : p_code === "manutencao" ? [{ ...item, artigo: "manutencao", info: "Reposições dos PVPs" }]
          : p_code === "parcial" ? [{ ...item, artigo: "parcial123" }] : [],
    },
  ));
  const result = await pesquisarCodigosCampanha("00123;00123\n5601234567890 falha inexistente parcial manutencao existente", { existentes: ["existente"] });
  expect(result.revisao.totais).toEqual({ valido: 1, bloqueado: 1, duplicado: 3, naoEncontrado: 2, erro: 1 });
  expect(result.artigos.map((item) => item.artigo)).toEqual(["00123"]);
  expect(result.naoEncontrados).toEqual(["inexistente", "parcial"]);
  expect(result.falhas).toEqual(["falha"]);
  expect(result.revisao.linhas).toHaveLength(8);
  expect(result.revisao.linhas.every((linha) => linha.motivo)).toBe(true);
  expect(supabase.rpc).toHaveBeenCalledTimes(6);
  expect(result.artigos[0].origemDados.tipo).toBe("catalogo");
});

test("cancelar impede novas consultas e não devolve resultados parciais", async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(pesquisarCodigosCampanha("00123", { signal: controller.signal })).rejects.toHaveProperty("name", "AbortError");
  expect(supabase.rpc).not.toHaveBeenCalled();
});
