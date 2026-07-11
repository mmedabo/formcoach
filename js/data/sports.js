// ============================================================================
//  Sport catalogue — the single source of truth for the whole app.
//  Add a sport = add an entry here. Nav, Train pages and the Form Coach all
//  read from this file, so nothing else needs to change to onboard a new sport.
// ============================================================================

// ---- Volleyball · Program A — Speed, Agility & Plyometric --------------------
const volleyballSpeed = {
  id: "speed",
  name: "Speed & Agility",
  level: "Intermediate",
  tagline: "Train fast. Move better. Jump higher. Stay injury free.",
  blurb: "Six weeks of speed, agility, reaction and plyometric work to move quicker and land safer on the sand.",
  overview: {
    duration: "6 weeks",
    frequency: "3 sessions / week (Mon · Wed · Fri)",
    sessionLength: "60–75 min",
    equipment: "Cones, resistance bands, optional agility ladder",
    focus: ["Speed", "Agility", "Reaction time", "Plyometric strength", "Injury prevention"],
  },
  why: [
    { icon: "shield", label: "Reduce injury risk" },
    { icon: "bolt",   label: "Improve speed & quickness" },
    { icon: "agility",label: "Enhance agility" },
    { icon: "jump",   label: "Jump higher, play stronger" },
  ],
  days: [
    {
      title: "Day 1", subtitle: "Speed & Acceleration",
      warmup: "Dynamic stretches, high knees, butt kicks, carioca",
      blocks: [{ name: "Drills", items: [
        { name: "Acceleration Sprints", dose: "3 × 10 yds" },
        { name: "Resisted Band Sprints", dose: "2 × 10 yds" },
        { name: "Cone Reaction Drills", dose: "3 × 5 reps" },
        { name: "Lateral Bounds", dose: "3 × 10 reps" },
        { name: "3-Cone Shuffle", dose: "3 × 10 reps" },
      ]}],
      cooldown: "Static stretch: hamstrings, quads, calves, hip flexors",
    },
    {
      title: "Day 2", subtitle: "Agility & Change of Direction",
      warmup: "Dynamic stretches, agility ladder drills",
      blocks: [{ name: "Drills", items: [
        { name: "T-Drill", dose: "3 sets" },
        { name: "Zig-Zag Cone Drill", dose: "3 sets" },
        { name: "4-Corner Drill", dose: "3 sets" },
        { name: "In & Out Lateral Shuffle", dose: "4 reps × 3 sets" },
        { name: "Mirror Drill", dose: "3 × 30 sec" },
      ]}],
      cooldown: "Foam rolling & static stretching",
    },
    {
      title: "Day 3", subtitle: "Plyometrics & Strength",
      warmup: "Dynamic stretches, jump rope (3 × 1 min)",
      blocks: [{ name: "Drills", items: [
        { name: "Squat Jumps", dose: "3 × 10" },
        { name: "Lateral Hops Over Cone", dose: "3 × 10 each side" },
        { name: "Split Lunge Jumps", dose: "3 × 8 each leg" },
        { name: "Resistance Band Walks", dose: "3 × 10 yds each way" },
        { name: "Glute Bridges with Band", dose: "3 × 15 reps" },
      ]}],
      cooldown: "Static stretch: lower-body muscles",
    },
  ],
  progression: [
    { weeks: "Weeks 1–2", title: "Foundation", points: ["Master technique and form."] },
    { weeks: "Weeks 3–4", title: "Intensity", points: ["Reduce rest intervals.", "Add more reps."] },
    { weeks: "Weeks 5–6", title: "Integration", points: ["Complex drills combining movements (sprint → shuffle → backpedal)."] },
  ],
  tips: [
    { label: "Consistency", text: "Attend all sessions." },
    { label: "Rest & recovery", text: "Prioritize sleep and hydration." },
    { label: "Nutrition", text: "Eat balanced meals to fuel performance." },
    { label: "Monitoring", text: "Track progress and adjust drills." },
  ],
};

