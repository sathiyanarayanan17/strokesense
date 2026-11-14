import type { RiskTier } from "./scoring/risk";
import type { Finding, Side, TestId, TestResult } from "./scoring/types";

/**
 * Family-facing text in English, Hindi and Tamil.
 *
 * All medical wording comes from these fixed templates rather than a generative
 * model, so the app cannot invent advice. Hindi and Tamil strings should be
 * reviewed by a native speaker (ideally a clinician) before real-world use.
 */

export type Lang = "en" | "hi" | "ta";

export const LANGS: Array<{ code: Lang; name: string; speechLang: string }> = [
  { code: "en", name: "English", speechLang: "en-IN" },
  { code: "hi", name: "हिन्दी", speechLang: "hi-IN" },
  { code: "ta", name: "தமிழ்", speechLang: "ta-IN" },
];

type OnsetWindow = "early" | "day" | "late";

interface Dict {
  tier: Record<RiskTier, { headline: string; advice: string }>;
  finding: Record<Finding, string>;
  test: Record<TestId, string>;
  side: Record<Side, string>;
  explainSide: Record<"face" | "arm", (side: string | null) => string>;
  explain: Record<"speech" | "balance" | "eyes", string>;
  normal: string;
  inconclusive: string;
  lastKnownWell: string;
  onsetUnknown: string;
  ago: (h: number, m: number) => string;
  onset: Record<OnsetWindow, string>;
  call108: string;
  call112: string;
  disclaimer: string;
  readAloud: string;
  noVoice: string;
}

const en: Dict = {
  tier: {
    emergency: {
      headline: "Warning signs of stroke detected",
      advice: 'Call emergency services now. Say "suspected stroke" and give the time the person was last seen well.',
    },
    possible: {
      headline: "Possible warning signs",
      advice: "Do not wait to see if it gets better. Call emergency services and mention a possible stroke.",
    },
    inconclusive: {
      headline: "Some checks could not be completed",
      advice:
        "If you notice ANY sudden face drooping, arm weakness, speech trouble, vision loss or loss of balance, call emergency services immediately.",
    },
    "no-signs": {
      headline: "No warning signs detected",
      advice: "This check cannot rule out a stroke. If symptoms appear, return, or you are worried, call emergency services anyway.",
    },
  },
  finding: { abnormal: "Warning sign", borderline: "Possible sign", normal: "No sign", inconclusive: "Not assessed" },
  test: { balance: "Balance", eyes: "Eyes", face: "Face", arm: "Arms", speech: "Speech" },
  side: { left: "left", right: "right" },
  explainSide: {
    face: (s) => (s ? `The ${s} side of the face moved less when smiling.` : "One side of the face moved less when smiling."),
    arm: (s) => (s ? `The ${s} arm drifted down or could not be held up.` : "One arm drifted down or could not be held up."),
  },
  explain: {
    speech: "Speech may be slurred, or some words may be wrong.",
    balance: "A sudden balance problem was reported.",
    eyes: "A sudden vision problem was reported.",
  },
  normal: "No warning sign was found in this check.",
  inconclusive: "This check could not be completed.",
  lastKnownWell: "Last known well",
  onsetUnknown: "Unknown. Tell the emergency team when the person was last seen normal.",
  ago: (h, m) => (h > 0 ? `${h} h ${m} min ago` : `${m} min ago`),
  onset: {
    early: "Still within the early window when clot-dissolving treatment may be possible. Every minute counts.",
    day: "Some treatments may still be possible. Get to hospital without delay.",
    late: "Tell the medical team exactly when symptoms began.",
  },
  call108: "Call 108 (Ambulance)",
  call112: "Call 112 (Emergency)",
  disclaimer:
    "StrokeSense is a screening aid, not a diagnosis. It can miss strokes and can raise false alarms. If in doubt, always call emergency services.",
  readAloud: "Read aloud",
  noVoice: "This device has no voice for this language.",
};

