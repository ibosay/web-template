// @ts-nocheck
import { useEffect, useMemo, useRef, useState } from 'react';
import { createIntl } from 'react-intl';
import { mathMessages } from './mathMessages';
import { EXPANSION_QUESTIONS } from './expansion/index.ts';
import { MATH_QUESTIONS, MATH_TOPICS } from './math/index.ts';
import { ISLAM_REVISIONS, ISLAM_REVISED_QUESTIONS } from './islam/revisions.ts';
import { Capacitor } from '@capacitor/core';
import { App as CapacitorApp } from '@capacitor/app';
import { Haptics, NotificationType } from '@capacitor/haptics';
import './QuizArenaLive.css';
import './QuizArenaLiveV2.css';
import {
  QUESTIONS as LEGACY_QUESTIONS,
  HARD_QUESTION_IDS as LEGACY_HARD_QUESTION_IDS,
  QUESTION_TRANSLATIONS as LEGACY_TRANSLATIONS,
  CATEGORIES as LEGACY_CATEGORIES,
} from './QuizArenaLiveApp';
import { HISTORY_QUESTIONS, HISTORY_TOPICS, historyLabel } from './history/index.ts';
import { SUPPLEMENTAL_QUESTIONS, SUPPLEMENTAL_HARD_IDS } from './supplementalQuestions';

type Question = { id:number; category:string; question:string; answers:string[]; correct:number; source?:string; difficulty?:'easy'|'hard'; explanation?:string };
type Progress = { xp:number; rounds:number; correct:number; bestStreak:number; gifts:number; stars:number; levelChests:number; wrong:number; jokerUses:number };
type MasteryEntry = { seen:number[]; hadMistake:boolean };
type MasteryState = Record<string, MasteryEntry>;
type Reward = { title:string; detail:string; xp:number; stars:number } | null;

const legacyWithoutHistory = (LEGACY_QUESTIONS as Question[]).filter(question => question.category !== 'Geschichte');
const existingIds = new Set(legacyWithoutHistory.map(question => question.id));
const supplements = (SUPPLEMENTAL_QUESTIONS as Question[]).filter(question => question.category !== 'Geschichte' && !existingIds.has(question.id));
export const QUESTIONS: Question[] = [
  ...[...legacyWithoutHistory, ...supplements].map(q => ISLAM_REVISIONS.get(q.id) || q),
  ...(HISTORY_QUESTIONS as Question[]), ...EXPANSION_QUESTIONS, ...MATH_QUESTIONS,
];
export const CATEGORIES = LEGACY_CATEGORIES.flatMap(key => key === 'Wissenschaft' ? [key, 'Mathe'] : [key]);
export const QUESTION_TRANSLATIONS = LEGACY_TRANSLATIONS;
export const HARD_QUESTION_IDS = new Set<number>([...Array.from(LEGACY_HARD_QUESTION_IDS), ...Array.from(SUPPLEMENTAL_HARD_IDS)]);

ISLAM_REVISED_QUESTIONS.forEach(q => { if (HARD_QUESTION_IDS.has(q.oldId)) HARD_QUESTION_IDS.add(q.id); });
const expansionIds = new Set(EXPANSION_QUESTIONS.map(q => q.id));

/** Return only questions available in the chosen language and difficulty. */
export const eligibleQuestions = (category, difficulty, language) => QUESTIONS
  .filter(q => category === 'Alle' || (category === 'Mathe' ? q.category.startsWith('Mathe ') : q.category === category))
  .filter(q => language === 'DE' || !expansionIds.has(q.id))
  .filter(q => q.category.startsWith('Staatsbürgerschaft') || (difficulty === 'hard' ? isHardQuestion(q) : !isHardQuestion(q)))
  .map(q => language === 'DE' ? q : q.en ? { ...q, ...q.en } : { ...q, ...(LEGACY_TRANSLATIONS.EN?.[q.id] || {}) });

export const isHardQuestion = (question:Question) => question.difficulty === 'hard' || (question.difficulty == null && HARD_QUESTION_IDS.has(question.id));

const CITIZENSHIP_TOPICS = ['Staatsbürgerschaft Österreich','Staatsbürgerschaft Wien'];

type QuizCategoryTheme = 'core'|'islam'|'general'|'geography'|'science'|'math'|'history'|'eu'|'citizenship';
export const getQuizCategoryTheme=(category:string):QuizCategoryTheme=>{
  if(category==='Islam')return 'islam';
  if(category==='Allgemeinwissen')return 'general';
  if(category==='Geografie')return 'geography';
  if(category==='Wissenschaft')return 'science';
  if(category.startsWith('Mathe'))return 'math';
  if(category.startsWith('Geschichte'))return 'history';
  if(category==='EU')return 'eu';
  if(category.startsWith('Staatsbürgerschaft'))return 'citizenship';
  return 'core';
};

const CATEGORY_THEME_COPY={
  DE:{
    core:{eyebrow:'QUIZ ARENA',title:'Deine Quiz Welt',detail:'Ein Mix aus allen Wissensgebieten im Quiz Arena Stil.'},
    islam:{eyebrow:'ISLAM FRAGEN',title:'Wissen · Verstehen · Anwenden',detail:'Ruhige Nachtwelt mit Gold, Mond und islamischer Architektur.'},
    general:{eyebrow:'ALLGEMEINWISSEN',title:'Das Wissens Universum',detail:'Breites Wissen in einer modernen Quiz Studio Atmosphäre.'},
    geography:{eyebrow:'GEOGRAFIE',title:'Entdecke die Welt',detail:'Karten, Topografie, Berge und Ozeane begleiten deine Runde.'},
    science:{eyebrow:'WISSENSCHAFT',title:'Verstehe Zusammenhänge',detail:'Kosmos, Atome und Labor Elemente geben der Runde ihren Look.'},
    math:{eyebrow:'MATHE',title:'Knifflig · Klar · Strukturiert',detail:'Geometrie, Raster und Formeln schaffen eine fokussierte Mathe Welt.'},
    history:{eyebrow:'GESCHICHTE',title:'Vergangenheit verstehen',detail:'Archiv, Bronze und historische Architektur prägen diese Kategorie.'},
    eu:{eyebrow:'EU',title:'Europa entdecken',detail:'Europablau, Gold und moderne Architektur bilden die Themenwelt.'},
    citizenship:{eyebrow:'STAATSBÜRGERSCHAFT',title:'Wissen · Rechte · Verantwortung',detail:'Österreichische Civic Elemente mit Rot, Gold und Wiener Architektur.'},
  },
  EN:{
    core:{eyebrow:'QUIZ ARENA',title:'Your quiz world',detail:'A mix of every knowledge area in the Quiz Arena style.'},
    islam:{eyebrow:'ISLAM QUESTIONS',title:'Know · Understand · Apply',detail:'A calm night world with gold, moonlight and Islamic architecture.'},
    general:{eyebrow:'GENERAL KNOWLEDGE',title:'The knowledge universe',detail:'Broad knowledge in a modern quiz studio atmosphere.'},
    geography:{eyebrow:'GEOGRAPHY',title:'Discover the world',detail:'Maps, topography, mountains and oceans shape the round.'},
    science:{eyebrow:'SCIENCE',title:'Understand connections',detail:'Cosmos, atoms and laboratory elements define the visual world.'},
    math:{eyebrow:'MATH',title:'Clever · Clear · Structured',detail:'Geometry, grids and formulas create a focused math world.'},
    history:{eyebrow:'HISTORY',title:'Understand the past',detail:'Archives, bronze and historic architecture shape this category.'},
    eu:{eyebrow:'EU',title:'Discover Europe',detail:'European blue, gold and modern architecture build the theme.'},
    citizenship:{eyebrow:'CITIZENSHIP',title:'Knowledge · Rights · Responsibility',detail:'Austrian civic elements with red, gold and Vienna architecture.'},
  },
} as const;

