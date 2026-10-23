// Player classes. Infantry classes pick from a set of guns and carry different
// gadgets; Tank Commander and Pilot spawn straight into a vehicle.

export const CLASSES = {
  rifleman: {
    id: 'rifleman',
    name: 'Rifleman',
    role: 'Assault rifle, two frags and a smoke grenade',
    primaries: ['ak47', 'l85'],
    frags: 2,
    smokes: 1,
    medkits: 2,
    gadget: null,
    gadget2: null,
  },
  engineer: {
    id: 'engineer',
    name: 'Engineer',
    role: 'NLAW anti-tank rockets and AT mines',
    primaries: ['mp5', 'shotgun'],
    frags: 1,
    smokes: 0,
    medkits: 1,
    gadget: 'nlaw',
    gadget2: 'mine',
  },
  recon: {
    id: 'recon',
    name: 'Recon',
    role: 'L96 sniper and remote C4 charges',
    primaries: ['l96'],
    frags: 1,
    smokes: 1,
    medkits: 1,
    gadget: 'c4',
    gadget2: null,
  },
  medic: {
    id: 'medic',
    name: 'Medic',
    role: 'Five medkits and three smoke grenades',
    primaries: ['l85', 'mp5', 'shotgun'],
    frags: 1,
    smokes: 3,
    medkits: 5,
    gadget: null,
    gadget2: null,
  },
  tanker: {
    id: 'tanker',
    name: 'Tank Commander',
    role: 'Challenger 2 tank: 120 mm cannon and coaxial MG',
    vehicle: 'tank',
  },
  pilot: {
    id: 'pilot',
    name: 'Pilot',
    role: 'Typhoon jet: cannon, rockets and bombs',
    vehicle: 'jet',
  },
};

export const CLASS_ORDER = ['rifleman', 'engineer', 'recon', 'medic', 'tanker', 'pilot'];
export const SECONDARY_CHOICES = ['hipower', 'webley'];

// How many of each vehicle a team may have at once.
export function vehicleLimit(kind, teamSize) {
  if (kind === 'tank') return teamSize >= 8 ? 2 : 1;
  if (kind === 'jet') return teamSize >= 11 ? 2 : 1;
  return 99;
}

// Keep a chosen primary valid for the class.
export function validLoadout(cls, loadout) {
  const c = CLASSES[cls] || CLASSES.rifleman;
  const out = { ...loadout };
  if (c.primaries && !c.primaries.includes(out.primary)) out.primary = c.primaries[0];
  if (!SECONDARY_CHOICES.includes(out.secondary)) out.secondary = 'hipower';
  return out;
}