const hi: Dict = {
  tier: {
    emergency: {
      headline: "स्ट्रोक के चेतावनी संकेत मिले",
      advice: 'अभी आपातकालीन सेवा को कॉल करें। "संभावित स्ट्रोक" बताएं और व्यक्ति को आखिरी बार ठीक देखे जाने का समय बताएं।',
    },
    possible: {
      headline: "संभावित चेतावनी संकेत",
      advice: "ठीक होने का इंतज़ार न करें। आपातकालीन सेवा को कॉल करें और संभावित स्ट्रोक बताएं।",
    },
    inconclusive: {
      headline: "कुछ जांचें पूरी नहीं हो सकीं",
      advice:
        "अगर अचानक चेहरा लटकना, हाथ में कमज़ोरी, बोलने में दिक्कत, दिखना बंद होना या संतुलन बिगड़ना दिखे, तो तुरंत आपातकालीन सेवा को कॉल करें।",
    },
    "no-signs": {
      headline: "कोई चेतावनी संकेत नहीं मिला",
      advice: "यह जांच स्ट्रोक को पूरी तरह खारिज नहीं कर सकती। लक्षण दिखें या आप चिंतित हों, तो फिर भी आपातकालीन सेवा को कॉल करें।",
    },
  },
  finding: { abnormal: "चेतावनी संकेत", borderline: "संभावित संकेत", normal: "कोई संकेत नहीं", inconclusive: "जांच नहीं हुई" },
  test: { balance: "संतुलन", eyes: "आंखें", face: "चेहरा", arm: "हाथ", speech: "बोली" },
  side: { left: "बायां", right: "दायां" },
  explainSide: {
    face: (s) => (s ? `मुस्कुराते समय चेहरे का ${s} हिस्सा कम हिला।` : "मुस्कुराते समय चेहरे का एक हिस्सा कम हिला।"),
    arm: (s) => (s ? `${s} हाथ नीचे गिरा या ऊपर नहीं रुक सका।` : "एक हाथ नीचे गिरा या ऊपर नहीं रुक सका।"),
  },
  explain: {
    speech: "बोली अस्पष्ट हो सकती है, या कुछ शब्द गलत हो सकते हैं।",
    balance: "अचानक संतुलन बिगड़ने की बात बताई गई।",
    eyes: "अचानक देखने में समस्या की बात बताई गई।",
  },
  normal: "इस जांच में कोई चेतावनी संकेत नहीं मिला।",
  inconclusive: "यह जांच पूरी नहीं हो सकी।",
  lastKnownWell: "आखिरी बार ठीक देखे गए",
  onsetUnknown: "पता नहीं। आपातकालीन टीम को बताएं कि व्यक्ति आखिरी बार कब सामान्य दिखे थे।",
  ago: (h, m) => (h > 0 ? `${h} घंटे ${m} मिनट पहले` : `${m} मिनट पहले`),
  onset: {
    early: "क्लॉट घोलने वाले इलाज की शुरुआती समय-सीमा अभी बाकी हो सकती है। हर मिनट कीमती है।",
    day: "कुछ इलाज अब भी संभव हो सकते हैं। बिना देर किए अस्पताल पहुंचें।",
    late: "मेडिकल टीम को ठीक-ठीक बताएं कि लक्षण कब शुरू हुए।",
  },
  call108: "108 पर कॉल करें (एम्बुलेंस)",
  call112: "112 पर कॉल करें (आपातकाल)",
  disclaimer:
    "StrokeSense केवल एक स्क्रीनिंग सहायक है, निदान नहीं। यह स्ट्रोक को चूक सकता है और गलत चेतावनी भी दे सकता है। शक हो तो हमेशा आपातकालीन सेवा को कॉल करें।",
  readAloud: "पढ़कर सुनाएं",
  noVoice: "इस डिवाइस में इस भाषा की आवाज़ उपलब्ध नहीं है।",
};

