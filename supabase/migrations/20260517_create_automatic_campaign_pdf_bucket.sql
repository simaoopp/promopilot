insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'automatic-campaign-pdfs',
  'automatic-campaign-pdfs',
  false,
  20971520,
  array['application/pdf']
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