const shuffle = <T,>(items:T[]) => {
  const result=[...items];
  for(let i=result.length-1;i>0;i-=1){const j=Math.floor(Math.random()*(i+1));[result[i],result[j]]=[result[j],result[i]];}
  return result;
};
const shuffleQuestion=(question:Question):Question=>{const order=shuffle(question.answers.map((_,i)=>i));return {...question,answers:order.map(i=>question.answers[i]),correct:order.indexOf(question.correct)}};

const defaultProgress:Progress={xp:0,rounds:0,correct:0,bestStreak:0,gifts:0,stars:0,levelChests:0,wrong:0,jokerUses:0};
const clampInt=(value:unknown,max:number)=>typeof value==='number'&&Number.isFinite(value)?Math.min(max,Math.max(0,Math.floor(value))):0;
const normalizeProgress=(value:unknown):Progress=>{if(!value||typeof value!=='object')return defaultProgress;const item=value as Partial<Progress>;const xp=clampInt(item.xp,10_000_000);return{xp,rounds:clampInt(item.rounds,100_000),correct:clampInt(item.correct,1_000_000),bestStreak:clampInt(item.bestStreak,100),gifts:clampInt(item.gifts,100_000),stars:typeof item.stars==='number'?clampInt(item.stars,100_000):Math.floor(xp/500),levelChests:clampInt(item.levelChests,100_000),wrong:clampInt(item.wrong,1_000_000),jokerUses:clampInt(item.jokerUses,100_000)}};
const addXpRewards=(progress:Progress,amount:number,bonusStars=0,bonusGifts=0):Progress=>{const oldLevel=Math.floor(progress.xp/500)+1;const nextXp=progress.xp+Math.max(0,amount);const newLevel=Math.floor(nextXp/500)+1;const levelUps=Math.max(0,newLevel-oldLevel);const milestone=Math.max(0,Math.floor(newLevel/5)-Math.floor(oldLevel/5));return{...progress,xp:nextXp,stars:progress.stars+levelUps+milestone*2+bonusStars,levelChests:progress.levelChests+milestone,gifts:progress.gifts+bonusGifts}};
const getRank=(level:number)=>level>=50?'Quiz Legende':level>=35?'Großmeister':level>=20?'Meister':level>=10?'Experte':level>=5?'Kenner':'Einsteiger';

type WebkitWindow=typeof window&{webkitAudioContext?:typeof AudioContext};
const createAudioContext=()=>{const C=window.AudioContext||(window as WebkitWindow).webkitAudioContext;return C?new C():null};
const playTone=(context:AudioContext|null,enabled:boolean,correct:boolean)=>{if(!enabled||!context)return;try{if(context.state==='suspended')void context.resume();const now=context.currentTime;const osc=context.createOscillator();const gain=context.createGain();osc.type=correct?'sine':'square';osc.frequency.setValueAtTime(correct?720:210,now);osc.frequency.exponentialRampToValueAtTime(correct?1080:145,now+.16);gain.gain.setValueAtTime(.14,now);gain.gain.exponentialRampToValueAtTime(.001,now+.18);osc.connect(gain);gain.connect(context.destination);osc.start(now);osc.stop(now+.19)}catch{}};
const vibrate=(enabled:boolean,correct:boolean)=>{if(!enabled)return;try{if(Capacitor.isNativePlatform()){void Haptics.notification({type:correct?NotificationType.Success:NotificationType.Error});return}if(typeof navigator!=='undefined'&&'vibrate'in navigator)navigator.vibrate(correct?55:[55,35,70])}catch{}};

const BrandLogo=({className=''}:{className?:string})=><svg className={`brandLogo ${className}`} viewBox="0 0 1000 880" aria-hidden="true"><defs><linearGradient id="quizArenaBrandGradientV2" x1="0" y1="1" x2="1" y2="0"><stop offset="0%" stopColor="#071b52"/><stop offset="55%" stopColor="#0b5f9f"/><stop offset="100%" stopColor="#16b4d5"/></linearGradient></defs><path d="M971.1 40 941.3 14.9 915.3 3.7 897.6 0 874.3 0 844.5 7.4 401.3 268.2 374.3 279.3 344.5 278.4 319.4 264.4 303.5 242.1 298 215.1 339.9 182.5 393.9 154.6 437.6 141.5 469.3 136.9 521.4 135.9 532.6 137.8 597.8 95.9 565.2 88.5 527.9 83.8 479.5 83.8 423.6 92.2 377.1 106.1 345.4 120.1 301.7 146.2 268.2 172.3 234.6 205.8 199.3 251.4 176.9 291.4 154.6 351 144.3 402.2 142.5 458.1 149 507.4 162.9 554 209.5 527.9 202 502.8 195.5 458.1 195.5 419 199.3 390.1 208.6 352 219.7 322.2 234.6 293.3 256.1 261.6 275.6 293.3 288.6 306.3 306.3 318.4 328.7 327.7 346.4 331.5 382.7 329.6 401.3 324 430.2 309.1 862.2 54.9 877.1 51.2 892.9 51.2 915.3 58.7 937.6 79.1 947.9 106.1 947.9 123.8 944.1 138.7 936.7 152.7 919.9 169.5 46.6 676 32.6 689 16.8 710.4 6.5 731.8 0 759.8 0 778.4 5.6 803.5 13 820.3 26.1 838.9 55.9 864.1 82.9 875.2 120.1 879 156.4 870.6 610.8 608 630.4 600.6 661.1 601.5 685.3 614.5 702 637.8 705.8 654.6 704.8 665.7 655.5 704.8 610.8 726.3 581.9 735.6 531.7 743.9 466.5 743.9 397.6 784.9 430.2 792.4 472.1 797 528.9 796.1 570.8 789.6 600.6 782.1 649.9 763.5 685.3 744.9 731.8 711.4 760.7 683.4 793.3 642.5 821.2 593.1 841.7 538.2 852.9 484.2 854.7 422.7 850.1 380.8 837.1 330.5 790.5 357.5 801.7 417.1 802.6 447.9 798 490.7 789.6 527 777.5 559.6 763.5 588.5 746.7 613.6 731.8 589.4 716 573.6 698.3 561.5 679.7 553.1 660.1 548.4 622.9 549.3 592.2 560.5 132.2 825.9 101.5 827.7 79.1 819.4 59.6 799.8 51.2 774.7 54.9 746.7 65.2 728.1 80.1 713.2 625.7 399.4 956.2 205.8 973 189 986 169.5 994.4 149 999.1 124.8 999.1 106.1 995.3 85.7 985.1 60.5Z" fill="url(#quizArenaBrandGradientV2)"/></svg>;