// ---- Volleyball · Program B — Strength & Vertical (Advanced) -----------------
const volleyballStrength = {
  id: "strength",
  name: "Strength & Vertical",
  level: "Advanced",
  tagline: "Get stronger. Jump higher. Win more.",
  blurb: "An advanced 6-week barbell + plyometric block for max strength, explosive power and a higher vertical.",
  overview: {
    duration: "6 weeks",
    frequency: "3 sessions / week (Mon · Wed · Fri)",
    sessionLength: "75–90 min",
    equipment: "Barbells, dumbbells, bands, plyo box, med ball, cables",
    focus: ["Max strength", "Power", "Explosiveness", "Single-leg stability", "Posterior chain", "Core strength", "Injury prevention"],
  },
  why: [
    { icon: "jump",   label: "Increase vertical jump" },
    { icon: "bolt",   label: "Build explosive power" },
    { icon: "shield", label: "Protect knees & shoulders" },
    { icon: "agility",label: "Improve speed & on-court movement" },
    { icon: "heart",  label: "Stay injury free, play longer" },
  ],
  days: [
    {
      title: "Day 1", subtitle: "Lower Body Strength & Power",
      blocks: [
        { name: "Main lifts", items: [
          { name: "Back Squat", dose: "5 × 3–5 (80–90% 1RM)" },
          { name: "Romanian Deadlift", dose: "4 × 6" },
          { name: "Bulgarian Split Squat", dose: "3 × 6 each leg" },
          { name: "Hip Thrust", dose: "3 × 8" },
          { name: "Nordic Hamstring Curl", dose: "3 × 5" },
          { name: "Standing Calf Raise", dose: "4 × 12" },
        ]},
        { name: "Power finisher", items: [
          { name: "Depth Jumps", dose: "4 × 4 (24–30\" box)" },
          { name: "Broad Jumps", dose: "3 × 5" },
        ]},
      ],
      focus: "Max strength, posterior chain, single-leg stability, power production",
      cooldown: "Stretch + foam roll (10 min)",
    },
    {
      title: "Day 2", subtitle: "Upper Body Strength & Explosive Power",
      blocks: [
        { name: "Main lifts", items: [
          { name: "Bench Press", dose: "5 × 3–5 (80–90% 1RM)" },
          { name: "Pull-ups", dose: "4 × 6–8 (weighted if able)" },
          { name: "Push Press", dose: "4 × 4" },
          { name: "Single-Arm DB Row", dose: "4 × 8 each arm" },
          { name: "Landmine Press", dose: "3 × 6 each arm" },
          { name: "Face Pulls", dose: "3 × 15" },
        ]},
        { name: "Power finisher", items: [
          { name: "Med Ball Overhead Throws", dose: "4 × 6" },
          { name: "Med Ball Rotational Slams", dose: "3 × 8 each side" },
        ]},
      ],
      focus: "Upper-body strength, shoulder health, explosive pressing power",
      cooldown: "Stretch + mobility work (10 min)",
    },
    {
      title: "Day 3", subtitle: "Power, Speed & Volleyball Movement",
      blocks: [
        { name: "A · Plyometric circuit (3 rounds)", items: [
          { name: "Box Jumps", dose: "4 × 5" },
          { name: "Lateral Bounds", dose: "3 × 6 each side" },
          { name: "Hurdle Hops", dose: "3 × 5 each leg" },
          { name: "Sprint to Stick", dose: "3 × 5" },
        ]},
        { name: "B · Strength accessories", items: [
          { name: "Single-Leg RDL", dose: "3 × 8 each leg" },
          { name: "Copenhagen Plank", dose: "3 × 20 sec each side" },
          { name: "Banded Lateral Walks", dose: "3 × 15 steps each way" },
          { name: "Core circuit (3 rounds)", dose: "Plank 30s · Dead Bug 10 · Side Plank 20s" },
        ]},
      ],
      focus: "Explosiveness, change of direction, core & joint stability",
      cooldown: "Stretch + breathing reset (10 min)",
    },
  ],
  progression: [
    { weeks: "Weeks 1–2", title: "Foundation", points: ["Build movement quality.", "Moderate loads.", "Perfect technique."] },
    { weeks: "Weeks 3–4", title: "Intensity", points: ["Increase load.", "Reduce rest.", "Add explosive finisher work."] },
    { weeks: "Weeks 5–6", title: "Peak & Integrate", points: ["Heavy + fast combinations.", "More complex movements."] },
  ],
  tips: [
    { label: "Nutrition", text: "Fuel your performance and recovery." },
    { label: "Sleep", text: "7–9 hours for recovery and hormone balance." },
    { label: "Hydration", text: "Water before, during and after training." },
    { label: "Recovery", text: "Foam roll, stretch and mobility daily." },
  ],
};

