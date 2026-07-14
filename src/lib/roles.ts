// Papel de acesso somente-leitura: enxerga a rede exatamente como um
// regional_admin, mas nunca deve conseguir escrever nada (ver migration
// que bloqueia INSERT/UPDATE/DELETE no Postgres para este role).
export const READ_ONLY_ROLE = 'chefe_departamento';

// Usado em toda a lógica de visibilidade/leitura das páginas: faz o
// chefe_departamento ser tratado como regional_admin para fins de
// menus, dados e ramificações de papel — sem precisar duplicar a
// lógica de cada página.
export function resolveViewRole(rawRole: string): string {
  return rawRole === READ_ONLY_ROLE ? 'regional_admin' : rawRole;
}

export function isReadOnlyRole(rawRole: string): boolean {
  return rawRole === READ_ONLY_ROLE;
}
