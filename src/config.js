// Global tuning values. Units are metres, seconds, degrees unless noted.

export const PHYS = {
  gravity: 20,
  jumpSpeed: 6.9,
  stepHeight: 0.45,
  radius: 0.36, // half-width of every character's collision box
  standHeight: 1.55,
  crouchHeight: 1.18,
  eyeStand: 1.38,
  eyeCrouch: 1.02,
  runSpeed: 4.8,
  sprintMult: 1.42,
  crouchMult: 0.48,
  adsMult: 0.62,
  healMult: 0.55,
  groundAccel: 55,
  airAccel: 9,
  friction: 9,
  slideSpeed: 8.6,
  slideTime: 0.75,
  slideCooldown: 0.9,
  leanDist: 0.42,
  leanAngle: 13,
};

export const MATCH_DEFAULTS = {
  teamSize: 8,
  scoreLimit: 60,
  timeLimit: 15, // minutes, 0 = unlimited
  vehicles: true,
  enemyDifficulty: 'normal',
  allyDifficulty: 'normal',
  friendlyFire: false,
  healthRegen: false,
  playerTeam: 0,
};

export const TEAMS = [
  { name: 'OPUS', color: '#3b7dd8', hex: 0x2f6fd0, dark: 0x1b3f7a },
  { name: 'SONNET', color: '#d8423b', hex: 0xc8352e, dark: 0x7a1c18 },
];

export const RESPAWN_TIME = 3.5;
export const SPAWN_PROTECT = 2.5;
export const MAX_HEALTH = 100;
export const MEDKIT_HEAL = 50;
export const MEDKIT_TIME = 2.2;

// Bot difficulty presets. Tweak these to taste.
//   reaction      seconds from first sighting to first shot
//   aimError      initial aim offset in degrees when acquiring a target
//   settle        seconds for that aim error to shrink to ~37%
//   turnSpeed     max view rotation, degrees per second
//   headshot      chance a bot aims for the head during an engagement
//   sprayControl  0..1 how much recoil the bot pulls down against
//   strafe        0..1 how much the bot strafes while fighting
//   counterStrafe 0..1 chance it stops dead to take accurate long shots
//   fov           field of view for spotting, degrees
//   sight         max spotting distance
//   hearing       multiplier on how far footsteps / gunfire are heard
//   aggression    0..1 tendency to push rather than hold
//   grenade       0..1 likelihood of throwing grenades at hidden enemies
//   burst         [min, max] bullets per burst at range
export const DIFFICULTY = {
  easy: {
    label: 'Recruit',
    reaction: 0.85,
    aimError: 7.5,
    settle: 0.85,
    turnSpeed: 160,
    headshot: 0.06,
    sprayControl: 0.15,
    strafe: 0.15,
    counterStrafe: 0.1,
    fov: 95,
    sight: 45,
    hearing: 0.55,
    aggression: 0.35,
    grenade: 0,
    burst: [2, 4],
    jitter: 1.4,
  },
  normal: {
    label: 'Regular',
    reaction: 0.5,
    aimError: 4.2,
    settle: 0.55,
    turnSpeed: 280,
    headshot: 0.2,
    sprayControl: 0.45,
    strafe: 0.45,
    counterStrafe: 0.35,
    fov: 110,
    sight: 65,
    hearing: 0.8,
    aggression: 0.5,
    grenade: 0.25,
    burst: [3, 6],
    jitter: 0.8,
  },
  hard: {
    label: 'Veteran',
    reaction: 0.3,
    aimError: 2.4,
    settle: 0.35,
    turnSpeed: 450,
    headshot: 0.42,
    sprayControl: 0.75,
    strafe: 0.75,
    counterStrafe: 0.7,
    fov: 120,
    sight: 85,
    hearing: 1.0,
    aggression: 0.6,
    grenade: 0.5,
    burst: [4, 8],
    jitter: 0.45,
  },
  expert: {
    label: 'Elite',
    reaction: 0.19,
    aimError: 1.3,
    settle: 0.22,
    turnSpeed: 720,
    headshot: 0.65,
    sprayControl: 0.92,
    strafe: 0.95,
    counterStrafe: 0.9,
    fov: 130,
    sight: 110,
    hearing: 1.2,
    aggression: 0.7,
    grenade: 0.7,
    burst: [5, 10],
    jitter: 0.25,
  },
};

export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard', 'expert'];

export const BOT_NAMES = [
  'Nigel', 'Gareth', 'Trevor', 'Barry', 'Colin', 'Derek', 'Graham', 'Keith',
  'Clive', 'Malcolm', 'Rodney', 'Geoff', 'Alan', 'Dennis', 'Brian', 'Kevin',
  'Sandra', 'Beryl', 'Doris', 'Maureen', 'Shirley', 'Brenda', 'Pauline', 'Janet',
];
