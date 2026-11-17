// The names the event form suggests: everyone on the people list who isn't
// hidden (Roles tab), and each lead role's default and alternates without the
// hidden ones. The default stays as the placeholder even if hidden: it's the
// club setting, and hiding only stops a name being offered.

import { listMembers, listRoleDefaults, type RoleDefault } from "@penntools/tool-pass-it-on";
import { db } from "./db";

export async function nameSuggestions(): Promise<{ memberNames: string[]; roleDefaults: RoleDefault[] }> {
  const [members, defaults] = await Promise.all([listMembers(db()), listRoleDefaults(db())]);
  const hidden = new Set(members.filter((m) => !m.active).map((m) => m.name.toLowerCase()));
  return {
    memberNames: members.filter((m) => m.active).map((m) => m.name),
    roleDefaults: defaults.map((d) => ({ ...d, alternates: d.alternates.filter((n) => !hidden.has(n.toLowerCase())) })),
  };
}
