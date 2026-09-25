begin;

-- Mantém a definição de "Loja da Praia" coerente com frontend/backend.
create or replace function public.promopilot_is_praia_store(p_store text)
returns boolean
language sql
immutable
as $$
  select position(
    'praia' in regexp_replace(
      lower(
        translate(
          trim(coalesce(p_store, '')),
          'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
          'AAAAAEEEEIIIIOOOOOUUUUC'
        )
      ),
      '\s+',
      ' ',
      'g'
    )
  ) > 0;
$$;

-- Uma notificação de fim só pode existir quando a campanha tem DATA FIM real.
-- Não inventamos um fim a +30 dias: isso é retenção de histórico, não lifecycle.
create or replace function public.promopilot_campaign_end_at(
  p_items jsonb,
  p_year integer,
  p_created_at timestamptz,
  p_title text
)
returns timestamptz
language plpgsql
stable
as $$
declare
  item jsonb;
  parsed date;
  last_day date := null;
  normalized_title text;
begin
  normalized_title := upper(
    translate(
      trim(coalesce(p_title, '')),
      'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ',
      'AAAAAEEEEIIIIOOOOOUUUUC'
    )
  );

  if normalized_title = 'ARTIGO C/DEFEITO' then
    return null;
  end if;

  if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) = 'array' then
    for item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
    loop
      parsed := public.promopilot_parse_campaign_end_date(
        coalesce(item->>'dataFim', item->>'data_fim', ''),
        p_year
      );

      if parsed is not null and (last_day is null or parsed > last_day) then
        last_day := parsed;
      end if;
    end loop;
  end if;

  if last_day is null then
    return null;
  end if;

  -- A campanha termina no fim do dia da DATA FIM na timezone dos Açores.
  return (
    (last_day::timestamp + interval '23 hours 59 minutes 59 seconds')
    at time zone 'Atlantic/Azores'
  );
end;
$$;

-- Corrige apenas notificações ainda não enviadas criadas por versões anteriores.
with recalculated as (
  select
    n.id,
    public.promopilot_campaign_end_at(
      n.items,
      n.year_validity,
      n.campaign_created_at,
      n.title
    ) as end_at
  from public.campaign_end_notifications n
  where n.status in ('pending', 'error')
)
update public.campaign_end_notifications n
set
  campaign_end_at = r.end_at,
  status = case when r.end_at is null then 'skipped' else n.status end,
  last_error = case
    when r.end_at is null then 'Campanha sem data de fim definida.'
    else n.last_error
  end
from recalculated r
where n.id = r.id;

-- Qualquer linha legacy que não seja da Praia nunca deve ser enviada.
update public.campaign_end_notifications
set
  status = 'skipped',
  last_error = 'Loja fora do âmbito das notificações de fim de campanha.'
where status in ('pending', 'error')
  and not public.promopilot_is_praia_store(store);

commit;
