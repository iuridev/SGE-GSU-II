// Papel de acesso somente-leitura: enxerga a rede exatamente como um
// regional_admin, mas nunca deve conseguir escrever nada (ver migration
// que bloqueia INSERT/UPDATE/DELETE no Postgres para este role).
export const READ_ONLY_ROLE = 'chefe_departamento';

// Papéis administrativos "extras" que não fazem parte do enum user_role
// original (regional_admin/school_manager/supervisor/dirigente/ure_servico/
// ure_ecc/chefe_departamento) mas foram adicionados depois direto no banco
// para contas específicas — tratados com os mesmos privilégios de
// regional_admin. Sem essa normalização, cada página teria que listar esses
// papéis um a um (e o menu do App.tsx já não listava nenhum deles, deixando
// esses usuários sem acesso a quase nada).
const ADMIN_EQUIVALENT_ROLES = new Set(['manage_admin', 'admin']);

// Usado em toda a lógica de visibilidade/leitura das páginas: faz o
// chefe_departamento e os papéis administrativos extras acima serem tratados
// como regional_admin para fins de menus, dados e ramificações de papel —
// sem precisar duplicar a lógica de cada página.
export function resolveViewRole(rawRole: string): string {
  if (rawRole === READ_ONLY_ROLE) return 'regional_admin';
  if (ADMIN_EQUIVALENT_ROLES.has(rawRole)) return 'regional_admin';
  return rawRole;
}

export function isReadOnlyRole(rawRole: string): boolean {
  return rawRole === READ_ONLY_ROLE;
}
