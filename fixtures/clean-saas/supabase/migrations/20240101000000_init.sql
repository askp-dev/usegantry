create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text,
  created_at timestamptz default now()
);
alter table public.profiles enable row level security;
create policy "Owners read profile" on public.profiles for select using ((select auth.uid()) = id);
create policy "Owners update profile" on public.profiles for update using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references public.profiles(id) on delete cascade,
  title text,
  created_at timestamptz default now()
);
alter table public.documents enable row level security;
create policy "Owners manage documents" on public.documents for all using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

-- Prisma-managed tables live in the same exposed schema
alter table public.users enable row level security;
alter table public."Post" enable row level security;
alter table public.processed_webhook_events enable row level security;

create view public.document_stats with (security_invoker = true) as
  select owner_id, count(*) as total from public.documents group by owner_id;

create or replace function public.touch_document(doc uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'forbidden'; end if;
  update public.documents set created_at = now() where id = doc and owner_id = auth.uid();
end;
$$;

insert into storage.buckets (id, name, public) values ('user-uploads', 'user-uploads', false);
create policy "Owners upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'user-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