const ta: Dict = {
  tier: {
    emergency: {
      headline: "பக்கவாத எச்சரிக்கை அறிகுறிகள் கண்டறியப்பட்டன",
      advice: 'உடனே அவசர சேவையை அழைக்கவும். "பக்கவாதம் சந்தேகம்" என்று கூறி, அவர் கடைசியாக நலமாக இருந்த நேரத்தைத் தெரிவிக்கவும்.',
    },
    possible: {
      headline: "சாத்தியமான எச்சரிக்கை அறிகுறிகள்",
      advice: "சரியாகும் என்று காத்திருக்க வேண்டாம். அவசர சேவையை அழைத்து பக்கவாதம் இருக்கலாம் என்று கூறவும்.",
    },
    inconclusive: {
      headline: "சில சோதனைகளை முடிக்க முடியவில்லை",
      advice:
        "திடீரென முகம் தொங்குதல், கை பலவீனம், பேச்சுச் சிரமம், பார்வை இழப்பு அல்லது சமநிலை இழப்பு ஏதேனும் தெரிந்தால், உடனே அவசர சேவையை அழைக்கவும்.",
    },
    "no-signs": {
      headline: "எச்சரிக்கை அறிகுறிகள் இல்லை",
      advice: "இந்தச் சோதனை பக்கவாதத்தை முழுமையாக நிராகரிக்காது. அறிகுறிகள் தோன்றினால் அல்லது கவலையாக இருந்தால், அவசர சேவையை அழைக்கவும்.",
    },
  },
  finding: { abnormal: "எச்சரிக்கை அறிகுறி", borderline: "சாத்தியமான அறிகுறி", normal: "அறிகுறி இல்லை", inconclusive: "சோதிக்கப்படவில்லை" },
  test: { balance: "சமநிலை", eyes: "கண்கள்", face: "முகம்", arm: "கைகள்", speech: "பேச்சு" },
  side: { left: "இடது", right: "வலது" },
  explainSide: {
    face: (s) => (s ? `சிரிக்கும்போது முகத்தின் ${s} பக்கம் குறைவாக அசைந்தது.` : "சிரிக்கும்போது முகத்தின் ஒரு பக்கம் குறைவாக அசைந்தது."),
    arm: (s) => (s ? `${s} கை கீழே இறங்கியது அல்லது உயர்த்தி வைக்க முடியவில்லை.` : "ஒரு கை கீழே இறங்கியது அல்லது உயர்த்தி வைக்க முடியவில்லை."),
  },
  explain: {
    speech: "பேச்சு குழறலாக இருக்கலாம், அல்லது சில வார்த்தைகள் தவறாக இருக்கலாம்.",
    balance: "திடீர் சமநிலை இழப்பு தெரிவிக்கப்பட்டது.",
    eyes: "திடீர் பார்வை பிரச்சனை தெரிவிக்கப்பட்டது.",
  },
  normal: "இந்தச் சோதனையில் எச்சரிக்கை அறிகுறி எதுவும் இல்லை.",
  inconclusive: "இந்தச் சோதனையை முடிக்க முடியவில்லை.",
  lastKnownWell: "கடைசியாக நலமாக இருந்தது",
  onsetUnknown: "தெரியவில்லை. அவர் கடைசியாக எப்போது இயல்பாக இருந்தார் என்பதை அவசரக் குழுவிடம் சொல்லவும்.",
  ago: (h, m) => (h > 0 ? `${h} மணி ${m} நிமிடம் முன்பு` : `${m} நிமிடம் முன்பு`),
  onset: {
    early: "இரத்த உறைவைக் கரைக்கும் சிகிச்சைக்கான ஆரம்ப நேரம் இன்னும் இருக்கலாம். ஒவ்வொரு நிமிடமும் முக்கியம்.",
    day: "சில சிகிச்சைகள் இன்னும் சாத்தியமாக இருக்கலாம். தாமதமின்றி மருத்துவமனைக்குச் செல்லவும்.",
    late: "அறிகுறிகள் எப்போது தொடங்கின என்பதை மருத்துவக் குழுவிடம் சரியாகச் சொல்லவும்.",
  },
  call108: "108 அழைக்கவும் (ஆம்புலன்ஸ்)",
  call112: "112 அழைக்கவும் (அவசரம்)",
  disclaimer:
    "StrokeSense ஒரு முன்னோட்டப் பரிசோதனை உதவி மட்டுமே, நோயறிதல் அல்ல. இது பக்கவாதத்தைத் தவறவிடலாம் அல்லது தவறான எச்சரிக்கை தரலாம். சந்தேகம் இருந்தால் எப்போதும் அவசர சேவையை அழைக்கவும்.",
  readAloud: "சத்தமாகப் படிக்கவும்",
  noVoice: "இந்தச் சாதனத்தில் இந்த மொழிக்கான குரல் இல்லை.",
};

export const DICTS: Record<Lang, Dict> = { en, hi, ta };

/** Plain-language, family-facing explanation of one test result. */
export function explainResult(r: Pick<TestResult, "test" | "finding" | "weakerSide">, lang: Lang): string {
  const d = DICTS[lang];
  if (r.finding === "normal") return d.normal;
  if (r.finding === "inconclusive") return d.inconclusive;
  if (r.test === "face" || r.test === "arm") return d.explainSide[r.test](r.weakerSide ? d.side[r.weakerSide] : null);
  return d.explain[r.test];
}
