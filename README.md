# Constru-X v2 — primeira entrega

Base independente do painel anterior: login Supabase Auth, seleção de obra, dashboard, cadastro de obras, menu por permissão e matriz usuário × obra × módulo × ação. A interface usa o amarelo e grafite do painel enviado e mantém gráficos com Chart.js. Os módulos de negócio ainda são telas de preparação; seus dados não foram migrados.

## Instalação local

1. Execute `npm install`.
2. Copie `.env.example` para `.env.local` e informe a URL e a chave **pública** do seu Supabase. Nunca use a `service_role` no navegador nem publique o `.env.local`.
3. Em um **projeto Supabase de teste**, revise e execute `supabase/migrations/20260926000000_access_foundation.sql`. Não aplique este script às cegas no banco do painel atual.
4. Crie o primeiro usuário no Supabase Auth e obtenha seu UUID. No editor SQL, como proprietário do banco, execute uma única vez:

   ```sql
   insert into public.cx_profiles(user_id, name, system_admin)
   values ('UUID_DO_SEU_USUARIO', 'LUCIANO GARCIA BORBA', true);
   ```

5. Execute `npm run dev` e acesse `http://localhost:3000`.

## Novos usuários

Crie os usuários pelo painel Supabase Auth ou por uma função de servidor com chave privada. O formulário público de cadastro não faz parte desta entrega. O administrador inclui cada UUID e nome em `cx_profiles` e depois concede acesso à obra e às ações na matriz. A tela de permissões lista apenas perfis criados. Não conceda `system_admin` a usuários comuns.

## Limite de segurança desta etapa

O banco aplica RLS às tabelas **cx_***. A tela não concede acesso real às tabelas do painel antigo. Antes de migrar Colaboradores, Contratos ou qualquer outro módulo, é obrigatório mapear o identificador de obra em cada tabela e criar políticas RLS para leitura, criação, edição e exclusão usando `cx_can_access`. As exportações e funções de servidor também precisam verificar permissão. Nenhum dado de produção foi copiado ou alterado.

O arquivo ZIP antigo contém `.env.local`; este projeto não o incorpora. Revise e substitua chaves privadas antigas se elas tiverem sido compartilhadas ou incluídas em deploys.
