// Shared by unit and e2e checks of the demo recordings.
// Expected final tones per stage after replay (stages not listed must be idle; source is always the loaded example).
export const DEMO_TONES={
  'full-2b':{voz:'passed',ear:'passed',uhm:'passed',align:'passed',clips:'passed',clear:'passed',review:'passed',export:'passed'},
  'clips-fail':{voz:'passed',ear:'passed',uhm:'passed',align:'passed',clips:'failed',laya:['passed','review'],clear:'passed',review:'passed'},
  offline:{voz:'fallback',ear:'fallback',uhm:'fallback',align:'fallback',clips:'fallback',laya:'failed',clear:'fallback',review:'passed'},
  malformed:{voz:'fallback',ear:'fallback',uhm:'fallback',align:'fallback',clips:'fallback',laya:'failed',clear:'fallback',review:'passed'},
  'voz-fail':{voz:'fallback'},
  'align-crossing':{voz:'passed',ear:'passed',align:'passed'},
  'clear-rejected':{clear:'fallback'},
  hang:{voz:'failed'},
};