const CategoryIcon=({category}:{category:string})=>{const c={width:24,height:24,viewBox:'0 0 24 24',fill:'none','aria-hidden':true}as const;if(category==='Alle')return <svg {...c}><rect x="4" y="4" width="6" height="6" rx="2" stroke="currentColor" strokeWidth="1.8"/><rect x="14" y="4" width="6" height="6" rx="2" stroke="currentColor" strokeWidth="1.8"/><rect x="4" y="14" width="6" height="6" rx="2" stroke="currentColor" strokeWidth="1.8"/><rect x="14" y="14" width="6" height="6" rx="2" stroke="currentColor" strokeWidth="1.8"/></svg>;if(category==='Allgemeinwissen')return <svg {...c}><path d="M9 18h6M10 21h4M8.2 14.6C6.8 13.5 6 11.9 6 10a6 6 0 1 1 12 0c0 1.9-.8 3.5-2.2 4.6-.9.7-1.3 1.3-1.5 2.4h-4.6c-.2-1.1-.6-1.7-1.5-2.4Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>;if(category==='Geografie')return <svg {...c}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/><path d="M3 12h18M12 3c2.2 2.3 3.4 5.3 3.4 9S14.2 18.7 12 21M12 3C9.8 5.3 8.6 8.3 8.6 12S9.8 18.7 12 21" stroke="currentColor" strokeWidth="1.8"/></svg>;if(category==='Wissenschaft')return <svg {...c}><circle cx="12" cy="12" r="1.7" fill="currentColor"/><ellipse cx="12" cy="12" rx="9" ry="3.8" stroke="currentColor" strokeWidth="1.6"/><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(60 12 12)" stroke="currentColor" strokeWidth="1.6"/><ellipse cx="12" cy="12" rx="9" ry="3.8" transform="rotate(120 12 12)" stroke="currentColor" strokeWidth="1.6"/></svg>;if(category.startsWith('Mathe'))return <svg {...c}><rect x="5" y="2" width="14" height="20" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M8 6h8M8 11h2m4 0h2M8 15h2m4 0h2M8 19h2m4 0h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>;if(category.startsWith('Geschichte'))return <svg {...c}><path d="M4 8h16M6 8V5h12v3M7 8v9M12 8v9M17 8v9M5 17h14M4 20h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;if(category.startsWith('Staatsbürgerschaft'))return <svg {...c}><path d="M6 4h12v16H6zM9 8h6M9 12h6M9 16h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>;if(category==='EU')return <svg {...c}><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.6"/><path d="M12 6.2h.01M16.1 7.9h.01M17.8 12h.01M16.1 16.1h.01M12 17.8h.01M7.9 16.1h.01M6.2 12h.01M7.9 7.9h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/></svg>;return <svg {...c}><path d="M16.5 16.8A7.5 7.5 0 1 1 13.1 4a6.3 6.3 0 1 0 3.4 12.8Z" stroke="currentColor" strokeWidth="1.7"/><path d="m17.6 6 .7 1.5 1.7.2-1.2 1.2.3 1.7-1.5-.8-1.5.8.3-1.7-1.2-1.2 1.7-.2.7-1.5Z" fill="currentColor"/></svg>};