// ---- Volleyball · Program C — Combined (two selectable structures) -----------
const volleyballCombined = {
  id: "combined",
  name: "Combined",
  level: "Choose your structure",
  tagline: "Both engines in one plan — pick how you want to run it.",
  blurb: "Runs the Speed & Agility and Strength & Vertical programs together. Choose a 6-day split or alternate them week to week.",
  combinesRefs: ["speed", "strength"],
  variants: [
    {
      id: "split6",
      name: "6-day split",
      summary: "Strength on Mon/Wed/Fri, Speed & Agility on Tue/Thu/Sat, Sunday rest. Full volume — nothing is cut. Advanced commitment.",
      schedule: [
        { day: "Mon", label: "Strength · Day 1 — Lower Body", ref: "strength", dayIndex: 0 },
        { day: "Tue", label: "Speed · Day 1 — Speed & Acceleration", ref: "speed", dayIndex: 0 },
        { day: "Wed", label: "Strength · Day 2 — Upper Body", ref: "strength", dayIndex: 1 },
        { day: "Thu", label: "Speed · Day 2 — Agility", ref: "speed", dayIndex: 1 },
        { day: "Fri", label: "Strength · Day 3 — Power & Movement", ref: "strength", dayIndex: 2 },
        { day: "Sat", label: "Speed · Day 3 — Plyometrics", ref: "speed", dayIndex: 2 },
        { day: "Sun", label: "Rest & recovery", ref: null, dayIndex: null },
      ],
    },
    {
      id: "alternate",
      name: "Alternating weeks",
      summary: "Odd weeks run the Speed & Agility program, even weeks run Strength & Vertical, across the 6 weeks. Simpler; keeps each program intact.",
      schedule: [
        { week: "Week 1", label: "Speed & Agility program (3 sessions)", ref: "speed" },
        { week: "Week 2", label: "Strength & Vertical program (3 sessions)", ref: "strength" },
        { week: "Week 3", label: "Speed & Agility program (3 sessions)", ref: "speed" },
        { week: "Week 4", label: "Strength & Vertical program (3 sessions)", ref: "strength" },
        { week: "Week 5", label: "Speed & Agility program (3 sessions)", ref: "speed" },
        { week: "Week 6", label: "Strength & Vertical program (3 sessions)", ref: "strength" },
      ],
    },
  ],
};

// ---- The catalogue ----------------------------------------------------------
export const SPORTS = {
  volleyball: {
    id: "volleyball",
    name: "Volleyball",
    status: "active",
    blurb: "Beach & indoor. Jump higher, move quicker, and sharpen spike / set / receive technique.",
    programs: [volleyballSpeed, volleyballStrength, volleyballCombined],
    coach: {
      skillsLabel: "Volleyball skills",
      skills: ["spike", "set", "receive"],
      workout: ["squat", "pushup", "lunge", "bridge"],
      defaultExercise: "receive",
    },
  },
  tennis:     { id: "tennis",     name: "Tennis",     status: "soon", blurb: "Serve power, footwork and rotational strength. Coming soon." },
  basketball: { id: "basketball", name: "Basketball", status: "soon", blurb: "Vertical, agility and finishing under fatigue. Coming soon." },
  soccer:     { id: "soccer",     name: "Soccer",     status: "soon", blurb: "Sprint speed, change of direction and endurance. Coming soon." },
};

export const programById = (sport, id) => (sport.programs || []).find(p => p.id === id);
export const getSport = id => SPORTS[id] || SPORTS.volleyball;