const AchievementIcon=({label}:{label:string})=>{const c={width:24,height:24,viewBox:'0 0 24 24',fill:'none','aria-hidden':true}as const;if(label.includes('Runden'))return <svg {...c}><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7"/><path d="M10 8.5 15 12l-5 3.5v-7Z" stroke="currentColor" strokeWidth="1.7"/></svg>;if(label.includes('richtig'))return <svg {...c}><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7"/><path d="m8.3 12.2 2.4 2.4 5.2-5.3" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/></svg>;if(label.includes('Serie'))return <svg {...c}><path d="m13.2 2.8-7 10h5.2l-.6 8.4 7-10h-5.2l.6-8.4Z" stroke="currentColor" strokeWidth="1.7"/></svg>;if(label.includes('Level'))return <svg {...c}><circle cx="12" cy="9" r="5" stroke="currentColor" strokeWidth="1.7"/><path d="m9 13-1 8 4-2 4 2-1-8" stroke="currentColor" strokeWidth="1.7"/></svg>;if(label.includes('Joker'))return <svg {...c}><rect x="3" y="5" width="7" height="14" rx="2" stroke="currentColor" strokeWidth="1.7"/><rect x="14" y="5" width="7" height="14" rx="2" stroke="currentColor" strokeWidth="1.7"/><path d="M6.5 9h.01M17.5 9h.01M5.5 15h2M16.5 15h2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/></svg>;if(label.includes('Wissenskisten')||label.includes('Perfekt')||label.includes('Goldsammler'))return <svg {...c}><path d="M4 9h16v11H4V9Zm-1-4h18v4H3V5Zm9 0v15M8.5 5C6.8 5 6 4.2 6 3.2 6 2.3 6.8 2 7.5 2 9.3 2 12 5 12 5m3.5 0C17.2 5 18 4.2 18 3.2 18 2.3 17.2 2 16.5 2 14.7 2 12 5 12 5" stroke="currentColor" strokeWidth="1.6"/></svg>;return <svg {...c}><path d="m12 3 2.7 5.5 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3Z" stroke="currentColor" strokeWidth="1.7"/></svg>};

const UI={
  DE:{difficulty:'Schwierigkeit',easy:'Einfach',easySub:'Alle Fehler erlaubt · kein Zeitdruck',hard:'Schwer',hardSub:'2 Fehler beenden die Runde · kein Zeitdruck',switchDifficulty:'Tippen zum Wechseln',light:'Hell',dark:'Dunkel',auto:'Auto',small:'Klein',normal:'Normal',large:'Groß',notAvailable:'Auf diesem Gerät nicht verfügbar',failed:'RUNDE BEENDET',mistakesFail:'Du hast im schweren Modus zweimal falsch geantwortet.',restart:'Von vorne starten',correctLabel:'RICHTIG',levelLabel:'LEVEL',languageLabel:'Sprache',tag:'Wissen. Spielen. Besser werden.',play:'Spiel starten',stats:'Meine Statistik',settings:'Einstellungen',sound:'Ton',soundSub:'Soundeffekte',vibration:'Vibration',vibrationSub:'Bei Antippen',design:'Design',font:'Schriftgröße',round:'Fragen pro Runde',statistics:'Statistiken',achievements:'Erfolge',about:'Über die App',privacy:'Datenschutz',privacyText:'Kein Name, keine Adresse, kein Passwort. Spielstand nur lokal.',imprint:'Impressum',imprintText:'Betreiberangaben werden vor Veröffentlichung ergänzt.',reset:'Fortschritt zurücksetzen',safe:'Sicher & anonym',questions:'Fragen',rounds:'Runden',correct:'richtig',badges:'Abzeichen',question:'FRAGE',points:'P',streak:'Serie',next:'Weiter',result:'Ergebnis ansehen',finished:'RUNDE BEENDET',accuracy:'GENAUIGKEIT',best:'BESTE SERIE',progress:'Dein Fortschritt',totalXp:'XP gesamt',again:'Noch eine Runde',home:'Zur Startseite',leaveTitle:'Runde verlassen?',leaveText:'Dein aktueller Fortschritt dieser Runde geht verloren.',continue:'Weiterspielen',leave:'Runde verlassen'},
  EN:{difficulty:'Difficulty',easy:'Easy',easySub:'All mistakes allowed · no time pressure',hard:'Hard',hardSub:'2 mistakes end the round · no time pressure',switchDifficulty:'Tap to switch',light:'Light',dark:'Dark',auto:'Auto',small:'Small',normal:'Normal',large:'Large',notAvailable:'Not available on this device',failed:'ROUND OVER',mistakesFail:'You answered incorrectly twice in Hard mode.',restart:'Restart',correctLabel:'CORRECT',levelLabel:'LEVEL',languageLabel:'Language',tag:'Learn. Play. Improve.',play:'Start game',stats:'My statistics',settings:'Settings',sound:'Sound',soundSub:'Sound effects',vibration:'Vibration',vibrationSub:'On tap',design:'Theme',font:'Font size',round:'Questions per round',statistics:'Statistics',achievements:'Achievements',about:'About the app',privacy:'Privacy',privacyText:'No name, address or password. Progress stays on this device.',imprint:'Legal notice',imprintText:'Operator details will be added before publication.',reset:'Reset progress',safe:'Safe & anonymous',questions:'questions',rounds:'rounds',correct:'correct',badges:'badges',question:'QUESTION',points:'PTS',streak:'Streak',next:'Next',result:'View results',finished:'ROUND COMPLETE',accuracy:'ACCURACY',best:'BEST STREAK',progress:'Your progress',totalXp:'total XP',again:'Play again',home:'Home',leaveTitle:'Leave round?',leaveText:'Your progress in this round will be lost.',continue:'Continue',leave:'Leave round'},
};

const CATEGORY_LABELS={
  DE:{Alle:'Alle',Islam:'Islam Fragen',Allgemeinwissen:'Allgemeinwissen',Geografie:'Geografie',Wissenschaft:'Wissenschaft',Geschichte:'Geschichte','Geschichte Erster Weltkrieg':'Erster Weltkrieg','Geschichte Zweiter Weltkrieg':'Zweiter Weltkrieg','Geschichte Tschetschenien':'Tschetschenische Geschichte','Geschichte Japan':'Japanische Geschichte',EU:'EU',Staatsbürgerschaft:'Staatsbürgerschaft','Staatsbürgerschaft Österreich':'Geschichte Österreichs','Staatsbürgerschaft Wien':'Wien'},
  EN:{Alle:'All',Islam:'Islam Questions',Allgemeinwissen:'General Knowledge',Geografie:'Geography',Wissenschaft:'Science',Geschichte:'History','Geschichte Erster Weltkrieg':'World War I','Geschichte Zweiter Weltkrieg':'World War II','Geschichte Tschetschenien':'Chechen History','Geschichte Japan':'Japanese History',EU:'EU',Staatsbürgerschaft:'Citizenship Questions','Staatsbürgerschaft Österreich':'History of Austria','Staatsbürgerschaft Wien':'Vienna'},
};

function QuizArenaLiveAppV2(){
  const [screen,setScreen]=useState<'start'|'quiz'|'result'|'failed'>('start');
  const [category,setCategory]=useState('');
  const [citizenshipOpen,setCitizenshipOpen]=useState(false);
  const [historyOpen,setHistoryOpen]=useState(false);
  const [mathOpen,setMathOpen]=useState(false);
  const [questions,setQuestions]=useState<Question[]>([]);
  const [index,setIndex]=useState(0);
  const [selected,setSelected]=useState<number|null>(null);
  const [hiddenAnswers,setHiddenAnswers]=useState<number[]>([]);
  const [roundJokerUsed,setRoundJokerUsed]=useState(false);
  const [answers,setAnswers]=useState<boolean[]>([]);
  const [score,setScore]=useState(0);
  const [streak,setStreak]=useState(0);
  const [bestRoundStreak,setBestRoundStreak]=useState(0);
  const [progress,setProgress]=useState<Progress>(()=>{try{const raw=localStorage.getItem('quiz-arena-progress');return raw?normalizeProgress(JSON.parse(raw)):defaultProgress}catch{return defaultProgress}});
  const [sound,setSound]=useState(()=>{try{return localStorage.getItem('quiz-arena-sound')!=='off'}catch{return true}});
  const [haptics,setHaptics]=useState(()=>{try{return localStorage.getItem('quiz-arena-haptics')!=='off'}catch{return true}});
  const [confirmExit,setConfirmExit]=useState(false);
  const [menuOpen,setMenuOpen]=useState(false);
  const [menuPage,setMenuPage]=useState<'main'|'stats'|'achievements'>('main');
  const [language,setLanguage]=useState<'DE'|'EN'>(()=>{try{return localStorage.getItem('quiz-arena-language')==='EN'?'EN':'DE'}catch{return'DE'}});
  const [theme,setTheme]=useState<'Dunkel'|'Hell'|'Auto'>(()=>{try{const v=localStorage.getItem('quiz-arena-theme');return v==='Dunkel'||v==='Auto'?v:'Hell'}catch{return'Hell'}});
  const [fontSize,setFontSize]=useState<'Klein'|'Normal'|'Groß'>(()=>{try{const v=localStorage.getItem('quiz-arena-font');return v==='Klein'||v==='Groß'?v:'Normal'}catch{return'Normal'}});
  const [roundSize,setRoundSize]=useState<number|'max'>(()=>{try{const s=localStorage.getItem('quiz-arena-round-size');if(s==='max')return'max';const v=Number(s);return[5,10,15].includes(v)?v:10}catch{return 10}});
  const [difficulty,setDifficulty]=useState<'easy'|'hard'>(()=>{try{return localStorage.getItem('quiz-arena-difficulty')==='hard'?'hard':'easy'}catch{return'easy'}});
  const [wrongCount,setWrongCount]=useState(0);
  const [gain,setGain]=useState(0);
  const [mastery,setMastery]=useState<MasteryState>(()=>{try{const raw=localStorage.getItem('quiz-arena-mastery');return raw?JSON.parse(raw):{}}catch{return{}}});
  const [lastReward,setLastReward]=useState<Reward>(null);
  const audioContextRef=useRef<AudioContext|null>(null);
  const t=UI[language];
  const current=questions[index];
  const level=Math.floor(progress.xp/500)+1;
  const rank=getRank(level);
  const xpIntoLevel=progress.xp%500;
  const xpToNextLevel=500-xpIntoLevel;
  const nextLevel=level+1;
  const nextLevelIsMilestone=nextLevel%5===0;
  const accuracy=answers.length?Math.round(answers.filter(Boolean).length/answers.length*100):0;
  const lifetimeAnswered=progress.correct+progress.wrong;
  const lifetimeAccuracy=lifetimeAnswered?Math.round(progress.correct/lifetimeAnswered*100):0;
  const resolvedDark=theme==='Dunkel'||(theme==='Auto'&&typeof window!=='undefined'&&window.matchMedia?.('(prefers-color-scheme: dark)').matches);
  const vibrationSupported=Capacitor.isNativePlatform()||(typeof navigator!=='undefined'&&'vibrate'in navigator);
  const isNativeApp=Capacitor.isNativePlatform();
  const mathIntl = useMemo(() => createIntl({ locale: language.toLowerCase(), messages: mathMessages[language] }), [language]);
  const categoryLabel=(key:string)=>key.startsWith('Mathe') ? mathIntl.formatMessage({ id: 'QuizMath.' + (key.split(' ')[1] || 'title') }) : historyLabel(key,language) || CATEGORY_LABELS[language][key]||key;
  const setDifficultyValue=(value:'easy'|'hard')=>{setDifficulty(value);try{localStorage.setItem('quiz-arena-difficulty',value)}catch{}};
  const toggleDifficulty=()=>setDifficultyValue(difficulty==='hard'?'easy':'hard');
  const ensureAudio=()=>{if(!sound)return null;if(!audioContextRef.current)audioContextRef.current=createAudioContext();if(audioContextRef.current?.state==='suspended')void audioContextRef.current.resume();return audioContextRef.current};

  const achievements=useMemo(()=>[
    {tier:'Normal',label:'Erste Runde',description:'Spiele deine erste Runde.',current:progress.rounds,target:1,unlocked:progress.rounds>=1},
    {tier:'Normal',label:'10 Runden',description:'Schließe 10 Runden ab.',current:progress.rounds,target:10,unlocked:progress.rounds>=10},
    {tier:'Fortgeschritten',label:'25 Runden',description:'Schließe 25 Runden ab.',current:progress.rounds,target:25,unlocked:progress.rounds>=25},
    {tier:'Schwer',label:'50 Runden',description:'Schließe 50 Runden ab.',current:progress.rounds,target:50,unlocked:progress.rounds>=50},
    {tier:'Legendär',label:'100 Runden',description:'Schließe 100 Runden ab.',current:progress.rounds,target:100,unlocked:progress.rounds>=100},
    {tier:'Normal',label:'10 richtig',description:'Beantworte 10 Fragen richtig.',current:progress.correct,target:10,unlocked:progress.correct>=10},
    {tier:'Normal',label:'50 richtig',description:'Beantworte 50 Fragen richtig.',current:progress.correct,target:50,unlocked:progress.correct>=50},
    {tier:'Fortgeschritten',label:'100 richtig',description:'Beantworte 100 Fragen richtig.',current:progress.correct,target:100,unlocked:progress.correct>=100},
    {tier:'Schwer',label:'250 richtig',description:'Beantworte 250 Fragen richtig.',current:progress.correct,target:250,unlocked:progress.correct>=250},
    {tier:'Legendär',label:'500 richtig',description:'Beantworte 500 Fragen richtig.',current:progress.correct,target:500,unlocked:progress.correct>=500},
    {tier:'Legendär',label:'1000 richtig',description:'Beantworte 1000 Fragen richtig.',current:progress.correct,target:1000,unlocked:progress.correct>=1000},
    {tier:'Normal',label:'5er Serie',description:'Erreiche fünf richtige Antworten hintereinander.',current:progress.bestStreak,target:5,unlocked:progress.bestStreak>=5},
    {tier:'Schwer',label:'10er Serie',description:'Erreiche zehn richtige Antworten hintereinander.',current:progress.bestStreak,target:10,unlocked:progress.bestStreak>=10},
    {tier:'Normal',label:'Level 5',description:'Erreiche Level 5.',current:level,target:5,unlocked:level>=5},
    {tier:'Fortgeschritten',label:'Level 10',description:'Erreiche Level 10.',current:level,target:10,unlocked:level>=10},
    {tier:'Schwer',label:'Level 20',description:'Erreiche Level 20.',current:level,target:20,unlocked:level>=20},
    {tier:'Legendär',label:'Level 35',description:'Erreiche Level 35.',current:level,target:35,unlocked:level>=35},
    {tier:'Legendär',label:'Level 50',description:'Erreiche Level 50.',current:level,target:50,unlocked:level>=50},
    {tier:'Normal',label:'Perfekter Durchlauf',description:'Schließe einen kompletten Fragenpool ohne Fehler ab.',current:progress.gifts,target:1,unlocked:progress.gifts>=1},
    {tier:'Fortgeschritten',label:'Goldsammler',description:'Verdiene 5 Goldene Wissenskisten.',current:progress.gifts,target:5,unlocked:progress.gifts>=5},
    {tier:'Schwer',label:'Perfektionist',description:'Verdiene 10 Goldene Wissenskisten.',current:progress.gifts,target:10,unlocked:progress.gifts>=10},
    {tier:'Legendär',label:'25 perfekte Durchläufe',description:'Verdiene 25 Goldene Wissenskisten.',current:progress.gifts,target:25,unlocked:progress.gifts>=25},
    {tier:'Normal',label:'Erster Joker',description:'Setze zum ersten Mal den 50:50 Joker ein.',current:progress.jokerUses,target:1,unlocked:progress.jokerUses>=1},
    {tier:'Fortgeschritten',label:'Joker Profi',description:'Setze den 50:50 Joker 10 Mal ein.',current:progress.jokerUses,target:10,unlocked:progress.jokerUses>=10},
    {tier:'Schwer',label:'Joker Meister',description:'Setze den 50:50 Joker 25 Mal ein.',current:progress.jokerUses,target:25,unlocked:progress.jokerUses>=25},
    {tier:'Legendär',label:'Joker Legende',description:'Setze den 50:50 Joker 50 Mal ein.',current:progress.jokerUses,target:50,unlocked:progress.jokerUses>=50},
  ],[progress,level]);

  const categoryStats=useMemo(()=>['Islam','Allgemeinwissen','Geografie','Wissenschaft','Mathe','Geschichte','EU','Staatsbürgerschaft'].map(label=>{const pool=label==='Mathe'?QUESTIONS.filter(q=>q.category.startsWith('Mathe ')):label==='Staatsbürgerschaft'?QUESTIONS.filter(q=>q.category.startsWith('Staatsbürgerschaft')):label==='Geschichte'?QUESTIONS.filter(q=>q.category.startsWith('Geschichte ')):QUESTIONS.filter(q=>q.category===label);const valid=new Set(pool.map(q=>q.id));const seen=new Set<number>();Object.entries(mastery).forEach(([key,entry])=>{const matches=label==='Mathe'?key.startsWith('Mathe'):label==='Staatsbürgerschaft'?key.startsWith('Staatsbürgerschaft'):label==='Geschichte'?key.startsWith('Geschichte '):key.startsWith(label+':');if(matches)entry.seen.forEach(id=>{if(valid.has(id))seen.add(id)})});return{label,title:categoryLabel(label),seen:seen.size,total:pool.length,percent:pool.length?Math.round(seen.size/pool.length*100):0}}),[mastery,language]);

  useEffect(()=>{localStorage.setItem('quiz-arena-progress',JSON.stringify(progress))},[progress]);
  useEffect(()=>{localStorage.setItem('quiz-arena-mastery',JSON.stringify(mastery))},[mastery]);
  useEffect(()=>{try{localStorage.setItem('quiz-arena-sound',sound?'on':'off');localStorage.setItem('quiz-arena-haptics',haptics?'on':'off');localStorage.setItem('quiz-arena-theme',theme);localStorage.setItem('quiz-arena-font',fontSize);localStorage.setItem('quiz-arena-round-size',String(roundSize))}catch{}},[sound,haptics,theme,fontSize,roundSize]);
  useEffect(()=>{document.documentElement.dataset.quizTheme=resolvedDark?'dark':'light';return()=>{delete document.documentElement.dataset.quizTheme}},[resolvedDark]);

  useEffect(()=>{if(!isNativeApp)return undefined;let listener:{remove:()=>Promise<void>}|undefined;let disposed=false;CapacitorApp.addListener('backButton',()=>{if(confirmExit)setConfirmExit(false);else if(menuOpen&&menuPage!=='main')setMenuPage('main');else if(menuOpen){setMenuOpen(false);setMenuPage('main')}else if(screen==='quiz')setConfirmExit(true);else if(screen==='result'||screen==='failed')setScreen('start');else void CapacitorApp.exitApp()}).then(handle=>{if(disposed)void handle.remove();else listener=handle});return()=>{disposed=true;if(listener)void listener.remove()}},[isNativeApp,confirmExit,menuOpen,menuPage,screen]);

  const getEligiblePool=()=>eligibleQuestions(category,difficulty,language);
  const getMasteryKey=()=>category+':'+(category.startsWith('Staatsbürgerschaft')?'all':difficulty);

  const startRound=()=>{if(!category)return;const pool=getEligiblePool();const key=getMasteryKey();const saved=mastery[key]||{seen:[],hadMistake:false};const valid=new Set(pool.map(q=>q.id));const validSeen=saved.seen.filter(id=>valid.has(id));const complete=pool.length>0&&validSeen.length>=pool.length;const entry=complete?{seen:[],hadMistake:false}:{seen:validSeen,hadMistake:saved.hadMistake};if(complete)setMastery(prev=>({...prev,[key]:entry}));const seenIds=new Set(entry.seen);const unseen=pool.filter(q=>!seenIds.has(q.id));const desired=roundSize==='max'?unseen.length:Math.min(roundSize,unseen.length);const picked=shuffle(unseen).slice(0,desired);if(!picked.length)return;setLastReward(null);setQuestions(picked.map(shuffleQuestion));setIndex(0);setSelected(null);setHiddenAnswers([]);setRoundJokerUsed(false);setAnswers([]);setScore(0);setStreak(0);setBestRoundStreak(0);setWrongCount(0);setConfirmExit(false);setScreen('quiz')};

  const chooseAnswer=(answerIndex:number)=>{if(!current||selected!==null||confirmExit)return;const correct=answerIndex===current.correct;const nextStreak=correct?streak+1:0;if(correct){const gained=100+Math.min(Math.max(nextStreak-1,0),4)*50;setScore(v=>v+gained);setGain(gained);setProgress(prev=>{const rewarded=addXpRewards(prev,50);return{...rewarded,correct:rewarded.correct+1,bestStreak:Math.max(rewarded.bestStreak,nextStreak)}})}else{setGain(0);setProgress(prev=>({...prev,wrong:prev.wrong+1}))}setStreak(nextStreak);setBestRoundStreak(v=>Math.max(v,nextStreak));setAnswers(prev=>[...prev,correct]);setSelected(answerIndex);const key=getMasteryKey();setMastery(prev=>{const entry=prev[key]||{seen:[],hadMistake:false};const seen=entry.seen.includes(current.id)?entry.seen:[...entry.seen,current.id];return{...prev,[key]:{seen,hadMistake:entry.hadMistake||!correct}}});if(!correct)setWrongCount(v=>v+1);playTone(ensureAudio(),sound,correct);vibrate(haptics,correct)};

  const next=()=>{if(selected===null)return;if(difficulty==='hard'&&wrongCount>=2){setProgress(prev=>({...prev,rounds:prev.rounds+1}));setScreen('failed');return}if(index===questions.length-1){const pool=getEligiblePool();const key=getMasteryKey();const entry=mastery[key]||{seen:[],hadMistake:false};const complete=pool.length>0&&pool.every(q=>entry.seen.includes(q.id));const perfect=complete&&!entry.hadMistake;const rewardXp=perfect?500:0;const rewardStars=perfect?2:0;setLastReward(perfect?{title:'Goldene Wissenskiste',detail:`Perfekter Durchlauf: ${pool.length} von ${pool.length} richtig`,xp:rewardXp,stars:rewardStars}:null);setProgress(prev=>{const rewarded=addXpRewards(prev,Math.floor(score/20)+rewardXp,rewardStars,perfect?1:0);return{...rewarded,rounds:rewarded.rounds+1,bestStreak:Math.max(rewarded.bestStreak,bestRoundStreak)}});setScreen('result');return}setIndex(v=>v+1);setSelected(null);setHiddenAnswers([]);setGain(0)};
  const resetProgress=()=>{setProgress(defaultProgress);setMastery({});setLastReward(null);localStorage.removeItem('quiz-arena-progress');localStorage.removeItem('quiz-arena-mastery')};

  if(screen==='start'){
    const languages=[['DE','🇩🇪','Deutsch'],['EN','🇬🇧','English']];
    const activeTheme=getQuizCategoryTheme(category);
    const activeThemeCopy=CATEGORY_THEME_COPY[language][activeTheme];
    return <main className={`shell appRoot gameHome font-${fontSize.toLowerCase()}`} data-quiz-category-theme={activeTheme}>
      <header className="homeTop"><div className="levelBox"><span className="levelBadge">{level}</span><div className="levelCopy"><strong>Level {level}</strong><small>{rank}</small><div className="progressTrack"><div style={{width:`${xpIntoLevel/5}%`}}/></div></div><div className="levelRewards"><b>★ {progress.stars}</b><small>{xpIntoLevel}/500 XP</small></div></div><button className="menuButton" onClick={()=>{setMenuPage('main');setMenuOpen(true)}} aria-label="Menu"><span/><span/><span/></button></header>
      <section className="gameHero"><BrandLogo className="brandLogoHome"/><div><h1>Quiz <em>Arena</em></h1><p>{t.tag}</p></div></section>
      <aside className="xpGuide">
        <div className="xpGuideHead">
          <div><strong>{mathIntl.formatMessage({id:'QuizMath.xpTitle'})}</strong><p>{mathIntl.formatMessage({id:'QuizMath.xpHelp'})}</p></div>
          <span className="xpGuideBalance">★ {progress.stars}</span>
        </div>
        <div className="xpRewardSteps">
          <div><span>{mathIntl.formatMessage({id:'QuizMath.xpStepXp'})}</span><b>500 XP</b><small>{mathIntl.formatMessage({id:'QuizMath.xpStepLevel'})}</small></div>
          <div><span>{mathIntl.formatMessage({id:'QuizMath.xpStepLevelTitle'})}</span><b>+1 ★</b><small>{mathIntl.formatMessage({id:'QuizMath.xpStepStar'})}</small></div>
          <div className={nextLevelIsMilestone?'nextMilestone':''}><span>{mathIntl.formatMessage({id:'QuizMath.xpStepMilestone'})}</span><b>+2 ★</b><small>{mathIntl.formatMessage({id:'QuizMath.xpStepChest'})}</small></div>
        </div>
        <div className="xpNextReward">
          <span>{mathIntl.formatMessage({id:'QuizMath.xpNext'}, {xp:xpToNextLevel,level:nextLevel})}</span>
          <b>{mathIntl.formatMessage({id:nextLevelIsMilestone?'QuizMath.xpNextRewardMilestone':'QuizMath.xpNextReward'})}</b>
        </div>
        <small className="xpHardRule">{mathIntl.formatMessage({id:'QuizMath.xpHardRule'})}</small>
      </aside>
      <section className="panel categoryPanel"><div className="categoryHeading"><div><h2>{language==='DE'?'Kategorie wählen':'Choose a category'}</h2><p>{language==='DE'?'Wähle ein Thema für deine nächste Runde.':'Pick a topic for your next round.'}</p></div><button className={`difficultyQuickSwitch ${difficulty}`} onClick={toggleDifficulty} aria-label={`${t.difficulty}: ${difficulty==='hard'?t.hard:t.easy}. ${t.switchDifficulty}`}><span className={difficulty==='easy'?'active':''}>{t.easy}</span><span className={difficulty==='hard'?'active':''}>{t.hard}</span></button></div>
      <div className="categoryList">
      {mathOpen ? <>
        <button className="categoryRow citizenshipBack" data-category-theme="math" onClick={() => setMathOpen(false)}>
          <span className="categoryIcon">‹</span><span className="categoryName">{categoryLabel('Mathe')}</span>
          <span className="categoryCount">{eligibleQuestions('Mathe',difficulty,language).length}</span>
        </button>
        {[{key:'Mathe'}, ...MATH_TOPICS].map(item => <button key={item.key}
          className={category===item.key?'categoryRow active citizenshipTopic':'categoryRow citizenshipTopic'}
          data-category-theme={getQuizCategoryTheme(item.key)}
          onClick={() => setCategory(item.key)}>
          <span className="categoryIcon"><CategoryIcon category={item.key}/></span>
          <span className="categoryName">{item.key==='Mathe'?mathIntl.formatMessage({id:'QuizMath.mixed'}):categoryLabel(item.key)}</span>
          <span className="categoryCount">{eligibleQuestions(item.key,difficulty,language).length}</span>
          <span className="categoryMark">{category===item.key?'✓':'›'}</span>
        </button>)}
      </> : historyOpen?<><button className="categoryRow citizenshipBack" data-category-theme="history" onClick={()=>setHistoryOpen(false)}><span className="categoryIcon">‹</span><span className="categoryName">{categoryLabel('Geschichte')}</span><span className="categoryCount">{difficulty==='hard'?180:350}</span><span className="categoryMark">⌃</span></button>{HISTORY_TOPICS.map(item=>{const pool=QUESTIONS.filter(q=>q.category===item.key);const count=pool.filter(q=>difficulty==='hard'?isHardQuestion(q):!isHardQuestion(q)).length;const active=category===item.key;return <button key={item.key} className={active?'categoryRow active citizenshipTopic':'categoryRow citizenshipTopic'} data-category-theme={getQuizCategoryTheme(item.key)} onClick={()=>setCategory(item.key)}><span className="categoryIcon"><CategoryIcon category={item.key}/></span><span className="categoryName">{categoryLabel(item.key)}</span><span className="categoryCount">{count}</span><span className={active?'categoryMark selected':'categoryMark'}>{active?'✓':'›'}</span></button>})}</>:
      citizenshipOpen?<><button className="categoryRow citizenshipBack" data-category-theme="citizenship" onClick={()=>setCitizenshipOpen(false)}><span className="categoryIcon">‹</span><span className="categoryName">{categoryLabel('Staatsbürgerschaft')}</span><span className="categoryCount">159</span><span className="categoryMark">⌃</span></button>{CITIZENSHIP_TOPICS.map(item=>{const active=category===item;return <button key={item} className={active?'categoryRow active citizenshipTopic':'categoryRow citizenshipTopic'} data-category-theme={getQuizCategoryTheme(item)} onClick={()=>setCategory(item)}><span className="categoryIcon"><CategoryIcon category={item}/></span><span className="categoryName">{categoryLabel(item)}</span><span className="categoryCount">{QUESTIONS.filter(q=>q.category===item).length}</span><span className={active?'categoryMark selected':'categoryMark'}>{active?'✓':'›'}</span></button>})}</>:
      CATEGORIES.map(item=>{const citizenship=item==='Staatsbürgerschaft';const history=item==='Geschichte';const math=item==='Mathe';const pool=math?eligibleQuestions('Mathe',difficulty,language):citizenship?QUESTIONS.filter(q=>q.category.startsWith('Staatsbürgerschaft')):history?QUESTIONS.filter(q=>q.category.startsWith('Geschichte ')):QUESTIONS.filter(q=>item==='Alle'||q.category===item);const count=citizenship?pool.length:pool.filter(q=>(language==='DE'||!expansionIds.has(q.id))&&(difficulty==='hard'?isHardQuestion(q):!isHardQuestion(q))).length;const active=math?category.startsWith('Mathe'):citizenship?category.startsWith('Staatsbürgerschaft'):history?category.startsWith('Geschichte '):category===item;const click=()=>{setMathOpen(false);if(math){setCategory('Mathe');setMathOpen(true);setHistoryOpen(false);setCitizenshipOpen(false)}else if(citizenship){if(!category.startsWith('Staatsbürgerschaft'))setCategory('Staatsbürgerschaft Österreich');setHistoryOpen(false);setCitizenshipOpen(true)}else if(history){if(!category.startsWith('Geschichte '))setCategory(HISTORY_TOPICS[0].key);setCitizenshipOpen(false);setHistoryOpen(true)}else{setHistoryOpen(false);setCitizenshipOpen(false);setCategory(item)}};return <button key={item} className={active?'categoryRow active':'categoryRow'} data-category={item} data-category-theme={getQuizCategoryTheme(item)} onClick={click}><span className="categoryIcon"><CategoryIcon category={item}/></span><span className="categoryName">{categoryLabel(item)}</span><span className="categoryCount">{count}</span><span className={active&&!citizenship&&!history&&!math?'categoryMark selected':'categoryMark'}>{citizenship||history||math?'›':active?'✓':'›'}</span></button>})}
      </div></section>
      {category&&<section className="categoryThemePreview" aria-label={activeThemeCopy.eyebrow}>
        <div className="categoryThemeScene" aria-hidden="true"/>
        <div className="categoryThemePreviewCopy">
          <span className="categoryThemeEyebrow"><CategoryIcon category={category}/>{activeThemeCopy.eyebrow}</span>
          <strong>{categoryLabel(category)}</strong>
          <h3>{activeThemeCopy.title}</h3>
          <p>{activeThemeCopy.detail}</p>
        </div>
        <span className="categoryThemePreviewMark" aria-hidden="true">›</span>
      </section>}
      <button className="playButton" disabled={!category} onClick={()=>{ensureAudio();startRound()}}>{t.play}</button>
      <button className="statsButton" onClick={()=>{setMenuPage('stats');setMenuOpen(true)}}>{t.stats}</button>
      {menuOpen&&<div className="drawerLayer" onClick={()=>{setMenuOpen(false);setMenuPage('main')}}><aside className="drawer" onClick={e=>e.stopPropagation()} aria-label={t.settings}><div className="drawerHead"><div className="drawerBrandRow"><BrandLogo className="brandLogoDrawer"/><div className="drawerBrandBlock"><b className="drawerBrand">Quiz <em>Arena</em></b><small>{t.tag}</small></div></div><button className="drawerClose" onClick={()=>{setMenuOpen(false);setMenuPage('main')}} aria-label="Menü schließen">×</button></div>
      {menuPage==='main'?<><div className="menuGroup"><h3>🌐 {t.languageLabel}</h3>{languages.map(([code,flag,label])=><button key={code} className={language===code?'language active':'language'} onClick={()=>{setLanguage(code as 'DE'|'EN');localStorage.setItem('quiz-arena-language',code)}}><span>{flag}</span>{label}<b>{language===code?'✓':''}</b></button>)}</div><div className="menuGroup settings"><h3>⚙ {t.settings}</h3><div className="settingBlock"><div className="settingBlockTitle"><span>☷</span><div><b>{t.difficulty}</b><small>{difficulty==='hard'?t.hardSub:t.easySub}</small></div></div><div className="segmented two"><button className={difficulty==='easy'?'active':''} onClick={()=>setDifficultyValue('easy')}>{t.easy}</button><button className={difficulty==='hard'?'active':''} onClick={()=>setDifficultyValue('hard')}>{t.hard}</button></div></div><label className="toggleRow"><span>🔊 <b>{t.sound}</b><small>{t.soundSub}</small></span><input type="checkbox" checked={sound} onChange={e=>setSound(e.target.checked)}/></label><label className={`toggleRow ${vibrationSupported?'':'disabled'}`}><span>📱 <b>{t.vibration}</b><small>{vibrationSupported?t.vibrationSub:t.notAvailable}</small></span><input type="checkbox" checked={haptics&&vibrationSupported} disabled={!vibrationSupported} onChange={e=>setHaptics(e.target.checked)}/></label><div className="settingBlock"><div className="settingBlockTitle"><span>◐</span><div><b>{t.design}</b><small>{theme}</small></div></div><div className="segmented three"><button className={theme==='Hell'?'active':''} onClick={()=>setTheme('Hell')}>{t.light}</button><button className={theme==='Dunkel'?'active':''} onClick={()=>setTheme('Dunkel')}>{t.dark}</button><button className={theme==='Auto'?'active':''} onClick={()=>setTheme('Auto')}>{t.auto}</button></div></div><div className="settingBlock"><div className="settingBlockTitle"><span>AA</span><div><b>{t.font}</b><small>{fontSize}</small></div></div><div className="segmented three"><button className={fontSize==='Klein'?'active':''} onClick={()=>setFontSize('Klein')}>{t.small}</button><button className={fontSize==='Normal'?'active':''} onClick={()=>setFontSize('Normal')}>{t.normal}</button><button className={fontSize==='Groß'?'active':''} onClick={()=>setFontSize('Groß')}>{t.large}</button></div></div><div className="settingBlock"><div className="settingBlockTitle"><span>☷</span><div><b>{t.round}</b><small>{roundSize==='max'?'Max':roundSize} {t.questions}</small></div></div><div className="segmented four"><button className={roundSize===5?'active':''} onClick={()=>setRoundSize(5)}>5</button><button className={roundSize===10?'active':''} onClick={()=>setRoundSize(10)}>10</button><button className={roundSize===15?'active':''} onClick={()=>setRoundSize(15)}>15</button><button className={roundSize==='max'?'active':''} onClick={()=>setRoundSize('max')}>Max</button></div></div></div><div className="menuGroup"><button className="menuRow" onClick={()=>setMenuPage('stats')}><span>▥ <b>{t.statistics}</b><small>{progress.rounds} {t.rounds} · {progress.correct} {t.correct}</small></span><b>›</b></button><button className="menuRow" onClick={()=>setMenuPage('achievements')}><span>♜ <b>{t.achievements}</b><small>{achievements.filter(a=>a.unlocked).length}/{achievements.length} {t.badges}</small></span><b>›</b></button></div><div className="menuGroup"><div className="menuInfo"><b>ⓘ {t.about}</b><small>Quiz Arena v1.0.0</small></div><div className="menuInfo"><b>⬡ {t.privacy}</b><small>{t.privacyText}</small></div><button className="resetLink" onClick={resetProgress}>{t.reset}</button></div></>:
      menuPage==='stats'?<div className="drawerDetail"><div className="detailNav"><button onClick={()=>setMenuPage('main')} aria-label="Zurück">‹</button><div><small>DEIN PROFIL</small><h2>{t.statistics}</h2></div></div><section className="statsHero"><div className="statsRankBadge">{level}</div><div><small>AKTUELLER RANG</small><strong>{rank}</strong><span>Level {level} · {progress.xp} XP</span></div><div className="statsStars">★ {progress.stars}</div></section><div className="statsDetailGrid"><div><span>Runden</span><strong>{progress.rounds}</strong></div><div><span>Richtig</span><strong>{progress.correct}</strong></div><div><span>Falsch</span><strong>{progress.wrong}</strong></div><div><span>Genauigkeit</span><strong>{lifetimeAccuracy}%</strong></div><div><span>Beste Serie</span><strong>{progress.bestStreak}</strong></div><div><span>Perfekt</span><strong>{progress.gifts}</strong></div><div><span>Levelkisten</span><strong>{progress.levelChests}</strong></div><div><span>Joker genutzt</span><strong>{progress.jokerUses}</strong></div></div><section className="detailSection"><div className="detailSectionHead"><h3>Fortschritt pro Kategorie</h3></div><div className="categoryProgressList">{categoryStats.map(item=><div className="categoryProgressRow" data-category-theme={getQuizCategoryTheme(item.label)} key={item.label}><div className="categoryProgressCopy"><span><CategoryIcon category={item.label}/></span><div><b>{item.title}</b><small>{item.seen}/{item.total} Fragen</small></div></div><strong>{item.percent}%</strong><div className="miniProgress"><i style={{width:item.percent+'%'}}/></div></div>)}</div></section></div>:
      <div className="drawerDetail"><div className="detailNav"><button onClick={()=>setMenuPage('main')} aria-label="Zurück">‹</button><div><small>DEINE SAMMLUNG</small><h2>{t.achievements}</h2></div></div><section className="achievementSummary"><strong>{achievements.filter(a=>a.unlocked).length}/{achievements.length}</strong><span>Abzeichen freigeschaltet</span><div className="miniProgress"><i style={{width:Math.round(achievements.filter(a=>a.unlocked).length/achievements.length*100)+'%'}}/></div></section><div className="achievementList">{achievements.map(item=>{const pct=Math.min(100,Math.round(Math.min(item.current,item.target)/item.target*100));return <article key={item.label} className={item.unlocked?'achievementCard unlocked':'achievementCard locked'}><div className="achievementIcon"><AchievementIcon label={item.label}/></div><div className="achievementCopy"><div><strong>{item.label}</strong><em className={'achievementTier tier'+item.tier}>{item.tier}</em></div><p>{item.description}</p><div className="achievementCounter"><span>{item.unlocked?'Freigeschaltet':item.current+'/'+item.target}</span></div><div className="miniProgress"><i style={{width:pct+'%'}}/></div></div></article>})}</div></div>}
      </aside></div>}
    </main>
  }

  if(screen==='failed')return <main className={`shell appRoot result failScreen font-${fontSize.toLowerCase()}`} data-quiz-category-theme={getQuizCategoryTheme(category)}><div className="trophy">×</div><p className="eyebrow">{t.failed}</p><h1>{t.mistakesFail}</h1><p className="muted">{t.hardSub}</p><button className="primary" onClick={startRound}>{t.restart}</button><button className="ghost wide" onClick={()=>setScreen('start')}>{t.home}</button></main>;
  if(screen==='result'){const correctCount=answers.filter(Boolean).length;return <main className={`shell appRoot result font-${fontSize.toLowerCase()}`} data-quiz-category-theme={getQuizCategoryTheme(category)}><div className="trophy">★</div><p className="eyebrow">{t.finished}</p><h1>{score} {t.points}</h1><section className="stats resultStats"><div><span>{t.correctLabel}</span><strong>{correctCount}/{questions.length}</strong></div><div><span>{t.accuracy}</span><strong>{accuracy}%</strong></div><div><span>{t.best}</span><strong>{bestRoundStreak}</strong></div><div><span>{t.levelLabel}</span><strong>{Math.floor(progress.xp/500)+1}</strong></div></section>{lastReward&&<section className="rewardCard"><div className="rewardGift">🎁</div><div><strong>{lastReward.title}</strong><span>{lastReward.detail}</span><b>+{lastReward.xp} XP · +{lastReward.stars} ★</b></div></section>}<section className="panel"><div className="panelTitle"><span>{t.progress}</span><small>{progress.xp} {t.totalXp}</small></div><div className="progressTrack"><div style={{width:`${progress.xp%500/5}%`}}/></div></section><button className="primary" onClick={startRound}>{t.again}</button><button className="ghost wide" onClick={()=>setScreen('start')}>{t.home}</button></main>}
  if(!current)return null;
  return <main className={`shell appRoot quizShell font-${fontSize.toLowerCase()}`} data-quiz-category-theme={getQuizCategoryTheme(current.category)}><header className="quizHeader"><div><span>{t.question} {index+1}/{questions.length}</span><strong>{score} {t.points}</strong></div><button className="exit" onClick={()=>setConfirmExit(true)} aria-label={t.leave}>×</button></header><div className="progressTrack"><div style={{width:`${(index+1)/questions.length*100}%`}}/></div><section className="questionCard"><div className="questionMeta"><p className="eyebrow">{categoryLabel(current.category).toUpperCase()}</p></div><h2>{current.question}</h2><div className="jokerBar"><span>Wissenssterne <b>★ {progress.stars}</b></span><button disabled={selected!==null||hiddenAnswers.length>0||progress.stars<1||(difficulty==='hard'&&roundJokerUsed)} onClick={()=>{if(!current||selected!==null||hiddenAnswers.length>0||progress.stars<1||(difficulty==='hard'&&roundJokerUsed))return;const wrong=current.answers.map((_,i)=>i).filter(i=>i!==current.correct);setHiddenAnswers(shuffle(wrong).slice(0,2));if(difficulty==='hard')setRoundJokerUsed(true);setProgress(prev=>({...prev,stars:Math.max(0,prev.stars-1),jokerUses:prev.jokerUses+1}))}}>{difficulty==='hard'&&roundJokerUsed?'50:50 benutzt':'50:50 · 1 ★'}</button></div><div className="answers">{current.answers.map((answer,answerIndex)=>{if(hiddenAnswers.includes(answerIndex))return null;const isCorrect=selected!==null&&answerIndex===current.correct;const isWrong=selected===answerIndex&&answerIndex!==current.correct;const locked=selected!==null||confirmExit;return <div key={`${answerIndex}-${answer}`} className={`${isCorrect?'answer correct':isWrong?'answer wrong':'answer'}${locked?' locked':''}`} role="button" aria-disabled={locked} tabIndex={locked?-1:0} onClick={()=>{if(!locked)chooseAnswer(answerIndex)}} onKeyDown={e=>{if(!locked&&(e.key==='Enter'||e.key===' ')){e.preventDefault();chooseAnswer(answerIndex)}}}><span>{answerIndex+1}</span>{answer}</div>})}</div>{gain>0&&<div className="gainPop" key={`gain-${index}`}>+{gain}</div>}{selected!==null&&current.explanation&&<p className="questionExplanation"><b>{mathIntl.formatMessage({ id: current.category.startsWith('Mathe ') ? 'QuizMath.solution' : 'QuizMath.explanation' })}:</b> {current.explanation}</p>}{selected!==null&&current.source&&<p className="questionSource">{language==='DE'?'Quelle':'Source'}: {current.source}</p>}{selected!==null&&<button className="primary" onClick={next}>{difficulty==='hard'&&wrongCount>=2?t.next:index===questions.length-1?t.result:t.next}</button>}</section><div className="streak">{t.streak}: {streak} ⚡</div>{confirmExit&&<div className="overlay" role="dialog" aria-modal="true"><div className="dialog"><h3>{t.leaveTitle}</h3><p>{t.leaveText}</p><button className="primary" onClick={()=>setConfirmExit(false)}>{t.continue}</button><button className="ghost wide" onClick={()=>{setConfirmExit(false);setScreen('start')}}>{t.leave}</button></div></div>}</main>;
}

export default QuizArenaLiveAppV2;
